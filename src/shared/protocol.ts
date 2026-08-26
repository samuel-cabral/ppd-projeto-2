/**
 * Tipos das mensagens, importados pelo cliente E pelo servidor.
 * Uma mensagem que mude de forma quebra a compilacao dos dois lados no mesmo
 * instante — o compilador e quem garante que o protocolo nao desalinhe.
 * Ver docs/04-protocolo.md.
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

// --- Navegador -> servidor -------------------------------------------------

export type ClientMessage =
  | { t: 'join'; matchId: string; playerId?: string }
  | { t: 'move'; from: Point; to: Point; kind: Kind }
  | { t: 'endTurn' }
  | { t: 'resign' }
  | { t: 'chat'; text: string };

// --- Servidor -> navegador -------------------------------------------------

export type ServerMessage =
  | { t: 'joined'; playerId: string; color: Color; matchId: string }
  | { t: 'state'; snapshot: Snapshot }
  | { t: 'chat'; from: Color | 'system'; text: string; at: number }
  | { t: 'peer'; status: 'connected' | 'disconnected' }
  | { t: 'over'; winner: Color | null; reason: OverReason }
  | { t: 'error'; code: ErrorCode; message: string };

// --- Thread principal <-> worker (postMessage) -----------------------------

export type ToWorker =
  | { t: 'init'; matchId: string }
  | { t: 'attach'; playerId: string; color: Color }
  | { t: 'intent'; playerId: string; move: { from: Point; to: Point; kind: Kind } }
  | { t: 'endTurn'; playerId: string }
  | { t: 'resign'; playerId: string };

export type FromWorker =
  | { t: 'state'; snapshot: Snapshot }
  | { t: 'rejected'; playerId: string; code: ErrorCode }
  | { t: 'over'; winner: Color | null; reason: OverReason };

/**
 * Validacao na fronteira: nada entra no worker sem ter sido verificado aqui.
 * Retorna null quando o payload nao e uma mensagem reconhecida.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  const point = (v: unknown) => typeof v === 'string' && /^[a-i][1-5]$/.test(v);

  switch (msg.t) {
    case 'join':
      if (typeof msg.matchId !== 'string' || msg.matchId.length > 64) return null;
      return {
        t: 'join',
        matchId: msg.matchId,
        playerId: typeof msg.playerId === 'string' ? msg.playerId : undefined,
      };
    case 'move':
      if (!point(msg.from) || !point(msg.to)) return null;
      if (msg.kind !== 'P' && msg.kind !== 'A' && msg.kind !== 'W') return null;
      return { t: 'move', from: msg.from as Point, to: msg.to as Point, kind: msg.kind };
    case 'endTurn':
      return { t: 'endTurn' };
    case 'resign':
      return { t: 'resign' };
    case 'chat':
      if (typeof msg.text !== 'string') return null;
      return { t: 'chat', text: msg.text.slice(0, 500) };
    default:
      return null;
  }
}
