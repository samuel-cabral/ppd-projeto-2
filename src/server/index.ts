/**
 * Thread principal: HTTP + servidor RPC. Somente entrada e saida.
 * Nao calcula regra de jogo — cada operacao remota encaminha a intencao para
 * o worker da partida e devolve o que ele responder. Ver docs/08-rpc.md.
 *
 * O WebSocket aqui e so o TRANSPORTE das mensagens JSON-RPC, como o TCP e o
 * transporte do Java RMI: nenhuma regra de comunicacao do jogo e escrita em
 * cima dele, tudo e chamada de metodo da interface `FanoronaServer`.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Color, ErrorCode, FanoronaClient, FanoronaServer } from '../shared/protocol.js';
import { parseChat, parseJoin, parseMove } from '../shared/protocol.js';
import { RPC, RpcError, RpcPeer, type Handlers } from '../shared/rpc.js';
import { type Conn, ERROR_TEXT, MatchRegistry, type Match } from './registry.js';

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

// --- RPC: uma conexao (um peer) por jogador --------------------------------

const wss = new WebSocketServer({ server: http, path: '/rpc' });

/** Contexto guardado por conexao depois do `join`. */
interface Session {
  match: Match;
  playerId: string;
  color: Color;
}

/** ping/pong nativo do RFC 6455 — detecta queda silenciosa (protocolo 4.3). */
const alive = new WeakMap<WebSocket, boolean>();

/** Recusa de regra do jogo, devolvida como erro da chamada RPC. */
function refuse(code: ErrorCode): RpcError {
  return new RpcError(RPC.APP_ERROR, ERROR_TEXT[code], code);
}

function invalidParams(): RpcError {
  return new RpcError(RPC.INVALID_PARAMS, 'Parametros invalidos.');
}

wss.on('connection', (socket: WebSocket) => {
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  let session: Session | null = null;

  function requireSession(): Session {
    if (!session) throw new RpcError(RPC.APP_ERROR, 'Entre em uma partida antes.', 'MATCH_NOT_FOUND');
    return session;
  }

  /** Pede ao worker e transforma a recusa dele em erro da chamada. */
  async function ask(code: Promise<ErrorCode | undefined>): Promise<void> {
    const refused = await code;
    if (refused) throw refuse(refused);
  }

  // A implementacao da interface remota: o "servant" do RMI. Cada metodo
  // aqui e uma operacao que o navegador pode invocar.
  const servant: Handlers<FanoronaServer> = {
    join(params) {
      const p = parseJoin(params);
      if (!p) throw invalidParams();
      const match = registry.get(p.matchId);
      if (!match) throw refuse('MATCH_NOT_FOUND');
      const seat = registry.join(match, conn, p.playerId);
      if ('error' in seat) throw refuse(seat.error);
      session = { match, playerId: seat.playerId, color: seat.color };

      // Callbacks depois da resposta: o cliente primeiro fica sabendo quem e,
      // depois recebe chat antigo, presenca do adversario e o estado atual.
      queueMicrotask(() => {
        registry.replayChat(conn, match);
        const peer = match.seats[seat.color === 'W' ? 'B' : 'W'];
        conn.peer.notify('onPeer', { status: peer?.conn ? 'connected' : 'disconnected' });
        if (match.lastSnapshot) conn.peer.notify('onState', { snapshot: match.lastSnapshot });
      });
      return { playerId: seat.playerId, color: seat.color, matchId: match.id };
    },

    async move(params) {
      const p = parseMove(params);
      if (!p) throw invalidParams();
      const { match, playerId } = requireSession();
      await ask(registry.request(match, { t: 'intent', playerId, move: p }));
    },

    async endTurn() {
      const { match, playerId } = requireSession();
      await ask(registry.request(match, { t: 'endTurn', playerId }));
    },

    async resign() {
      const { match, playerId } = requireSession();
      await ask(registry.request(match, { t: 'resign', playerId }));
    },

    sendChat(params) {
      const p = parseChat(params);
      if (!p) throw invalidParams();
      const { match, color } = requireSession();
      // Retransmitido aqui mesmo: o chat nunca entra no worker (ADR-005),
      // por isso continua funcionando enquanto a partida processa um lance.
      if (p.text.trim()) registry.postChat(match, color, p.text.trim());
    },
  };

  const conn: Conn = {
    peer: new RpcPeer<FanoronaClient, FanoronaServer>((data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }, servant),
    close: () => socket.close(),
  };

  socket.on('message', (raw) => void conn.peer.receive(raw.toString()));

  socket.on('close', () => {
    conn.peer.close();
    if (session) registry.disconnect(session.match, session.color, conn);
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
