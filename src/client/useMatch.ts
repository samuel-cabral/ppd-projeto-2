/**
 * Conexao RPC com o servidor.
 *
 * O cliente NAO sabe jogar Fanorona: ele desenha o snapshot que recebeu,
 * desenha os destinos que o servidor marcou como legais e invoca a operacao
 * remota. Toda regra vive no worker do servidor (docs/02-arquitetura.md secao 3).
 *
 * Os dois papeis do RPC moram aqui:
 * - `peer.stub` e o servidor visto daqui: `await server.move(...)`;
 * - `callbacks` e o objeto que este navegador exporta para o servidor chamar.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import type { FanoronaClient, FanoronaServer, Kind, Point } from '../shared/protocol.js';
import { type Handlers, RpcPeer, type Stub } from '../shared/rpc.js';
import { type ChatEntry, type MatchState, initialMatchState, reduceMatch } from './matchState.js';

export interface MatchView extends MatchState {
  connection: 'connecting' | 'open' | 'closed';
  move: (from: Point, to: Point, kind: Kind) => void;
  endTurn: () => void;
  resign: () => void;
  sendChat: (text: string) => void;
}

export type { ChatEntry };

function rpcUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/rpc`;
}

export function useMatch(matchId: string | null): MatchView {
  const server = useRef<Stub<FanoronaServer> | null>(null);
  const [connection, setConnection] = useState<MatchView['connection']>('connecting');
  const [state, dispatch] = useReducer(reduceMatch, initialMatchState);

  useEffect(() => {
    if (!matchId) return;
    setConnection('connecting');
    const socket = new WebSocket(rpcUrl());

    // O objeto que o servidor invoca neste navegador.
    const callbacks: Handlers<FanoronaClient> = {
      onState: ({ snapshot }) => dispatch({ t: 'state', snapshot }),
      onChat: (entry) => dispatch({ t: 'chat', ...entry }),
      onPeer: ({ status }) => dispatch({ t: 'peer', status }),
      onOver: ({ winner, reason }) => dispatch({ t: 'over', winner, reason }),
    };
    const peer = new RpcPeer<FanoronaServer, FanoronaClient>((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    }, callbacks);
    server.current = peer.stub;

    socket.onopen = async () => {
      setConnection('open');
      // playerId guardado por partida: e a credencial de reconexao (protocolo 4.2).
      // sessionStorage, e nao localStorage: duas abas do MESMO navegador sao
      // dois jogadores distintos, e localStorage e compartilhado por origem —
      // a segunda aba reconectaria no assento da primeira e a expulsaria.
      // Recarregar a aba continua reconectando, que e o caso que importa.
      const saved = sessionStorage.getItem(`fanorona:${matchId}`) ?? undefined;
      try {
        const joined = await peer.stub.join({ matchId, playerId: saved });
        sessionStorage.setItem(`fanorona:${matchId}`, joined.playerId);
        dispatch({ t: 'joined', ...joined });
      } catch (err) {
        dispatch({ t: 'error', message: (err as Error).message });
      }
    };

    socket.onmessage = (event) => void peer.receive(String(event.data));
    socket.onclose = () => {
      peer.close();
      setConnection('closed');
    };
    socket.onerror = () => setConnection('closed');

    return () => socket.close();
  }, [matchId]);

  /** Recusa de uma operacao (lance ilegal, fora do turno) vira mensagem na tela. */
  const invoke = (call: (s: Stub<FanoronaServer>) => Promise<unknown>) => {
    if (!server.current) return;
    call(server.current).catch((err: Error) => dispatch({ t: 'error', message: err.message }));
  };

  return {
    ...state,
    connection,
    move: (from, to, kind) => invoke((s) => s.move({ from, to, kind })),
    endTurn: () => invoke((s) => s.endTurn()),
    resign: () => invoke((s) => s.resign()),
    sendChat: (text) => invoke((s) => s.sendChat({ text })),
  };
}
