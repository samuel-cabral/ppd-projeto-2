/**
 * Mini-runtime de RPC (JSON-RPC 2.0), o mesmo arquivo no navegador e no servidor.
 *
 * E o equivalente ao que o Java RMI gera sozinho:
 * - o STUB (`peer.stub`) e um objeto falso com os metodos da interface remota.
 *   Chamar `stub.move(...)` vira uma mensagem `{ jsonrpc, id, method, params }`
 *   e devolve uma Promise que resolve quando a resposta com o mesmo `id` chegar.
 * - o SKELETON e o `receive`: le a mensagem, acha o metodo local pelo nome,
 *   executa e devolve `{ id, result }` ou `{ id, error }`.
 *
 * O peer nao sabe o que e WebSocket: recebe uma funcao `send` e e alimentado
 * por `receive`. O transporte fica de fora, como o TCP fica de fora no RMI.
 * Ver docs/08-rpc.md.
 */

/** Toda operacao remota recebe UM objeto de parametros (ou nenhum). */
type AnyFn = (params: any) => unknown;

/** O lado que chama ve cada operacao como assincrona: e uma chamada pela rede. */
export type Stub<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<Awaited<R>>
    : never;
};

/** Implementacao local de uma interface remota (o "servant" do RMI). */
export type Handlers<Api> = {
  [M in keyof Api]: Api[M] extends (...args: infer P) => infer R
    ? (...args: P) => R | Promise<Awaited<R>>
    : never;
};

/** Erro de negocio que atravessa a rede. `data` carrega o codigo da aplicacao. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Codigos reservados pela especificacao JSON-RPC 2.0. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  /** Faixa -32000..-32099 e livre para a aplicacao: erro de regra do jogo. */
  APP_ERROR: -32000,
} as const;

interface Request {
  jsonrpc: '2.0';
  id?: number; // ausente = notificacao (chamada de mao unica, sem resposta)
  method: string;
  params?: unknown;
}

interface Response {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TIMEOUT_MS = 10_000;

export class RpcPeer<Remote, Local = unknown> {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** Stub: `peer.stub.move({...})` e uma chamada remota. */
  readonly stub: Stub<Remote>;

  constructor(
    private readonly send: (data: string) => void,
    private readonly local: Partial<Handlers<Local>> = {},
  ) {
    this.stub = new Proxy({} as Stub<Remote>, {
      get: (_, method) => (params?: unknown) => this.call(String(method), params),
    });
  }

  /** Chamada com resposta: espera `result` ou `error` com o mesmo id. */
  call(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(RPC.APP_ERROR, `sem resposta para '${method}'`));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send(JSON.stringify({ jsonrpc: '2.0', id, method, params } satisfies Request));
    });
  }

  /**
   * Notificacao: chamada de mao unica, sem id e sem resposta. E o que o
   * servidor usa para os callbacks (estado novo, chat, fim de jogo).
   */
  notify<M extends keyof Remote & string>(
    method: M,
    ...params: Remote[M] extends (...args: infer P) => unknown ? P : never
  ): void {
    this.send(JSON.stringify({ jsonrpc: '2.0', method, params: params[0] } satisfies Request));
  }

  /** Skeleton: toda mensagem que chega pelo transporte passa por aqui. */
  async receive(raw: string): Promise<void> {
    let msg: Partial<Request & Response>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.reply({ jsonrpc: '2.0', id: null, error: { code: RPC.PARSE_ERROR, message: 'JSON invalido' } });
    }
    if (typeof msg !== 'object' || msg === null || msg.jsonrpc !== '2.0') return;

    // Resposta de uma chamada que EU fiz.
    if (msg.method === undefined && typeof msg.id === 'number') {
      const waiting = this.pending.get(msg.id);
      if (!waiting) return;
      this.pending.delete(msg.id);
      clearTimeout(waiting.timer);
      if (msg.error) waiting.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
      else waiting.resolve(msg.result);
      return;
    }

    // Chamada que o OUTRO lado fez em mim.
    if (typeof msg.method !== 'string') return;
    const isNotification = msg.id === undefined;
    const id = typeof msg.id === 'number' ? msg.id : null;
    const handler = (this.local as Record<string, AnyFn | undefined>)[msg.method];
    if (!handler || !Object.hasOwn(this.local, msg.method)) {
      if (!isNotification) {
        this.reply({ jsonrpc: '2.0', id, error: { code: RPC.METHOD_NOT_FOUND, message: `metodo '${msg.method}' nao existe` } });
      }
      return;
    }
    try {
      const result = await handler(msg.params);
      if (!isNotification) this.reply({ jsonrpc: '2.0', id, result: result ?? null });
    } catch (err) {
      if (isNotification) return;
      const e = err instanceof RpcError ? err : new RpcError(RPC.APP_ERROR, String((err as Error)?.message ?? err));
      this.reply({ jsonrpc: '2.0', id, error: { code: e.code, message: e.message, data: e.data } });
    }
  }

  /** Transporte caiu: nenhuma chamada pendente vai ter resposta. */
  close(): void {
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new RpcError(RPC.APP_ERROR, 'conexao encerrada'));
      this.pending.delete(id);
    }
  }

  private reply(res: Response): void {
    this.send(JSON.stringify(res));
  }
}
