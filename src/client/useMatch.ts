/**
 * Conexao WebSocket com o servidor.
 *
 * O cliente NAO sabe jogar Fanorona: ele desenha o snapshot que recebeu,
 * desenha os destinos que o servidor marcou como legais e envia a intencao.
 * Toda regra vive no worker do servidor (docs/02-arquitetura.md secao 3).
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientMessage, Kind, Point, ServerMessage } from '../shared/protocol.js';
import { type ChatEntry, type MatchState, initialMatchState, reduceMatch } from './matchState.js';

export interface MatchView extends MatchState {
  connection: 'connecting' | 'open' | 'closed';
  send: (msg: ClientMessage) => void;
  move: (from: Point, to: Point, kind: Kind) => void;
  endTurn: () => void;
  resign: () => void;
  sendChat: (text: string) => void;
}

export type { ChatEntry };

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useMatch(matchId: string | null): MatchView {
  const ws = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<MatchView['connection']>('connecting');
  const [state, dispatch] = useReducer(reduceMatch, initialMatchState);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!matchId) return;
    setConnection('connecting');
    const socket = new WebSocket(socketUrl());
    ws.current = socket;

    socket.onopen = () => {
      setConnection('open');
      // playerId guardado por partida: e a credencial de reconexao (protocolo 4.2).
      // sessionStorage, e nao localStorage: duas abas do MESMO navegador sao
      // dois jogadores distintos, e localStorage e compartilhado por origem —
      // a segunda aba reconectaria no assento da primeira e a expulsaria.
      // Recarregar a aba continua reconectando, que e o caso que importa.
      const saved = sessionStorage.getItem(`fanorona:${matchId}`) ?? undefined;
      socket.send(JSON.stringify({ t: 'join', matchId, playerId: saved } satisfies ClientMessage));
    };

    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      // playerId so precisa ser persistido aqui: e o unico efeito colateral
      // real de uma mensagem, o resto e so calculo — por isso fica fora do
      // reducer puro em vez de dentro dele.
      if (msg.t === 'joined') sessionStorage.setItem(`fanorona:${matchId}`, msg.playerId);
      dispatch(msg);
    };

    socket.onclose = () => setConnection('closed');
    socket.onerror = () => setConnection('closed');

    return () => socket.close();
  }, [matchId]);

  return {
    ...state,
    connection,
    send,
    move: (from, to, kind) => send({ t: 'move', from, to, kind }),
    endTurn: () => send({ t: 'endTurn' }),
    resign: () => send({ t: 'resign' }),
    sendChat: (text) => send({ t: 'chat', text }),
  };
}
