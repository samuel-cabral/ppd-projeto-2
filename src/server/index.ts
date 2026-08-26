/**
 * Thread principal: HTTP + WebSocket. Somente entrada e saida.
 * Nao calcula regra de jogo — encaminha intencoes para o worker da partida
 * e devolve o que ele responder. Ver docs/02-arquitetura.md.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Color, ServerMessage, ToWorker } from '../shared/protocol.js';
import { parseClientMessage } from '../shared/protocol.js';
import { ERROR_TEXT, MatchRegistry, type Match } from './registry.js';

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = fileURLToPath(new URL('../client/', import.meta.url));

const registry = new MatchRegistry();

// --- HTTP: cria partidas e entrega o build do cliente ----------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function serveStatic(res: ServerResponse, urlPath: string): void {
  // normalize + prefixo obrigatorio impedem sair de CLIENT_DIR com '..'.
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let file = join(CLIENT_DIR, rel);
  if (!file.startsWith(CLIENT_DIR)) file = join(CLIENT_DIR, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(CLIENT_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Cliente nao compilado. Rode `npm run build` ou use `npm run dev`.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/match' && req.method === 'POST') {
    const match = registry.create();
    if (!match) return json(res, 503, { error: 'SERVER_BUSY', message: ERROR_TEXT.SERVER_BUSY });
    return json(res, 201, { matchId: match.id });
  }

  if (url.pathname === '/api/match' && req.method === 'GET') {
    const id = url.searchParams.get('id') ?? '';
    const match = registry.get(id);
    if (!match) return json(res, 404, { error: 'MATCH_NOT_FOUND' });
    const seats = (['W', 'B'] as const).filter((c) => match.seats[c]).length;
    return json(res, 200, { matchId: match.id, seats });
  }

  serveStatic(res, url.pathname);
});

// --- WebSocket: uma conexao por jogador ------------------------------------

const wss = new WebSocketServer({ server: http, path: '/ws' });

/** Contexto que a thread principal guarda por socket, fora do worker. */
interface Session {
  match: Match;
  playerId: string;
  color: Color;
}

const sessions = new WeakMap<WebSocket, Session>();
/** ping/pong nativo do RFC 6455 — detecta queda silenciosa (protocolo 4.3). */
const alive = new WeakMap<WebSocket, boolean>();

function reply(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

wss.on('connection', (socket: WebSocket) => {
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  socket.on('message', (raw) => {
    const msg = parseClientMessage(raw.toString());
    if (!msg) return;

    if (msg.t === 'join') {
      const match = registry.get(msg.matchId);
      if (!match) {
        return reply(socket, {
          t: 'error',
          code: 'MATCH_NOT_FOUND',
          message: ERROR_TEXT.MATCH_NOT_FOUND,
        });
      }
      const seat = registry.join(match, socket, msg.playerId);
      if ('error' in seat) {
        return reply(socket, { t: 'error', code: seat.error, message: ERROR_TEXT[seat.error] });
      }
      sessions.set(socket, { match, playerId: seat.playerId, color: seat.color });
      reply(socket, {
        t: 'joined',
        playerId: seat.playerId,
        color: seat.color,
        matchId: match.id,
      });
      registry.replayChat(socket, match);
      // O outro assento ja esta ocupado e vivo? Quem entra tambem precisa saber.
      const peer = match.seats[seat.color === 'W' ? 'B' : 'W'];
      reply(socket, { t: 'peer', status: peer?.socket ? 'connected' : 'disconnected' });
      if (match.lastSnapshot) reply(socket, { t: 'state', snapshot: match.lastSnapshot });
      return;
    }

    const session = sessions.get(socket);
    if (!session) {
      return reply(socket, {
        t: 'error',
        code: 'MATCH_NOT_FOUND',
        message: 'Entre em uma partida antes.',
      });
    }
    const { match, playerId } = session;

    switch (msg.t) {
      case 'move':
        registry.toWorker(match, {
          t: 'intent',
          playerId,
          move: { from: msg.from, to: msg.to, kind: msg.kind },
        } satisfies ToWorker);
        return;
      case 'endTurn':
        registry.toWorker(match, { t: 'endTurn', playerId } satisfies ToWorker);
        return;
      case 'resign':
        registry.toWorker(match, { t: 'resign', playerId } satisfies ToWorker);
        return;
      case 'chat':
        // Retransmitido aqui mesmo: o chat nunca entra no worker (ADR-005),
        // por isso continua funcionando enquanto o bot pensa.
        if (msg.text.trim()) registry.postChat(match, session.color, msg.text.trim());
        return;
    }
  });

  socket.on('close', () => {
    const session = sessions.get(socket);
    if (session) registry.disconnect(session.match, session.color, socket);
  });

  socket.on('error', () => socket.close());
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

http.listen(PORT, () => {
  console.log(`Fanorona ouvindo em http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    clearInterval(heartbeat);
    registry.destroyAll();
    http.close(() => process.exit(0));
  });
}
