/**
 * Geometria do tabuleiro Fanoron-Sivy (9x5).
 *
 * Este modulo nao importa NADA. E a base do motor de regras: sem rede, sem
 * threads, sem React. Ver docs/02-arquitetura.md secao 2.
 */

export type Color = 'W' | 'B';
export type Cell = Color | null;
/** Notacao algebrica: colunas a-i (1..9), linhas 1-5 de baixo para cima. */
export type Point = string;

export const COLS = 9;
export const ROWS = 5;
export const SIZE = COLS * ROWS; // 45 pontos

/** indice = (linha-1) * 9 + (coluna-1) — mesma convencao do Snapshot.board. */
export function idx(col: number, row: number): number {
  return (row - 1) * COLS + (col - 1);
}

export function colOf(i: number): number {
  return (i % COLS) + 1;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS) + 1;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 1 && col <= COLS && row >= 1 && row <= ROWS;
}

/**
 * Ponto forte: (coluna + linha) par — ate 8 vizinhos, inclui as diagonais.
 * Ponto fraco: impar — so as 4 ortogonais.
 * Conferido contra o paper: e2 (5+2=7) e fraco, e3 (5+3=8) e forte.
 */
export function isStrong(i: number): boolean {
  return (colOf(i) + rowOf(i)) % 2 === 0;
}

export function toPoint(i: number): Point {
  return String.fromCharCode(96 + colOf(i)) + String(rowOf(i));
}

export function toIndex(p: Point): number {
  const col = p.charCodeAt(0) - 96;
  const row = Number(p.slice(1));
  if (!inBounds(col, row)) throw new Error(`ponto fora do tabuleiro: ${p}`);
  return idx(col, row);
}

/** True se a string e um ponto valido. Usada na fronteira da rede. */
export function isPoint(p: unknown): p is Point {
  if (typeof p !== 'string' || p.length !== 2) return false;
  const col = p.charCodeAt(0) - 96;
  const row = Number(p[1]);
  return Number.isInteger(row) && inBounds(col, row);
}

export type Dir = readonly [number, number]; // [dColuna, dLinha]

/** As 4 ortogonais primeiro; as 4 diagonais so valem a partir de ponto forte. */
export const ORTHOGONAL: readonly Dir[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const DIAGONAL: readonly Dir[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export const ALL_DIRS: readonly Dir[] = [...ORTHOGONAL, ...DIAGONAL];

/** Direcoes que saem de um ponto, respeitando forte x fraco. */
export function dirsFrom(i: number): readonly Dir[] {
  return isStrong(i) ? ALL_DIRS : ORTHOGONAL;
}

/**
 * Anda um passo na direcao dada. Retorna -1 se sair do tabuleiro.
 * Nao valida se a direcao e permitida a partir de `i` — quem chama garante.
 */
export function step(i: number, [dc, dr]: Dir): number {
  const col = colOf(i) + dc;
  const row = rowOf(i) + dr;
  return inBounds(col, row) ? idx(col, row) : -1;
}

export function sameDir(a: Dir, b: Dir): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function opposite([dc, dr]: Dir): Dir {
  return [-dc, -dr];
}

/**
 * Posicao inicial: 22 brancas embaixo, 22 pretas em cima, e3 vazio.
 * Linha 3 alterna preta/branca a partir de a3, com o centro vazio.
 */
export function initialBoard(): Cell[] {
  const board: Cell[] = new Array(SIZE).fill(null);
  for (let col = 1; col <= COLS; col++) {
    board[idx(col, 1)] = 'W';
    board[idx(col, 2)] = 'W';
    board[idx(col, 4)] = 'B';
    board[idx(col, 5)] = 'B';
  }
  // Linha 3: a3=B, b3=W, c3=B, d3=W, e3 vazio, f3=B, g3=W, h3=B, i3=W
  const row3: Cell[] = ['B', 'W', 'B', 'W', null, 'B', 'W', 'B', 'W'];
  for (let col = 1; col <= COLS; col++) {
    board[idx(col, 3)] = row3[col - 1];
  }
  return board;
}

export function countPieces(board: readonly Cell[], color: Color): number {
  let n = 0;
  for (const cell of board) if (cell === color) n++;
  return n;
}

export function other(color: Color): Color {
  return color === 'W' ? 'B' : 'W';
}

/**
 * Diagonal desenhada em cada celula 8x4 — uma so por celula, alternando.
 * A celula e identificada pelo canto inferior-esquerdo (col, row).
 * Se (col+row) e par a diagonal e '/', senao e '\'. Desenhar X em toda celula
 * e o erro classico: transformaria todo ponto em forte.
 */
export function cellDiagonal(col: number, row: number): '/' | '\\' {
  return (col + row) % 2 === 0 ? '/' : '\\';
}
