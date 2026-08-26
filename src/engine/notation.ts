/**
 * Notacao canonica da literatura: `b2-c2A`.
 * Sufixo A = aproximacao, W = afastamento (withdrawal), nenhum = paika.
 */
import type { Move } from './moves.js';

export function toNotation(move: Move): string {
  return `${move.from}-${move.to}${move.kind === 'P' ? '' : move.kind}`;
}

export function parseNotation(text: string): { from: string; to: string; kind: 'P' | 'A' | 'W' } {
  const m = /^([a-i][1-5])-([a-i][1-5])([AW])?$/.exec(text.trim());
  if (!m) throw new Error(`notacao invalida: ${text}`);
  return { from: m[1], to: m[2], kind: (m[3] as 'A' | 'W') ?? 'P' };
}
