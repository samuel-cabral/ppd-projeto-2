/**
 * Estado do cliente como funcao pura das mensagens do servidor.
 *
 * Extraido do `switch` que antes vivia dentro do callback do WebSocket em
 * `useMatch.ts`. A mesma ideia do motor (docs/02-arquitetura.md secao 2):
 * a logica que decide "o que essa mensagem significa para o estado" nao
 * precisa de socket nem de React para ser correta, e por isso roda em teste
 * sem subir nenhum dos dois.
 */
import type { Color, OverReason, ServerMessage, Snapshot } from '../shared/protocol.js';

export interface ChatEntry {
  from: Color | 'system';
  text: string;
  at: number;
}

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

export function reduceMatch(state: MatchState, msg: ServerMessage): MatchState {
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
