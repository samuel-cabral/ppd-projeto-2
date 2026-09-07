import { useEffect, useMemo, useState } from 'react';
import { Board } from './Board.js';
import { Chat } from './Chat.js';
import { useMatch } from './useMatch.js';
import type { Color, Move, Point } from '../shared/protocol.js';

const REASON_TEXT: Record<string, string> = {
  capture: 'todas as pecas do adversario foram capturadas',
  nomoves: 'o adversario ficou sem lance legal',
  resign: 'desistencia',
  abandoned: 'abandono da partida',
};

function readMatchId(): string | null {
  const m = /^#\/m\/([a-z0-9-]{1,64})$/i.exec(location.hash);
  return m ? m[1] : null;
}

export function App() {
  const [matchId, setMatchId] = useState<string | null>(readMatchId);

  useEffect(() => {
    const onHash = () => setMatchId(readMatchId());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return matchId ? <MatchScreen matchId={matchId} /> : <Lobby />;
}

function Lobby() {
  const [busy, setBusy] = useState(false);
  const [joinId, setJoinId] = useState('');

  async function create() {
    setBusy(true);
    const res = await fetch('/api/match', { method: 'POST' });
    const body = await res.json();
    setBusy(false);
    if (body.matchId) location.hash = `#/m/${body.matchId}`;
  }

  return (
    <main className="lobby">
      <h1>Fanorona</h1>
      <p className="sub">Fanoron-Sivy 9x5 · dois jogadores em rede via WebSocket</p>
      <button className="primary" onClick={create} disabled={busy}>
        {busy ? 'Criando...' : 'Criar partida'}
      </button>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (joinId.trim()) location.hash = `#/m/${joinId.trim()}`;
        }}
      >
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="codigo da partida"
          aria-label="codigo da partida"
        />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}

function MatchScreen({ matchId }: { matchId: string }) {
  const match = useMatch(matchId);
  const { snapshot, color } = match;
  const [selected, setSelected] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [pending, setPending] = useState<{ to: Point; moves: Move[] } | null>(null);

  const myTurn = !!snapshot && !!color && snapshot.turn === color && snapshot.status === 'playing';
  const sequenceAt = snapshot?.sequence?.at ?? null;

  // Em sequencia a peca fica travada: a selecao nao e mais escolha do jogador.
  useEffect(() => {
    if (sequenceAt) setSelected(sequenceAt);
    else setSelected(null);
    setPending(null);
  }, [sequenceAt, snapshot?.turn, snapshot?.history.length]);

  const destinations = useMemo(() => {
    const map = new Map<Point, Move[]>();
    if (!snapshot || !myTurn || !selected) return map;
    for (const m of snapshot.legalMoves) {
      if (m.from !== selected) continue;
      const list = map.get(m.to) ?? [];
      list.push(m);
      map.set(m.to, list);
    }
    return map;
  }, [snapshot, myTurn, selected]);

  const movable = useMemo(
    () => new Set((snapshot?.legalMoves ?? []).map((m) => m.from)),
    [snapshot],
  );

  // Previa das pecas condenadas: so quando o destino nao e ambiguo, senao
  // mostraria capturas de dois lances diferentes ao mesmo tempo.
  const doomed = useMemo(() => {
    if (pending) return [];
    const moves = hover ? destinations.get(hover) : undefined;
    if (!moves || new Set(moves.map((m) => m.kind)).size > 1) return [];
    return moves[0].captures;
  }, [hover, destinations, pending]);

  function onPointClick(p: Point) {
    if (!snapshot || !myTurn) return;
    const moves = destinations.get(p);
    if (moves) {
      const kinds = [...new Set(moves.map((m) => m.kind))];
      // Regra 3.4.2: aproximacao e afastamento nao acontecem juntas, o
      // jogador escolhe uma. Por isso o seletor.
      if (kinds.length > 1) setPending({ to: p, moves });
      else match.move(moves[0].from, moves[0].to, moves[0].kind);
      return;
    }
    if (sequenceAt) return; // peca travada
    setSelected(movable.has(p) && p !== selected ? p : null);
  }

  if (!snapshot) {
    return (
      <main className="screen">
        <p className="status-line">
          {match.connection === 'closed'
            ? (match.error ?? 'Conexao encerrada.')
            : 'Conectando ao servidor...'}
        </p>
        {match.error && <p className="error">{match.error}</p>}
      </main>
    );
  }

  const waiting = snapshot.status === 'waiting';

  return (
    <main className="screen">
      <div className="board-wrap">
        <Board
          board={snapshot.board}
          myColor={color}
          selected={selected}
          destinations={destinations}
          doomed={doomed}
          lockedTo={sequenceAt}
          onPointClick={onPointClick}
          onHover={setHover}
        />
        {pending && (
          <div className="chooser">
            <p>
              O lance para <b>{pending.to}</b> pode ser dos dois tipos. Escolha um.
            </p>
            <div className="chooser-options">
              {pending.moves.map((m) => (
                <button
                  key={m.kind}
                  onMouseEnter={() => setHover(null)}
                  onClick={() => {
                    match.move(m.from, m.to, m.kind);
                    setPending(null);
                  }}
                >
                  <span className={`tag tag-${m.kind}`}>
                    {m.kind === 'A' ? 'Aproximacao' : 'Afastamento'}
                  </span>
                  <small>captura {m.captures.join(', ')}</small>
                </button>
              ))}
              <button className="ghost" onClick={() => setPending(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="panel">
        <header>
          <h1>Fanorona</h1>
          <ConnectionBadge match={match} waiting={waiting} />
        </header>

        <section className="turn">
          <Seat color="W" label="Brancas" snapshot={snapshot} me={color} />
          <Seat color="B" label="Pretas" snapshot={snapshot} me={color} />
        </section>

        <p className="status-line">
          {match.over
            ? `Fim de partida — ${match.over.winner ? (match.over.winner === color ? 'voce venceu' : 'voce perdeu') : 'empate'} (${REASON_TEXT[match.over.reason]}).`
            : waiting
              ? 'Aguardando o segundo jogador. Compartilhe o link desta pagina.'
              : snapshot.sequence
                ? myTurn
                  ? 'Sequencia em andamento: continue capturando ou encerre a jogada.'
                  : 'O adversario esta encadeando capturas.'
                : myTurn
                  ? 'Sua vez.'
                  : 'Vez do adversario.'}
        </p>

        {snapshot.sequence && myTurn && (
          <button className="primary" onClick={match.endTurn}>
            Encerrar jogada
          </button>
        )}

        {waiting && (
          <button
            className="secondary"
            onClick={() => navigator.clipboard?.writeText(location.href)}
          >
            Copiar link do convite
          </button>
        )}

        <section className="legend">
          <h2>Destinos</h2>
          <ul>
            <li>
              <i className="swatch sw-P" /> paika (sem captura)
            </li>
            <li>
              <i className="swatch sw-A" /> captura por aproximacao
            </li>
            <li>
              <i className="swatch sw-W" /> captura por afastamento
            </li>
            <li>
              <i className="swatch sw-AW" /> os dois — o jogo pergunta qual
            </li>
          </ul>
          <p className="note">
            Captura e obrigatoria: quando existe uma, os paika somem da lista.
          </p>
        </section>

        <section className="history">
          <h2>Lances</h2>
          <ol>
            {snapshot.history.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </section>

        <Chat messages={match.chat} me={color} onSend={match.sendChat} />

        {!match.over && snapshot.status !== 'waiting' && (
          <button
            className="danger"
            onClick={() => confirm('Desistir da partida?') && match.resign()}
          >
            Desistir
          </button>
        )}

        {match.error && <p className="error">{match.error}</p>}
        <p className="match-id">partida {matchId}</p>
      </aside>
    </main>
  );
}

function Seat({
  color,
  label,
  snapshot,
  me,
}: {
  color: Color;
  label: string;
  snapshot: NonNullable<ReturnType<typeof useMatch>['snapshot']>;
  me: Color | null;
}) {
  const lost = snapshot.captured[color];
  return (
    <div className={`seat ${snapshot.turn === color ? 'active' : ''}`}>
      <span className={`chip ${color === 'W' ? 'white' : 'black'}`} />
      <div>
        <strong>
          {label}
          {me === color ? ' (voce)' : ''}
        </strong>
        <small>
          {22 - lost} de 22 pecas
        </small>
      </div>
    </div>
  );
}

function ConnectionBadge({
  match,
  waiting,
}: {
  match: ReturnType<typeof useMatch>;
  waiting: boolean;
}) {
  const state =
    match.connection !== 'open'
      ? { text: 'desconectado', cls: 'bad' }
      : waiting
        ? { text: 'esperando oponente', cls: 'warn' }
        : match.peerOnline
          ? { text: 'oponente conectado', cls: 'ok' }
          : { text: 'oponente caiu', cls: 'warn' };
  return <span className={`badge ${state.cls}`}>{state.text}</span>;
}
