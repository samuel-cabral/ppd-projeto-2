/**
 * Estado do cliente como funcao pura dos eventos da partida.
 *
 * Cada evento nasce de uma chamada RPC: o retorno de `join`, um callback do
 * servidor (`onState`, `onChat`, `onPeer`, `onOver`) ou a recusa de uma
 * operacao. A mesma ideia do motor (docs/02-arquitetura.md secao 2): a logica
 * que decide "o que esse evento significa para o estado" nao precisa de rede
 * nem de React para ser correta, e por isso roda em teste sem subir nenhum dos dois.
 */
import type { ChatEntry, Color, OverReason, Snapshot } from '../shared/protocol.js';

export type { ChatEntry };

export type MatchEvent =
  | { t: 'joined'; playerId: string; color: Color; matchId: string }
  | { t: 'state'; snapshot: Snapshot }
  | { t: 'chat'; from: Color | 'system'; text: string; at: number }
  | { t: 'peer'; status: 'connected' | 'disconnected' }
  | { t: 'over'; winner: Color | null; reason: OverReason }
  | { t: 'error'; message: string };

export interface MatchState {
  playerId: string | null;
  color: Color | null;
  snapshot: Snapshot | null;
  peerOnline: boolean;
  over: { winner: Color | null; reason: OverReason } | null;
  error: string | null;
  chat: ChatEntry[];
}

export const initialMatchState: MatchState = {
  playerId: null,
  color: null,
  snapshot: null,
  peerOnline: false,
  over: null,
  error: null,
  chat: [],
};

export function reduceMatch(state: MatchState, msg: MatchEvent): MatchState {
  switch (msg.t) {
    case 'joined':
      return { ...state, playerId: msg.playerId, color: msg.color, error: null };
    case 'state':
      return { ...state, snapshot: msg.snapshot, over: msg.snapshot.over ?? state.over };
    case 'peer':
      return { ...state, peerOnline: msg.status === 'connected' };
    case 'over':
      return { ...state, over: { winner: msg.winner, reason: msg.reason } };
    case 'error':
      return { ...state, error: msg.message };
    case 'chat':
      return { ...state, chat: [...state.chat, { from: msg.from, text: msg.text, at: msg.at }] };
  }
}
