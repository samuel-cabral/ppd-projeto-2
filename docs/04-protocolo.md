# Protocolo

> Contexto: [`02-arquitetura.md`](02-arquitetura.md). Justificativa do formato: [ADR-003](adr/003-estado-completo-em-vez-de-delta.md).

Existem dois protocolos no sistema, com a **mesma forma**: união discriminada pelo campo `t`,
serializada em JSON.

| Protocolo | Entre | Transporte |
|---|---|---|
| §2 | navegador ⇄ thread principal | WebSocket sobre TCP |
| §3 | thread principal ⇄ worker | `postMessage` |

Que os dois sejam iguais não é coincidência: são o mesmo modelo de concorrência por
passagem de mensagem, um atravessando a rede e o outro atravessando threads.

Todos os tipos vivem em `src/shared/protocol.ts` e são importados **tanto pelo cliente
quanto pelo servidor**. Uma mensagem que mude de forma quebra a compilação dos dois lados
no mesmo instante — o compilador é quem garante que o protocolo não desalinhe.

## 1. Tipos base

```ts
type Point  = string;              // notação algébrica: 'a1' … 'i5'
type Color  = 'W' | 'B';           // brancas embaixo, pretas em cima
type Cell   = 'W' | 'B' | null;
type Kind   = 'P' | 'A' | 'W';     // paika, aproximação, afastamento (withdrawal)

interface Move {
  from: Point;
  to: Point;
  kind: Kind;
  captures: Point[];               // peças que caem se este lance for jogado
}
```

`captures` viajar junto do lance é o que permite à interface mostrar a prévia das peças
condenadas sem conhecer nenhuma regra (requisito 6 da lista de tela).

> **Atenção à letra `W`.** Ela aparece nos dois tipos com significados diferentes: em
> `Color`, `'W'` é *white* (brancas); em `Kind`, `'W'` é *withdrawal* (afastamento). A
> sobrecarga é intencional — vem da notação canônica da literatura, em que `f4-e4W`
> significa afastamento. São tipos distintos, então o compilador impede a troca.

`Point` é uma `string` por conveniência de log e de notação. Toda mensagem vinda da rede
passa por validação na fronteira da thread principal antes de virar `Point`; nada entra no
worker sem ter sido verificado.

## 2. Navegador ⇄ servidor (WebSocket)

### 2.1 Cliente → servidor

| Mensagem | Quando | Campos |
|---|---|---|
| `join` | ao abrir `/match/:id` | `matchId`, `playerId?` (presente = tentativa de reconexão) |
| `move` | jogador confirma um lance | `from`, `to`, `kind` |
| `endTurn` | jogador encerra uma sequência de capturas | — |
| `resign` | jogador desiste | — |
| `chat` | jogador envia mensagem | `text` (máx. 500 caracteres) |
| `hint` | jogador pede sugestão de lance | — |
| `setBotMode` | alterna a demonstração de threads | `inWorker: boolean` |

```ts
type ClientMessage =
  | { t: 'join';       matchId: string; playerId?: string }
  | { t: 'move';       from: Point; to: Point; kind: Kind }
  | { t: 'endTurn' }
  | { t: 'resign' }
  | { t: 'chat';       text: string }
  | { t: 'hint' }
  | { t: 'setBotMode'; inWorker: boolean };
```

O cliente envia `kind` porque um mesmo par (origem, destino) pode ser aproximação **ou**
afastamento, capturando peças diferentes. A escolha é do jogador e precisa trafegar
explicitamente — é a regra 3.4.2 do [documento de regras](01-visao-de-produto.md).

### 2.2 Servidor → cliente

```ts
type ServerMessage =
  | { t: 'joined'; playerId: string; color: Color }
  | { t: 'state';  snapshot: Snapshot }
  | { t: 'chat';   from: Color | 'system'; text: string; at: number }
  | { t: 'peer';   status: 'connected' | 'disconnected' }
  | { t: 'over';   winner: Color | null; reason: OverReason }
  | { t: 'error';  code: ErrorCode; message: string };

type OverReason = 'capture' | 'nomoves' | 'resign' | 'abandoned';
```

### 2.3 `Snapshot` — o estado completo

```ts
interface Snapshot {
  board:      Cell[];                 // 45 posições, índice = (linha-1)*9 + (coluna-1)
  turn:       Color;
  legalMoves: Move[];                 // já filtrados pela captura obrigatória
  sequence:   { at: Point; visited: Point[]; lastDir: [number, number] } | null;
  captured:   { W: number; B: number };
  history:    string[];               // ['d3-e3A', 'g4-f4W', …]
  status:     'waiting' | 'playing' | 'over';
  thinking:   boolean;                // o bot está calculando
}
```

Enviado por inteiro a cada mudança. Ocupa poucas centenas de bytes; ver
[ADR-003](adr/003-estado-completo-em-vez-de-delta.md) para o motivo de não haver delta.

Cada campo alimenta um requisito de tela:

| Campo | Requisito atendido |
|---|---|
| `board` | 1 — tabuleiro |
| `turn` | 2 — indicador de turno |
| `legalMoves` | 3, 4, 5, 6 — destaque, marcador por tipo, seletor A/W, prévia das capturas |
| `sequence` | 7 — modo sequência com peça travada e botão *Encerrar jogada* |
| `captured` | 8 — placar 22 → 0 |
| `history` | 9 — histórico em notação |
| `status` | 12 — fim de partida |

### 2.4 Códigos de erro

| Código | Significado |
|---|---|
| `MATCH_NOT_FOUND` | `matchId` inexistente ou já encerrado |
| `MATCH_FULL` | Já há dois jogadores e o `playerId` não confere |
| `NOT_YOUR_TURN` | Mensagem de lance fora do turno |
| `ILLEGAL_MOVE` | O lance não está na lista de legais |
| `SERVER_BUSY` | Limite de partidas simultâneas atingido |

Erro nunca derruba a conexão: o cliente recebe `error`, mostra o motivo e continua com o
último `snapshot` válido.

## 3. Thread principal ⇄ worker (`postMessage`)

```ts
// principal → worker
type ToWorker =
  | { t: 'init';    matchId: string }
  | { t: 'attach';  playerId: string; color: Color }
  | { t: 'intent';  playerId: string; move: { from: Point; to: Point; kind: Kind } }
  | { t: 'endTurn'; playerId: string }
  | { t: 'resign';  playerId: string }
  | { t: 'hint';    playerId: string };

// worker → principal
type FromWorker =
  | { t: 'state';    snapshot: Snapshot }
  | { t: 'rejected'; playerId: string; code: ErrorCode }
  | { t: 'hint';     playerId: string; move: Move }
  | { t: 'over';     winner: Color | null; reason: OverReason };
```

Note o que **não** existe nesta lista: nenhuma mensagem de chat. O chat nunca cruza a
fronteira de thread — ver [ADR-005](adr/005-chat-na-thread-principal.md).

## 4. Ciclo de conexão

### 4.1 Entrada

```
navegador                     thread principal                 worker
    │  abre ws://…/            │                                 │
    ├─────────────────────────>│                                 │
    │  { t:'join', matchId }   │                                 │
    ├─────────────────────────>│  cria worker se for o primeiro  │
    │                          ├────────────────────────────────>│ init
    │                          │  postMessage attach             │
    │                          ├────────────────────────────────>│ attach
    │  { t:'joined', playerId, │                                 │
    │    color:'W' }           │                                 │
    │<─────────────────────────┤                                 │
    │                          │           { t:'state' }         │
    │  { t:'state', snapshot } │<────────────────────────────────┤
    │<─────────────────────────┤                                 │
```

O `playerId` é um identificador opaco gerado pelo servidor e guardado pelo cliente em
`localStorage`. Ele é a credencial de reconexão.

### 4.2 Queda e reconexão

| Momento | Comportamento |
|---|---|
| Socket fecha | O worker **continua vivo** com o estado intacto. O oponente recebe `{ t:'peer', status:'disconnected' }` e a interface mostra *"oponente desconectado — aguardando 5:00"* |
| Reconexão dentro de 5 min | O cliente reenvia `join` com o `playerId` salvo. A thread principal reata o socket novo ao mesmo lugar e o worker reenvia o `snapshot` — a partida continua exatamente de onde parou |
| Janela expira | `over` com `reason: 'abandoned'`, vitória do jogador que permaneceu, `worker.terminate()` |

O relógio de 5 minutos vive na thread principal, não no worker: é uma preocupação de
conexão, não de jogo.

### 4.3 Detecção de queda silenciosa

TCP não avisa quando o outro lado some sem fechar (cabo arrancado, Wi-Fi caindo). Sem
tratamento, o servidor guardaria um socket morto indefinidamente.

A thread principal envia **ping a cada 30 segundos**; um cliente que não responda ao
`pong` em 10 segundos é tratado como desconectado e entra na janela de reconexão. Isso
usa o ping/pong nativo do protocolo WebSocket (RFC 6455), não uma mensagem de aplicação.

## 5. Invariantes

Valem em todo momento e podem ser verificados em qualquer `snapshot`:

1. `board` tem exatamente 45 posições.
2. `captured.W + peças brancas no tabuleiro = 22`, e o mesmo para as pretas.
3. Se algum lance em `legalMoves` tem `captures.length > 0`, então **todos** têm — a
   captura é obrigatória e os paika já foram filtrados.
4. `sequence !== null` implica `legalMoves` conter apenas lances com captura partindo de
   `sequence.at`.
5. `status === 'over'` implica `legalMoves` vazio.
