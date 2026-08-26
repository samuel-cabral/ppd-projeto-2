/**
 * Conexao WebSocket com o servidor.
 *
 * O cliente NAO sabe jogar Fanorona: ele desenha o snapshot que recebeu,
 * desenha os destinos que o servidor marcou como legais e envia a intencao.
 * Toda regra vive no worker do servidor (docs/02-arquitetura.md secao 3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  Color,
  Kind,
  OverReason,
  Point,
  ServerMessage,
  Snapshot,
} from '../shared/protocol.js';

export interface MatchView {
  connection: 'connecting' | 'open' | 'closed';
  playerId: string | null;
  color: Color | null;
  snapshot: Snapshot | null;
  peerOnline: boolean;
  over: { winner: Color | null; reason: OverReason } | null;
  error: string | null;
  send: (msg: ClientMessage) => void;
  move: (from: Point, to: Point, kind: Kind) => void;
  endTurn: () => void;
  resign: () => void;
}

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useMatch(matchId: string | null): MatchView {
  const ws = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<MatchView['connection']>('connecting');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [color, setColor] = useState<Color | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [over, setOver] = useState<MatchView['over']>(null);
  const [error, setError] = useState<string | null>(null);

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
      switch (msg.t) {
        case 'joined':
          sessionStorage.setItem(`fanorona:${matchId}`, msg.playerId);
          setPlayerId(msg.playerId);
          setColor(msg.color);
          setError(null);
          break;
        case 'state':
          setSnapshot(msg.snapshot);
          if (msg.snapshot.over) setOver(msg.snapshot.over);
          break;
        case 'peer':
          setPeerOnline(msg.status === 'connected');
          break;
        case 'over':
          setOver({ winner: msg.winner, reason: msg.reason });
          break;
        case 'error':
          setError(msg.message);
          break;
        case 'chat':
          break; // painel de chat entra na Fase 4
      }
    };

    socket.onclose = () => setConnection('closed');
    socket.onerror = () => setConnection('closed');

    return () => socket.close();
  }, [matchId]);

  return {
    connection,
    playerId,
    color,
    snapshot,
    peerOnline,
    over,
    error,
    send,
    move: (from, to, kind) => send({ t: 'move', from, to, kind }),
    endTurn: () => send({ t: 'endTurn' }),
    resign: () => send({ t: 'resign' }),
  };
}
