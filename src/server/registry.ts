/**
 * Ciclo de vida das partidas na thread principal.
 * Guarda o mapa matchId -> { worker, assentos, chat } e faz o roteamento
 * chamada RPC <-> worker.postMessage. Nao conhece nenhuma regra de Fanorona.
 */
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type {
  ChatEntry,
  Color,
  ErrorCode,
  FanoronaClient,
  FromWorker,
  Snapshot,
  ToWorker,
} from '../shared/protocol.js';
import type { RpcPeer } from '../shared/rpc.js';

/**
 * Um navegador conectado, visto pelo servidor: o peer RPC (para invocar os
 * callbacks dele) e como derrubar a conexao. O registry nao sabe que por
 * baixo existe um WebSocket.
 */
export interface Conn {
  peer: RpcPeer<FanoronaClient>;
  close(): void;
}

/** Pedido que exige resposta do worker, sem o id de correlacao (o registry poe). */
type WorkerRequest =
  | { t: 'intent'; playerId: string; move: Extract<ToWorker, { t: 'intent' }>['move'] }
  | { t: 'endTurn'; playerId: string }
  | { t: 'resign'; playerId: string };

/**
 * Janela de reconexao (docs/04-protocolo.md 4.2). Vive aqui, nao no worker.
 * Configuravel pelo ambiente para o teste nao precisar esperar cinco minutos,
 * do mesmo jeito que PORT ja e configuravel em `index.ts`.
 */
const ABANDON_MS = Number(process.env.FANORONA_ABANDON_MS ?? 5 * 60 * 1000);
/** Sobrevida da partida ja encerrada: tempo de um F5 ainda ver o placar final. */
const LINGER_MS = ABANDON_MS;
const MAX_MATCHES = 50;

interface Seat {
  playerId: string;
  conn: Conn | null;
  abandonTimer: NodeJS.Timeout | null;
}

export interface Match {
  id: string;
  worker: Worker;
  seats: Partial<Record<Color, Seat>>;
  lastSnapshot: Snapshot | null;
  chat: ChatEntry[];
  /** Pedidos enviados ao worker esperando o `done` correspondente. */
  waiting: Map<number, (code?: ErrorCode) => void>;
  closed: boolean;
  /** Partida ja tem resultado: nenhum abandono pode mais mudar o vencedor. */
  over: boolean;
  /** Destruicao agendada depois do fim de jogo. */
  lingerTimer: NodeJS.Timeout | null;
}

const WORKER_URL = new URL('./match.worker.js', import.meta.url);

export class MatchRegistry {
  private matches = new Map<string, Match>();
  private nextReq = 1;

  get(id: string): Match | undefined {
    return this.matches.get(id);
  }

  get size(): number {
    return this.matches.size;
  }

  create(): Match | null {
    if (this.matches.size >= MAX_MATCHES) return null;
    const id = randomUUID().slice(0, 8);
    const worker = new Worker(WORKER_URL);
    const match: Match = {
      id,
      worker,
      seats: {},
      lastSnapshot: null,
      chat: [],
      waiting: new Map(),
      closed: false,
      over: false,
      lingerTimer: null,
    };
    worker.on('message', (msg: FromWorker) => this.onWorkerMessage(match, msg));
    worker.on('error', (err) => {
      console.error(`[match ${id}] worker falhou:`, err);
      this.destroy(match);
    });
    worker.postMessage({ t: 'init', matchId: id } satisfies ToWorker);
    this.matches.set(id, match);
    console.log(`[match ${id}] criada — ${this.matches.size} partida(s) ativa(s)`);
    return match;
  }

  /**
   * Senta uma conexao na partida. `playerId` presente significa tentativa de
   * reconexao: se bater com um assento, a conexao nova reata no mesmo lugar.
   */
  join(
    match: Match,
    conn: Conn,
    playerId?: string,
  ): { playerId: string; color: Color } | { error: ErrorCode } {
    if (match.closed) return { error: 'MATCH_NOT_FOUND' };

    if (playerId) {
      for (const color of ['W', 'B'] as const) {
        const seat = match.seats[color];
        if (seat?.playerId === playerId) {
          if (seat.abandonTimer) {
            clearTimeout(seat.abandonTimer);
            seat.abandonTimer = null;
          }
          seat.conn?.close();
          seat.conn = conn;
          this.notifyPeer(match, color, 'connected');
          return { playerId, color };
        }
      }
    }

    // Primeiro a entrar recebe as brancas — e as brancas jogam primeiro.
    const color: Color | null = !match.seats.W ? 'W' : !match.seats.B ? 'B' : null;
    if (!color) return { error: 'MATCH_FULL' };

    const id = randomUUID();
    match.seats[color] = { playerId: id, conn, abandonTimer: null };
    match.worker.postMessage({ t: 'attach', playerId: id, color } satisfies ToWorker);
    this.notifyPeer(match, color, 'connected');
    console.log(`[match ${match.id}] jogador entrou como ${color}`);
    return { playerId: id, color };
  }

  /**
   * Encaminha uma intencao do jogador para o worker e espera a resposta dele.
   * Resolve com o codigo de recusa, ou undefined quando o lance foi aceito.
   * E aqui que a chamada RPC `move` vira `postMessage` e volta.
   */
  request(match: Match, msg: WorkerRequest): Promise<ErrorCode | undefined> {
    if (match.closed) return Promise.resolve('MATCH_NOT_FOUND');
    const req = this.nextReq++;
    return new Promise((resolve) => {
      match.waiting.set(req, resolve);
      match.worker.postMessage({ ...msg, req } as ToWorker);
    });
  }

  broadcast(match: Match, call: (client: Conn['peer']) => void): void {
    for (const color of ['W', 'B'] as const) {
      const conn = match.seats[color]?.conn;
      if (conn) call(conn.peer);
    }
  }

  /** O chat nunca cruza a fronteira de thread — ver ADR-005. */
  postChat(match: Match, from: Color | 'system', text: string): void {
    const entry = { from, text, at: Date.now() };
    match.chat.push(entry);
    if (match.chat.length > 200) match.chat.shift();
    this.broadcast(match, (c) => c.notify('onChat', entry));
  }

  replayChat(conn: Conn, match: Match): void {
    for (const entry of match.chat) conn.peer.notify('onChat', entry);
  }

  /**
   * Conexao caiu. O worker continua vivo com o estado intacto; o assento fica
   * reservado por 5 minutos, depois a partida e dada por abandonada.
   */
  disconnect(match: Match, color: Color, conn: Conn): void {
    const seat = match.seats[color];
    if (!seat || seat.conn !== conn) return; // ja foi substituido por uma reconexao
    seat.conn = null;
    this.notifyPeer(match, color, 'disconnected');

    // Partida ja decidida nao tem abandono: quem saiu depois do resultado nao
    // pode mudar o vencedor, e a destruicao ja esta agendada pelo `over`.
    if (match.over) {
      console.log(`[match ${match.id}] ${color} saiu — partida ja encerrada`);
      return;
    }

    console.log(`[match ${match.id}] ${color} desconectou — janela de reconexao`);
    seat.abandonTimer = setTimeout(() => {
      const winner: Color = color === 'W' ? 'B' : 'W';
      this.broadcast(match, (c) => c.notify('onOver', { winner, reason: 'abandoned' }));
      this.destroy(match);
    }, ABANDON_MS);
  }

  private notifyPeer(match: Match, color: Color, status: 'connected' | 'disconnected'): void {
    const peer = color === 'W' ? 'B' : 'W';
    match.seats[peer]?.conn?.peer.notify('onPeer', { status });
  }

  private onWorkerMessage(match: Match, msg: FromWorker): void {
    switch (msg.t) {
      case 'state': {
        match.lastSnapshot = msg.snapshot;
        const snapshot = msg.snapshot;
        this.broadcast(match, (c) => c.notify('onState', { snapshot }));
        return;
      }
      case 'over': {
        this.finish(match);
        const { winner, reason } = msg;
        this.broadcast(match, (c) => c.notify('onOver', { winner, reason }));
        return;
      }
      case 'done': {
        // Responde a chamada RPC que originou o pedido. Erro nunca derruba a
        // conexao: so quem chamou recebe a recusa, como retorno da chamada.
        const resolve = match.waiting.get(msg.req);
        match.waiting.delete(msg.req);
        resolve?.(msg.code);
        return;
      }
    }
  }

  /**
   * Fim de jogo: o resultado esta congelado. Desarma as janelas de abandono
   * pendentes — sem isso, um jogador que fecha a aba depois do fim ainda
   * dispararia um `over` de abandono cinco minutos depois, trocando o motivo
   * na tela de quem ja tinha vencido — e agenda a destruicao, senao a partida
   * (e a thread dela) ficaria viva para sempre.
   */
  private finish(match: Match): void {
    if (match.over) return;
    match.over = true;
    for (const color of ['W', 'B'] as const) {
      const seat = match.seats[color];
      if (seat?.abandonTimer) {
        clearTimeout(seat.abandonTimer);
        seat.abandonTimer = null;
      }
    }
    match.lingerTimer = setTimeout(() => this.destroy(match), LINGER_MS);
    match.lingerTimer.unref?.();
  }

  destroy(match: Match): void {
    if (match.closed) return;
    match.closed = true;
    if (match.lingerTimer) clearTimeout(match.lingerTimer);
    for (const color of ['W', 'B'] as const) {
      const seat = match.seats[color];
      if (seat?.abandonTimer) clearTimeout(seat.abandonTimer);
    }
    for (const resolve of match.waiting.values()) resolve('MATCH_NOT_FOUND');
    match.waiting.clear();
    void match.worker.terminate();
    this.matches.delete(match.id);
    console.log(`[match ${match.id}] encerrada — ${this.matches.size} restante(s)`);
  }

  destroyAll(): void {
    for (const match of [...this.matches.values()]) this.destroy(match);
  }
}

export const ERROR_TEXT: Record<ErrorCode, string> = {
  MATCH_NOT_FOUND: 'Partida inexistente ou ja encerrada.',
  MATCH_FULL: 'Esta partida ja tem dois jogadores.',
  NOT_YOUR_TURN: 'Nao e a sua vez.',
  ILLEGAL_MOVE: 'Lance ilegal.',
  SERVER_BUSY: 'Limite de partidas simultaneas atingido.',
};
