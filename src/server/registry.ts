/**
 * Ciclo de vida das partidas na thread principal.
 * Guarda o mapa matchId -> { worker, assentos, chat } e faz o roteamento
 * socket <-> worker.postMessage. Nao conhece nenhuma regra de Fanorona.
 */
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { WebSocket } from 'ws';
import type {
  Color,
  ErrorCode,
  FromWorker,
  ServerMessage,
  Snapshot,
  ToWorker,
} from '../shared/protocol.js';

/** Janela de reconexao (docs/04-protocolo.md 4.2). Vive aqui, nao no worker. */
const ABANDON_MS = 5 * 60 * 1000;
const MAX_MATCHES = 50;

interface Seat {
  playerId: string;
  socket: WebSocket | null;
  abandonTimer: NodeJS.Timeout | null;
}

export interface Match {
  id: string;
  worker: Worker;
  seats: Partial<Record<Color, Seat>>;
  lastSnapshot: Snapshot | null;
  chat: { from: Color | 'system'; text: string; at: number }[];
  closed: boolean;
}

const WORKER_URL = new URL('./match.worker.js', import.meta.url);

export class MatchRegistry {
  private matches = new Map<string, Match>();

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
      closed: false,
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
   * Senta um socket na partida. `playerId` presente significa tentativa de
   * reconexao: se bater com um assento, o socket novo reata no mesmo lugar.
   */
  join(
    match: Match,
    socket: WebSocket,
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
          seat.socket?.close();
          seat.socket = socket;
          this.notifyPeer(match, color, 'connected');
          return { playerId, color };
        }
      }
    }

    // Primeiro a entrar recebe as brancas — e as brancas jogam primeiro.
    const color: Color | null = !match.seats.W ? 'W' : !match.seats.B ? 'B' : null;
    if (!color) return { error: 'MATCH_FULL' };

    const id = randomUUID();
    match.seats[color] = { playerId: id, socket, abandonTimer: null };
    match.worker.postMessage({ t: 'attach', playerId: id, color } satisfies ToWorker);
    this.notifyPeer(match, color, 'connected');
    console.log(`[match ${match.id}] jogador entrou como ${color}`);
    return { playerId: id, color };
  }

  /** Encaminha uma intencao do jogador para o worker da partida. */
  toWorker(match: Match, msg: ToWorker): void {
    if (!match.closed) match.worker.postMessage(msg);
  }

  send(socket: WebSocket | null, msg: ServerMessage): void {
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  }

  broadcast(match: Match, msg: ServerMessage): void {
    for (const color of ['W', 'B'] as const) this.send(match.seats[color]?.socket ?? null, msg);
  }

  /** O chat nunca cruza a fronteira de thread — ver ADR-005. */
  postChat(match: Match, from: Color | 'system', text: string): void {
    const entry = { from, text, at: Date.now() };
    match.chat.push(entry);
    if (match.chat.length > 200) match.chat.shift();
    this.broadcast(match, { t: 'chat', ...entry });
  }

  replayChat(socket: WebSocket, match: Match): void {
    for (const entry of match.chat) this.send(socket, { t: 'chat', ...entry });
  }

  /**
   * Socket caiu. O worker continua vivo com o estado intacto; o assento fica
   * reservado por 5 minutos, depois a partida e dada por abandonada.
   */
  disconnect(match: Match, color: Color, socket: WebSocket): void {
    const seat = match.seats[color];
    if (!seat || seat.socket !== socket) return; // ja foi substituido por uma reconexao
    seat.socket = null;
    this.notifyPeer(match, color, 'disconnected');
    console.log(`[match ${match.id}] ${color} desconectou — janela de 5 min`);
    seat.abandonTimer = setTimeout(() => {
      const winner: Color = color === 'W' ? 'B' : 'W';
      this.broadcast(match, { t: 'over', winner, reason: 'abandoned' });
      this.destroy(match);
    }, ABANDON_MS);
  }

  private notifyPeer(match: Match, color: Color, status: 'connected' | 'disconnected'): void {
    const peer = color === 'W' ? 'B' : 'W';
    this.send(match.seats[peer]?.socket ?? null, { t: 'peer', status });
  }

  private onWorkerMessage(match: Match, msg: FromWorker): void {
    switch (msg.t) {
      case 'state':
        match.lastSnapshot = msg.snapshot;
        this.broadcast(match, { t: 'state', snapshot: msg.snapshot });
        return;
      case 'over':
        this.broadcast(match, { t: 'over', winner: msg.winner, reason: msg.reason });
        return;
      case 'rejected': {
        // Erro nunca derruba a conexao: so o autor da intencao e avisado.
        for (const color of ['W', 'B'] as const) {
          const seat = match.seats[color];
          if (seat?.playerId === msg.playerId) {
            this.send(seat.socket, {
              t: 'error',
              code: msg.code,
              message: ERROR_TEXT[msg.code],
            });
          }
        }
        return;
      }
    }
  }

  destroy(match: Match): void {
    if (match.closed) return;
    match.closed = true;
    for (const color of ['W', 'B'] as const) {
      const seat = match.seats[color];
      if (seat?.abandonTimer) clearTimeout(seat.abandonTimer);
    }
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
