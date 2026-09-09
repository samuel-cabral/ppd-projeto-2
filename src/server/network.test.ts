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
/** Janela de reconexao/sobrevida usada pelo servidor sob teste. */
const ABANDON_MS = 2000;
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

/**
 * Senta os dois clientes com os assentos determinados: `a` fica com as brancas.
 *
 * O `await` entre os dois `join` nao e decoracao. Sao dois sockets
 * independentes, entao a ordem em que o servidor os atende nao e garantida:
 * disparar os dois seguidos deixa o assento no acaso, e o teste passa a falhar
 * de forma intermitente com um erro que nada tem a ver com o que ele queria
 * provar (`NOT_YOUR_TURN` no lugar de `ILLEGAL_MOVE`, porque quem jogou tinha
 * recebido as pretas).
 *
 * O servidor esta certo — quem chega primeiro leva as brancas. Quem precisava
 * declarar a ordem era o teste.
 */
async function seatBoth(a: TestClient, b: TestClient, matchId: string): Promise<void> {
  a.send({ t: 'join', matchId });
  await a.wait('joined');
  b.send({ t: 'join', matchId });
  await b.wait('joined');
}

beforeAll(async () => {
  execFileSync('node', ['scripts/build-server.mjs'], { stdio: 'ignore' });
  server = spawn('node', ['dist/server/index.js'], {
    // Janela de reconexao curta: o teste precisa ver o que acontece DEPOIS
    // dela expirar, e cinco minutos de verdade nao cabem numa suite.
    env: { ...process.env, PORT: String(PORT), FANORONA_ABANDON_MS: String(ABANDON_MS) },
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
    await seatBoth(a, b, matchId);
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
    await seatBoth(a, b, matchId);
    // Guarda o estado inicial, para provar depois que a recusa nao mexeu em nada.
    const antes = (
      await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing')
    ).snapshot;
    // Descarta o 'state' de "aguardando" que ficou na fila antes deste.
    a.clear();

    // a1-a2 e paika: existe captura disponivel, entao esta proibido.
    a.send({ t: 'move', from: 'a1', to: 'a2', kind: 'P' });
    const err = await a.wait('error');
    expect(err.code).toBe('ILLEGAL_MOVE');

    // Um lance recusado nao gera 'state' nenhum: se o servidor tivesse aplicado
    // o lance, este wait resolveria com um snapshot novo em vez de estourar.
    await expect(a.wait('state', undefined, 300)).rejects.toThrow(/timeout/);
    expect(antes.turn).toBe('W');
    expect(antes.board.filter((c) => c === 'W')).toHaveLength(22);
    expect(antes.board.filter((c) => c === 'B')).toHaveLength(22);

    a.close();
    b.close();
  });

  it('dois clientes jogam uma partida completa ate a vitoria', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    await seatBoth(a, b, matchId);

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
    await seatBoth(a, b, matchId);
    await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');

    a.send({ t: 'resign' });
    const over = await b.wait('over');
    expect(over).toMatchObject({ winner: 'B', reason: 'resign' });

    a.close();
    b.close();
  });

  it('fim de jogo congela o resultado e a partida some depois da sobrevida', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    await seatBoth(a, b, matchId);
    await a.wait('state', (m) => (m as { snapshot: Snapshot }).snapshot.status === 'playing');

    a.send({ t: 'resign' });
    expect(await b.wait('over')).toMatchObject({ winner: 'B', reason: 'resign' });

    // O perdedor fecha a aba DEPOIS do fim. Isso nao pode virar abandono: o
    // vencedor ja venceu, e um segundo `over` trocaria o motivo na tela dele.
    a.close();
    await expect(b.wait('over', undefined, ABANDON_MS + 400)).rejects.toThrow(/timeout/);

    // E a partida encerrada nao fica viva para sempre segurando a thread dela.
    const info = await fetch(`${BASE}/api/match?id=${matchId}`);
    expect(info.status).toBe(404);

    b.close();
  }, 15_000);

  it('chat chega aos dois lados e o historico e reenviado numa reconexao', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'join', matchId });
    const joinedA = await a.wait('joined');
    b.send({ t: 'join', matchId });
    const playing = (m: ServerMessage) => (m as { snapshot: Snapshot }).snapshot.status === 'playing';
    await Promise.all([a.wait('state', playing), b.wait('state', playing)]);
    a.clear();
    b.clear();

    b.send({ t: 'chat', text: 'boa partida' });
    const [chatA, chatB] = await Promise.all([a.wait('chat'), b.wait('chat')]);
    expect(chatA).toMatchObject({ from: 'B', text: 'boa partida' });
    expect(chatB).toMatchObject({ from: 'B', text: 'boa partida' });

    // quem reconecta recebe o historico via replay, mesmo sem ter visto a mensagem ao vivo.
    a.close();
    const again = new TestClient();
    await again.open();
    again.send({ t: 'join', matchId, playerId: joinedA.playerId });
    await again.wait('joined');
    const replay = await again.wait('chat');
    expect(replay).toMatchObject({ from: 'B', text: 'boa partida' });

    again.close();
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
  it('o terceiro a entrar recebe MATCH_FULL e nao ocupa assento', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    const c = new TestClient();
    await Promise.all([a.open(), b.open(), c.open()]);

    a.send({ t: 'join', matchId });
    await a.wait('joined');
    b.send({ t: 'join', matchId });
    await b.wait('joined');

    // Nao existe espectador: os dois assentos ja estao ocupados.
    c.send({ t: 'join', matchId });
    const err = await c.wait('error');
    expect(err.code).toBe('MATCH_FULL');

    // A recusa nao derruba a conexao nem cria um terceiro assento.
    expect(c.socket.readyState).toBe(c.socket.OPEN);
    const info = await (await fetch(`${BASE}/api/match?id=${matchId}`)).json();
    expect(info.seats).toBe(2);

    a.close();
    b.close();
    c.close();
  });

  it('sequencia e opcional: endTurn encerra a jogada e passa a vez', async () => {
    const matchId = await createMatch();
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.open(), b.open()]);
    await seatBoth(a, b, matchId);

    const playing = (m: ServerMessage) => (m as { snapshot: Snapshot }).snapshot.status === 'playing';
    const [first] = await Promise.all([a.wait('state', playing), b.wait('state', playing)]);
    let snapshot = first.snapshot;
    a.clear();
    b.clear();
    const clients = { W: a, B: b };

    // Nenhum lance de abertura abre sequencia: joga ate uma aparecer.
    let rng = 20260905;
    const pick = (n: number) => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng % n;
    };
    let plies = 0;
    while (!snapshot.sequence && snapshot.status === 'playing' && plies < 200) {
      const move = snapshot.legalMoves[pick(snapshot.legalMoves.length)];
      clients[snapshot.turn].send({ t: 'move', from: move.from, to: move.to, kind: move.kind });
      snapshot = (await a.wait('state')).snapshot;
      await b.wait('state');
      plies++;
    }
    expect(snapshot.sequence).not.toBeNull();

    // Durante a sequencia o turno NAO virou, e so ha lances de captura.
    const emSequencia = snapshot.turn;
    expect(snapshot.legalMoves.every((m) => m.captures.length > 0)).toBe(true);
    expect(snapshot.legalMoves.every((m) => m.from === snapshot.sequence!.at)).toBe(true);

    // Regra 3.4.5: continuar e opcional. Encerrar e sempre aceito.
    clients[emSequencia].send({ t: 'endTurn' });
    const depois = (await a.wait('state')).snapshot;
    expect(depois.sequence).toBeNull();
    expect(depois.turn).not.toBe(emSequencia);

    a.close();
    b.close();
  }, 30_000);
});
