/**
 * O reducer e puro: nao importa rede, nao importa React. Por isso roda
 * no mesmo ambiente 'node' dos testes do engine, sem subir DOM nenhum.
 */
import { describe, expect, it } from 'vitest';
import { initialMatchState, type MatchEvent, reduceMatch } from './matchState.js';
import type { Snapshot } from '../shared/protocol.js';

const snapshot: Snapshot = {
  board: [],
  turn: 'W',
  legalMoves: [],
  sequence: null,
  captured: { W: 0, B: 0 },
  history: [],
  status: 'playing',
  thinking: false,
  over: null,
};

describe('reduceMatch', () => {
  it('joined preenche playerId e color, e limpa erro anterior', () => {
    const start = { ...initialMatchState, error: 'algo antigo' };
    const msg: MatchEvent = { t: 'joined', playerId: 'p1', color: 'W', matchId: 'm1' };
    const next = reduceMatch(start, msg);
    expect(next).toMatchObject({ playerId: 'p1', color: 'W', error: null });
  });

  it('state substitui o snapshot inteiro (sem delta, ADR-003)', () => {
    const msg: MatchEvent = { t: 'state', snapshot };
    const next = reduceMatch(initialMatchState, msg);
    expect(next.snapshot).toBe(snapshot);
  });

  it('state com over preenche o motivo de fim de partida', () => {
    const over = { winner: 'W' as const, reason: 'resign' as const };
    const msg: MatchEvent = { t: 'state', snapshot: { ...snapshot, status: 'over', over } };
    const next = reduceMatch(initialMatchState, msg);
    expect(next.over).toEqual(over);
  });

  it('peer conectado/desconectado atualiza peerOnline', () => {
    const connected = reduceMatch(initialMatchState, { t: 'peer', status: 'connected' });
    expect(connected.peerOnline).toBe(true);
    const disconnected = reduceMatch(connected, { t: 'peer', status: 'disconnected' });
    expect(disconnected.peerOnline).toBe(false);
  });

  it('over preenche vencedor e motivo', () => {
    const msg: MatchEvent = { t: 'over', winner: 'B', reason: 'capture' };
    const next = reduceMatch(initialMatchState, msg);
    expect(next.over).toEqual({ winner: 'B', reason: 'capture' });
  });

  it('error preenche a mensagem de erro', () => {
    const msg: MatchEvent = { t: 'error', message: 'Lance ilegal.' };
    const next = reduceMatch(initialMatchState, msg);
    expect(next.error).toBe('Lance ilegal.');
  });

  it('chat acrescenta ao historico sem descartar as mensagens anteriores', () => {
    const first = reduceMatch(initialMatchState, { t: 'chat', from: 'W', text: 'oi', at: 1 });
    const second = reduceMatch(first, { t: 'chat', from: 'B', text: 'e ai', at: 2 });
    expect(second.chat).toEqual([
      { from: 'W', text: 'oi', at: 1 },
      { from: 'B', text: 'e ai', at: 2 },
    ]);
  });
});
