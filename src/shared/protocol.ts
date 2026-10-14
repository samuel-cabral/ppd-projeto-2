/**
 * A INTERFACE DE OPERACOES do sistema: o contrato remoto, importado pelo
 * cliente E pelo servidor. Mudar a assinatura de uma operacao quebra a
 * compilacao dos dois lados no mesmo instante, como uma interface `Remote`
 * do Java RMI. Ver docs/08-rpc.md.
 *
 * Os tipos de dominio (Point, Color, Cell, Kind, Move) vem do motor, que nao
 * importa nada. Aqui eles sao so reexportados, para nao existirem duas
 * definicoes de Move que podem divergir.
 */
import type { Cell, Color, Point } from '../engine/board.js';
import type { Kind, Move, OverReason } from '../engine/moves.js';

export type { Cell, Color, Point, Kind, Move, OverReason };

export type ErrorCode =
  | 'MATCH_NOT_FOUND'
  | 'MATCH_FULL'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'SERVER_BUSY';

/** O estado completo da partida. Enviado por inteiro a cada mudanca (ADR-003). */
export interface Snapshot {
  board: Cell[]; // 45 posicoes, indice = (linha-1)*9 + (coluna-1)
  turn: Color;
  legalMoves: Move[]; // ja filtrados pela captura obrigatoria
  sequence: { at: Point; visited: Point[]; lastDir: [number, number] } | null;
  captured: { W: number; B: number };
  history: string[];
  status: 'waiting' | 'playing' | 'over';
  thinking: boolean;
  over: { winner: Color | null; reason: OverReason } | null;
}

export interface ChatEntry {
  from: Color | 'system';
  text: string;
  at: number;
}

// --- Operacoes que o NAVEGADOR invoca no SERVIDOR --------------------------
//
// Toda chamada tem resposta: `await servidor.move(...)` so termina quando o
// worker da partida aceitou ou recusou o lance. Recusa chega como erro RPC
// (codigo -32000) com o ErrorCode em `data`.

export interface FanoronaServer {
  /** Senta o jogador na partida. `playerId` presente = reconexao no mesmo assento. */
  join(params: { matchId: string; playerId?: string }): { playerId: string; color: Color; matchId: string };
  /** Lance: movimento simples (P), captura por aproximacao (A) ou afastamento (W). */
  move(params: { from: Point; to: Point; kind: Kind }): void;
  /** Encerra uma sequencia de capturas (continuar e opcional) e passa a vez. */
  endTurn(): void;
  /** Desistencia: o adversario vence. */
  resign(): void;
  /** Mensagem de chat, entregue aos dois jogadores. */
  sendChat(params: { text: string }): void;
}

// --- Callbacks que o SERVIDOR invoca no NAVEGADOR --------------------------
//
// Mao unica (notificacao JSON-RPC, sem id): o servidor avisa, nao espera
// resposta. E o equivalente ao callback de cliente do RMI, onde o cliente
// tambem exporta um objeto remoto para o servidor chamar.

export interface FanoronaClient {
  /** Estado completo da partida, enviado por inteiro a cada mudanca (ADR-003). */
  onState(params: { snapshot: Snapshot }): void;
  onChat(params: ChatEntry): void;
  /** O adversario conectou ou caiu. */
  onPeer(params: { status: 'connected' | 'disconnected' }): void;
  onOver(params: { winner: Color | null; reason: OverReason }): void;
}

// --- Thread principal <-> worker (postMessage) -----------------------------

export type ToWorker =
  | { t: 'init'; matchId: string }
  | { t: 'attach'; playerId: string; color: Color }
  | { t: 'intent'; req: number; playerId: string; move: { from: Point; to: Point; kind: Kind } }
  | { t: 'endTurn'; req: number; playerId: string }
  | { t: 'resign'; req: number; playerId: string };

export type FromWorker =
  | { t: 'state'; snapshot: Snapshot }
  /** Resposta a um pedido: `req` casa com o pedido, `code` presente = recusado. */
  | { t: 'done'; req: number; code?: ErrorCode }
  | { t: 'over'; winner: Color | null; reason: OverReason };

/**
 * Validacao na fronteira: os parametros chegam da rede como `unknown` e nada
 * entra no worker sem passar por aqui. Retorna null quando sao invalidos.
 */
const isPoint = (v: unknown): v is Point => typeof v === 'string' && /^[a-i][1-5]$/.test(v);

export function parseJoin(p: unknown): { matchId: string; playerId?: string } | null {
  if (typeof p !== 'object' || p === null) return null;
  const { matchId, playerId } = p as Record<string, unknown>;
  if (typeof matchId !== 'string' || matchId.length > 64) return null;
  return { matchId, playerId: typeof playerId === 'string' ? playerId : undefined };
}

export function parseMove(p: unknown): { from: Point; to: Point; kind: Kind } | null {
  if (typeof p !== 'object' || p === null) return null;
  const { from, to, kind } = p as Record<string, unknown>;
  if (!isPoint(from) || !isPoint(to)) return null;
  if (kind !== 'P' && kind !== 'A' && kind !== 'W') return null;
  return { from, to, kind };
}

export function parseChat(p: unknown): { text: string } | null {
  if (typeof p !== 'object' || p === null) return null;
  const { text } = p as Record<string, unknown>;
  if (typeof text !== 'string') return null;
  return { text: text.slice(0, 500) };
}
