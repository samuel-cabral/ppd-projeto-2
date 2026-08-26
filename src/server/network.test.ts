/**
 * Teste de integracao do protocolo: sobe o servidor de verdade em porta
 * efemera e conecta DOIS clientes WebSocket reais, que jogam uma partida
 * inteira ate a vitoria. Ver docs/05-testes.md secao 5.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/protocol.js';

const PORT = 3100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

/** Cliente de terminal minimo: fila de mensagens + espera por predicado. */
class TestClient {
  private queue: ServerMessage[] = [];
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: never) => void }[] = [];
  readonly socket: WebSocket;

  constructor() {
    this.socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    this.socket.on('message', (raw) => {
      const msg: ServerMessage = JSON.parse(raw.toString());
      const hit = this.waiters.findIndex((w) => w.match(msg));
      if (hit >= 0) this.waiters.splice(hit, 1)[0].resolve(msg as never);
      else this.queue.push(msg);
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  wait<T extends ServerMessage['t']>(t: T, extra?: (m: ServerMessage) => boolean, ms = 5000) {
    const match = (m: ServerMessage) => m.t === t && (!extra || extra(m));
    const found = this.queue.findIndex(match);
    if (found >= 0) return Promise.resolve(this.queue.splice(found, 1)[0] as Extract<ServerMessage, { t: T }>);
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando '${t}'`)), ms);
      this.waiters.push({
        match,
        resolve: ((m: ServerMessage) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        }) as never,
      });
    });
  }

  /** Descarta mensagens antigas ja enfileiradas, para o proximo wait ser o novo estado. */
  clear(): void {
    this.queue = [];
  }

  close(): void {
    this.socket.close();
  }
}

async function createMatch(): Promise<string> {
  const res = await fetch(`${BASE}/api/match`, { method: 'POST' });
  const body = (await res.json()) as { matchId: string };
  return body.matchId;
}

beforeAll(async () => {
  execFileSync('node', ['scripts/build-server.mjs'], { stdio: 'ignore' });
  server = spawn('node', ['dist/server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('servidor nao subiu')), 10_000);
    server.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('ouvindo')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}, 30_000);

afterAll(() => {
  server?.kill('SIGKILL');
});

describe('protocolo em rede', () => {
  it('o primeiro a entrar recebe as brancas e joga primeiro', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);

    a.send({ t: 'join', matchId });
    const joinedA = await a.wait('joined');
    expect(joinedA.color).toBe('W');

    b.send({ t: 'join', matchId });
    const joinedB = await b.wait('joined');
    expect(joinedB.color).toBe('B');

    const state = await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');
    expect(state.snapshot.turn).toBe('W');
    expect(state.snapshot.legalMoves).toHaveLength(5);

    a.close();
    b.close();
  });

  it('rejeita lance fora do turno sem derrubar a conexao', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    b.send({ t: 'join', matchId });
    await b.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');

    b.send({ t: 'move', from: 'd4', to: 'e3', kind: 'A' });
    const err = await b.wait('error');
    expect(err.code).toBe('NOT_YOUR_TURN');
    expect(b.socket.readyState).toBe(WebSocket.OPEN);

    a.close();
    b.close();
  });

  it('rejeita lance ilegal', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    b.send({ t: 'join', matchId });
    await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');

    // a1-a2 e paika: existe captura disponivel, entao esta proibido.
    a.send({ t: 'move', from: 'a1', to: 'a2', kind: 'P' });
    const err = await a.wait('error');
    expect(err.code).toBe('ILLEGAL_MOVE');

    a.close();
    b.close();
  });

  it('dois clientes jogam uma partida completa ate a vitoria', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    b.send({ t: 'join', matchId });

    // Espera os DOIS chegarem ao estado inicial antes de limpar as filas,
    // senao um deles fica um estado atrasado no resto do teste.
    const playing = (m: ServerMessage) => (m as { snapshot: Snapshot }).snapshot.status === 'playing';
    const [first] = await Promise.all([a.wait('state', playing), b.wait('state', playing)]);
    let snapshot = first.snapshot;
    a.clear();
    b.clear();
    const clients = { W: a, B: b };
    let rng = 20260826;
    const pick = (n: number) => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng % n;
    };

    let plies = 0;
    while (snapshot.status === 'playing' && plies < 500) {
      const client = clients[snapshot.turn];
      // Sequencia e opcional: as vezes o jogador encerra a jogada.
      if (snapshot.sequence && pick(4) === 0) {
        client.send({ t: 'endTurn' });
      } else {
        const move = snapshot.legalMoves[pick(snapshot.legalMoves.length)];
        client.send({ t: 'move', from: move.from, to: move.to, kind: move.kind });
      }
      // Os DOIS clientes veem exatamente o mesmo estado — nao existe delta.
      const [sa, sb] = await Promise.all([a.wait('state'), b.wait('state')]);
      expect(sa.snapshot).toEqual(sb.snapshot);
      snapshot = sa.snapshot;
      expect(snapshot.captured.W + snapshot.board.filter((c) => c === 'W').length).toBe(22);
      expect(snapshot.captured.B + snapshot.board.filter((c) => c === 'B').length).toBe(22);
      plies++;
    }

    expect(snapshot.status).toBe('over');
    expect(snapshot.legalMoves).toEqual([]);
    expect(snapshot.over?.winner).toMatch(/^[WB]$/);
    console.log(`partida completa em ${plies} lances, vencedor ${snapshot.over?.winner}`);

    a.close();
    b.close();
  }, 30_000);

  it('desistencia encerra a partida com vitoria do adversario', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    b.send({ t: 'join', matchId });
    await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');

    a.send({ t: 'resign' });
    const over = await b.wait('over');
    expect(over).toMatchObject({ winner: 'B', reason: 'resign' });

    a.close();
    b.close();
  });

  it('reconexao com o mesmo playerId reata no mesmo assento', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    const joined = await a.wait('joined');
    b.send({ t: 'join', matchId });
    await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');
    a.close();

    const again = new TestClient();
    await again.open();
    again.send({ t: 'join', matchId, playerId: joined.playerId });
    const rejoined = await again.wait('joined');
    expect(rejoined.color).toBe('W');
    expect(rejoined.playerId).toBe(joined.playerId);
    // O worker continuou vivo: o estado volta intacto.
    const state = await again.wait('state');
    expect(state.snapshot.status).toBe('playing');

    again.close();
    b.close();
  });
});
