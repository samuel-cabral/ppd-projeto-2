/**
 * Worker de partida: uma thread por partida em andamento.
 *
 * A regra que organiza o sistema (docs/02-arquitetura.md secao 1):
 * a thread principal nunca calcula regra de jogo, e o worker nunca toca em
 * socket. Este arquivo nao importa `ws`. So conhece mensagens.
 */
import { parentPort } from 'node:worker_threads';
import {
  type Cell,
  type Color,
  countPieces,
  initialBoard,
  other,
  toIndex,
  toPoint,
} from '../engine/board.js';
import {
  type Outcome,
  type Sequence,
  applyMove,
  checkOver,
  findMove,
  legalMoves,
  toMove,
} from '../engine/moves.js';
import { toNotation } from '../engine/notation.js';
import type { ErrorCode, FromWorker, Snapshot, ToWorker } from '../shared/protocol.js';

if (!parentPort) throw new Error('match.worker precisa rodar como worker_thread');
const port = parentPort;

let matchId = '';
const board: Cell[] = initialBoard();
let turn: Color = 'W'; // brancas jogam primeiro — quem inicia e definido aqui
let sequence: Sequence | null = null;
const captured = { W: 0, B: 0 };
const history: string[] = [];
let over: Outcome | null = null;
/** playerId -> cor. E a credencial que o worker usa para autorizar um lance. */
const players = new Map<string, Color>();

function send(msg: FromWorker): void {
  port.postMessage(msg);
}

function status(): Snapshot['status'] {
  if (over) return 'over';
  return players.size < 2 ? 'waiting' : 'playing';
}

function snapshot(): Snapshot {
  return {
    board: [...board],
    turn,
    // Invariante 5: partida encerrada nao oferece lance nenhum.
    legalMoves: over ? [] : legalMoves(board, turn, sequence).map(toMove),
    sequence: sequence
      ? {
          at: toPoint(sequence.at),
          visited: sequence.visited.map(toPoint),
          lastDir: [sequence.lastDir[0], sequence.lastDir[1]],
        }
      : null,
    captured: { ...captured },
    history: [...history],
    status: status(),
    thinking: false,
    over: over ? { winner: over.winner, reason: over.reason } : null,
  };
}

function broadcast(): void {
  send({ t: 'state', snapshot: snapshot() });
}

/**
 * Cada pedido recebe exatamente UMA resposta `done` com o mesmo `req`.
 * E isso que deixa a thread principal devolver o resultado da chamada RPC
 * certa: o worker processa uma mensagem por vez, mas quem pergunta precisa
 * saber qual resposta e a sua.
 */
function done(req: number, code?: ErrorCode): void {
  send({ t: 'done', req, code });
}

function finish(outcome: Outcome): void {
  over = outcome;
  sequence = null;
  broadcast();
  send({ t: 'over', winner: outcome.winner, reason: outcome.reason });
}

/** Passa a vez e checa se o proximo jogador ainda tem partida. */
function endTurn(): void {
  sequence = null;
  turn = other(turn);
  const outcome = checkOver(board, turn);
  if (outcome) finish(outcome);
  else broadcast();
}

/** Retorna o motivo da recusa, ou null quando o lance foi aplicado. */
function handleIntent(
  playerId: string,
  from: string,
  to: string,
  kind: 'P' | 'A' | 'W',
): ErrorCode | null {
  const color = players.get(playerId);
  if (!color) return 'MATCH_NOT_FOUND';
  if (over || status() !== 'playing') return 'NOT_YOUR_TURN';
  if (color !== turn) return 'NOT_YOUR_TURN';

  // A autoridade e exercida aqui: a lista de lances legais e recalculada a
  // cada intencao. Um cliente adulterado nao consegue forjar nada.
  const move = findMove(legalMoves(board, turn, sequence), toIndex(from), toIndex(to), kind);
  if (!move) return 'ILLEGAL_MOVE';

  history.push(toNotation(toMove(move)));
  const enemy = other(turn);
  const before = countPieces(board, enemy);
  sequence = applyMove(board, turn, move, sequence);
  captured[enemy] += before - countPieces(board, enemy);

  if (countPieces(board, enemy) === 0) {
    finish({ winner: turn, reason: 'capture' });
    return null;
  }
  // Sequencia em curso mantem o turno: uma jogada de N capturas e UM turno.
  if (sequence) broadcast();
  else endTurn();
  return null;
}

port.on('message', (msg: ToWorker) => {
  switch (msg.t) {
    case 'init':
      matchId = msg.matchId;
      return;

    case 'attach':
      players.set(msg.playerId, msg.color);
      broadcast();
      return;

    case 'intent': {
      const code = handleIntent(msg.playerId, msg.move.from, msg.move.to, msg.move.kind);
      done(msg.req, code ?? undefined);
      return;
    }

    case 'endTurn': {
      const color = players.get(msg.playerId);
      if (!color) return done(msg.req, 'MATCH_NOT_FOUND');
      // Continuar a sequencia e opcional (regra 3.4.5); encerrar so faz
      // sentido no proprio turno e com uma sequencia em curso.
      if (over || color !== turn || !sequence) return done(msg.req, 'NOT_YOUR_TURN');
      endTurn();
      done(msg.req);
      return;
    }

    case 'resign': {
      const color = players.get(msg.playerId);
      if (!color) return done(msg.req, 'MATCH_NOT_FOUND');
      // Desistir de partida ja encerrada nao muda nada, mas tambem nao e erro.
      if (!over) finish({ winner: other(color), reason: 'resign' });
      done(msg.req);
      return;
    }
  }
});

void matchId; // guardado para log/depuracao da thread
