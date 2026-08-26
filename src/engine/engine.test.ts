import { describe, expect, it } from 'vitest';
import {
  type Cell,
  type Color,
  SIZE,
  countPieces,
  dirsFrom,
  initialBoard,
  isStrong,
  toIndex,
} from './board.js';
import {
  type Sequence,
  applyMove,
  checkOver,
  continuationMoves,
  legalMoves,
  toMove,
} from './moves.js';
import { toNotation } from './notation.js';

/** Tabuleiro vazio com as pecas indicadas, para montar posicoes de teste. */
function boardWith(spec: Record<string, Color>): Cell[] {
  const board: Cell[] = new Array(SIZE).fill(null);
  for (const [point, color] of Object.entries(spec)) board[toIndex(point)] = color;
  return board;
}

function notations(board: readonly Cell[], color: Color, seq: Sequence | null = null): string[] {
  return legalMoves(board, color, seq).map((m) => toNotation(toMove(m))).sort();
}

describe('geometria', () => {
  it('e3 e forte e tem 8 direcoes; e2 e fraco e tem 4', () => {
    expect(isStrong(toIndex('e3'))).toBe(true);
    expect(dirsFrom(toIndex('e3'))).toHaveLength(8);
    expect(isStrong(toIndex('e2'))).toBe(false);
    expect(dirsFrom(toIndex('e2'))).toHaveLength(4);
  });

  it('os quatro cantos sao fortes', () => {
    for (const p of ['a1', 'i1', 'a5', 'i5']) expect(isStrong(toIndex(p))).toBe(true);
  });
});

describe('posicao inicial', () => {
  it('tem 45 casas, 22 de cada cor e e3 vazio', () => {
    const board = initialBoard();
    expect(board).toHaveLength(45);
    expect(countPieces(board, 'W')).toBe(22);
    expect(countPieces(board, 'B')).toBe(22);
    expect(board[toIndex('e3')]).toBeNull();
  });

  it('a linha 3 inverte a paridade depois do centro', () => {
    const board = initialBoard();
    expect(board[toIndex('d3')]).toBe('W');
    expect(board[toIndex('f3')]).toBe('B');
    expect(board[toIndex('a3')]).toBe('B');
    expect(board[toIndex('i3')]).toBe('W');
  });
});

describe('teste-ouro: a abertura do paper', () => {
  it('as brancas tem exatamente cinco lances legais', () => {
    expect(notations(initialBoard(), 'W')).toEqual([
      'd2-e3A',
      'd3-e3A',
      'd3-e3W',
      'e2-e3A',
      'f2-e3A',
    ]);
  });

  it('cada abertura derruba as pecas certas', () => {
    const moves = legalMoves(initialBoard(), 'W').map(toMove);
    const by = (n: string) => moves.find((m) => toNotation(m) === n)!.captures;
    expect(by('d2-e3A')).toEqual(['f4', 'g5']);
    expect(by('d3-e3A')).toEqual(['f3']);
    expect(by('d3-e3W')).toEqual(['c3']);
    expect(by('e2-e3A')).toEqual(['e4', 'e5']);
    expect(by('f2-e3A')).toEqual(['d4', 'c5']);
  });

  it('nenhum paika aparece quando existe captura', () => {
    expect(legalMoves(initialBoard(), 'W').every((m) => m.captures.length > 0)).toBe(true);
  });
});

describe('captura', () => {
  it('aproximacao derruba a fila ate o primeiro vazio', () => {
    const board = boardWith({ b2: 'W', d2: 'B', e2: 'B', g2: 'B' });
    const move = legalMoves(board, 'W')
      .map(toMove)
      .find((m) => toNotation(m) === 'b2-c2A')!;
    expect(move.captures).toEqual(['d2', 'e2']); // f2 vazio interrompe, g2 sobrevive
  });

  it('afastamento para na primeira peca propria', () => {
    const board = boardWith({ f4: 'W', g4: 'B', h4: 'W', i4: 'B' });
    const move = legalMoves(board, 'W')
      .map(toMove)
      .find((m) => toNotation(m) === 'f4-e4W')!;
    expect(move.captures).toEqual(['g4']); // h4 e branca, i4 sobrevive
  });

  it('nao existe captura na esquina', () => {
    // A preta em c3 nao esta na extensao da linha do movimento b1-b2.
    const board = boardWith({ b1: 'W', c3: 'B' });
    expect(legalMoves(board, 'W').every((m) => m.captures.length === 0)).toBe(true);
  });

  it('o mesmo destino pode ser aproximacao ou afastamento, com capturas diferentes', () => {
    const moves = legalMoves(initialBoard(), 'W').map(toMove);
    const a = moves.find((m) => m.from === 'd3' && m.to === 'e3' && m.kind === 'A')!;
    const w = moves.find((m) => m.from === 'd3' && m.to === 'e3' && m.kind === 'W')!;
    expect(a.captures).not.toEqual(w.captures);
  });
});

describe('sequencia de capturas', () => {
  it('nao oferece repetir a direcao do lance anterior', () => {
    const board = boardWith({ f4: 'W', g4: 'B', c4: 'B', b4: 'B' });
    const first = legalMoves(board, 'W').find(
      (m) => toNotation(toMove(m)) === 'f4-e4W',
    )!;
    const seq = applyMove(board, 'W', first, null);
    // e4-d4A capturaria c4 e b4, mas repete a direcao (-1,0) — fica de fora.
    expect(seq === null || !notations(board, 'W', seq).includes('e4-d4A')).toBe(true);
  });

  it('uma sequencia de N capturas nao passa a vez no meio', () => {
    // b2 captura d2/e2 indo para c2; de c2 ainda ha captura para cima.
    const board = boardWith({ b2: 'W', d2: 'B', e2: 'B', c4: 'B', c5: 'B' });
    const first = legalMoves(board, 'W')
      .find((m) => toNotation(toMove(m)) === 'b2-c2A')!;
    const seq = applyMove(board, 'W', first, null);
    expect(seq).not.toBeNull();
    expect(seq!.at).toBe(toIndex('c2'));
    expect(continuationMoves(board, 'W', seq!).length).toBeGreaterThan(0);
  });

  it('nao oferece voltar a um ponto ja visitado', () => {
    const board = boardWith({ b2: 'W', d2: 'B', e2: 'B', c4: 'B', c5: 'B' });
    const first = legalMoves(board, 'W')
      .find((m) => toNotation(toMove(m)) === 'b2-c2A')!;
    const seq = applyMove(board, 'W', first, null)!;
    expect(continuationMoves(board, 'W', seq).every((m) => m.to !== toIndex('b2'))).toBe(true);
  });
});

describe('fim de partida', () => {
  it('adversario zerado e vitoria por captura', () => {
    const board = boardWith({ a1: 'W' });
    expect(checkOver(board, 'B')).toEqual({ winner: 'W', reason: 'capture' });
  });

  it('sem lance legal e derrota de quem esta na vez', () => {
    // A preta em a5 esta cercada por brancas em a4, b5 e b4.
    const board = boardWith({ a5: 'B', a4: 'W', b5: 'W', b4: 'W' });
    expect(checkOver(board, 'B')).toEqual({ winner: 'W', reason: 'nomoves' });
  });
});

describe('invariantes por simulacao', () => {
  it('200 partidas aleatorias terminam sem quebrar as contagens', () => {
    let rng = 123456789;
    const next = (n: number) => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng % n;
    };

    let totalPlies = 0;
    for (let game = 0; game < 200; game++) {
      const board = initialBoard();
      const captured = { W: 0, B: 0 };
      let turn: Color = 'W';
      let seq: Sequence | null = null;
      let plies = 0;

      while (plies < 600) {
        const moves = legalMoves(board, turn, seq);
        if (moves.length === 0) break;
        // Sequencia e opcional: as vezes o jogador aleatorio encerra a jogada.
        if (seq && next(4) === 0) {
          seq = null;
          turn = turn === 'W' ? 'B' : 'W';
          continue;
        }
        const move = moves[next(moves.length)];
        const enemy: Color = turn === 'W' ? 'B' : 'W';
        const before = countPieces(board, enemy);
        seq = applyMove(board, turn, move, seq);
        const after = countPieces(board, enemy);
        captured[enemy] += before - after;
        expect(after).toBeLessThanOrEqual(before);

        expect(countPieces(board, 'W') + captured.W).toBe(22);
        expect(countPieces(board, 'B') + captured.B).toBe(22);

        if (!seq) {
          turn = enemy;
          if (checkOver(board, turn)) break;
        }
        plies++;
      }
      expect(plies).toBeLessThan(600); // nenhum laco infinito
      totalPlies += plies;
    }
    expect(totalPlies / 200).toBeGreaterThan(10);
  });
});
