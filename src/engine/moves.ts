/**
 * Regras do Fanorona: geracao de lances, captura, sequencia e fim de jogo.
 * Ver docs/01-visao-de-produto.md secao 3.
 *
 * Internamente tudo trabalha com indices 0..44. A conversao para notacao
 * algebrica acontece so na fronteira (toMove / snapshot).
 */
import {
  type Cell,
  type Color,
  type Dir,
  type Point,
  countPieces,
  dirsFrom,
  idx,
  isStrong,
  opposite,
  other,
  sameDir,
  step,
  toIndex,
  toPoint,
} from './board.js';

/** paika, aproximacao, afastamento (withdrawal). */
export type Kind = 'P' | 'A' | 'W';

/** Lance ja resolvido: as pecas que caem viajam junto (requisito 6 da UI). */
export interface Move {
  from: Point;
  to: Point;
  kind: Kind;
  captures: Point[];
}

/** Mesma coisa em indices, para uso interno do motor. */
export interface RawMove {
  from: number;
  to: number;
  dir: Dir;
  kind: Kind;
  captures: number[];
}

export function toMove(m: RawMove): Move {
  return {
    from: toPoint(m.from),
    to: toPoint(m.to),
    kind: m.kind,
    captures: m.captures.map(toPoint),
  };
}

/**
 * Anda a partir de `start` na direcao `dir` enquanto encontrar pecas inimigas.
 * Para no primeiro vazio, na primeira peca propria ou na borda.
 */
function sweep(board: readonly Cell[], start: number, dir: Dir, enemy: Color): number[] {
  const taken: number[] = [];
  let cur = start;
  while (cur >= 0 && board[cur] === enemy) {
    taken.push(cur);
    cur = step(cur, dir);
  }
  return taken;
}

/**
 * Todos os lances pseudo-legais de uma peca — antes de aplicar a
 * obrigatoriedade de captura. Um mesmo par (from, to) pode aparecer duas
 * vezes: uma como 'A' e outra como 'W'. E exatamente a regra 3.4.2, e por
 * isso a UI precisa de um seletor.
 */
function movesFromPoint(board: readonly Cell[], from: number, color: Color): RawMove[] {
  const enemy = other(color);
  const out: RawMove[] = [];

  for (const dir of dirsFrom(from)) {
    const to = step(from, dir);
    if (to < 0 || board[to] !== null) continue;

    // Captura por aproximacao: a inimiga esta na continuacao da linha.
    const ahead = step(to, dir);
    if (ahead >= 0 && board[ahead] === enemy) {
      out.push({ from, to, dir, kind: 'A', captures: sweep(board, ahead, dir, enemy) });
    }

    // Captura por afastamento: a inimiga esta atras, e a peca se afasta dela.
    const behind = step(from, opposite(dir));
    if (behind >= 0 && board[behind] === enemy) {
      out.push({
        from,
        to,
        dir,
        kind: 'W',
        captures: sweep(board, behind, opposite(dir), enemy),
      });
    }

    // Paika: so existe se aquele destino nao capturou de nenhum dos dois jeitos.
    const captures = out.some((m) => m.to === to && m.from === from && m.kind !== 'P');
    if (!captures) {
      out.push({ from, to, dir, kind: 'P', captures: [] });
    }
  }
  return out;
}

function allMoves(board: readonly Cell[], color: Color): RawMove[] {
  const out: RawMove[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === color) out.push(...movesFromPoint(board, i, color));
  }
  return out;
}

/** Estado de uma jogada em curso com varias capturas encadeadas. */
export interface Sequence {
  at: number;
  visited: number[];
  lastDir: Dir;
}

/**
 * Lances legais na posicao. Regra 3.4.1: se existe qualquer captura,
 * os paika somem da lista. Invariante 3 do protocolo.
 */
export function legalMoves(
  board: readonly Cell[],
  color: Color,
  sequence: Sequence | null = null,
): RawMove[] {
  if (sequence) return continuationMoves(board, color, sequence);
  const all = allMoves(board, color);
  const capturing = all.filter((m) => m.captures.length > 0);
  return capturing.length > 0 ? capturing : all;
}

/**
 * Continuacoes de uma sequencia (regra 3.4.4):
 *  - so lances que capturam;
 *  - nao pode voltar a um ponto ja visitado nesta jogada;
 *  - nao pode repetir a direcao do lance anterior.
 */
export function continuationMoves(
  board: readonly Cell[],
  color: Color,
  seq: Sequence,
): RawMove[] {
  return movesFromPoint(board, seq.at, color).filter(
    (m) =>
      m.captures.length > 0 &&
      !sameDir(m.dir, seq.lastDir) &&
      !seq.visited.includes(m.to),
  );
}

export function findMove(
  moves: readonly RawMove[],
  from: number,
  to: number,
  kind: Kind,
): RawMove | undefined {
  return moves.find((m) => m.from === from && m.to === to && m.kind === kind);
}

/**
 * Aplica o lance no tabuleiro (muta o array recebido) e devolve a sequencia
 * resultante: nao-nula quando o jogador ainda pode encadear outra captura.
 * Continuar e opcional (regra 3.4.5) — quem decide e o jogador, via endTurn.
 */
export function applyMove(
  board: Cell[],
  color: Color,
  move: RawMove,
  seq: Sequence | null,
): Sequence | null {
  board[move.to] = color;
  board[move.from] = null;
  for (const c of move.captures) board[c] = null;

  if (move.captures.length === 0) return null; // paika sempre encerra o turno

  const visited = seq ? [...seq.visited, move.to] : [move.from, move.to];
  const next: Sequence = { at: move.to, visited, lastDir: move.dir };
  return continuationMoves(board, color, next).length > 0 ? next : null;
}

export type OverReason = 'capture' | 'nomoves' | 'resign' | 'abandoned';

export interface Outcome {
  winner: Color | null;
  reason: OverReason;
}

/**
 * Fim de partida (regra 3.5): adversario zerado, ou sem lance legal.
 * Chamada depois de o turno virar, para `turn` = quem vai jogar agora.
 */
export function checkOver(board: readonly Cell[], turn: Color): Outcome | null {
  if (countPieces(board, turn) === 0) return { winner: other(turn), reason: 'capture' };
  if (legalMoves(board, turn).length === 0) return { winner: other(turn), reason: 'nomoves' };
  return null;
}

// Reexports usados pelos consumidores do motor, para nao precisarem conhecer board.ts.
export { toIndex, toPoint, idx, isStrong, countPieces, other };
