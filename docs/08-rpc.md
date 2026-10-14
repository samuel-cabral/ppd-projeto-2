# RPC: a interface de operações

> Projeto 2 (RMI/RPC). Substitui o protocolo de mensagens do Projeto 1
> ([`04-protocolo.md`](04-protocolo.md), mantido como registro). Motor, worker por partida e
> interface visual continuam os mesmos: **só a comunicação mudou**.

## 1. A ideia em uma frase

No Projeto 1, cliente e servidor trocavam **mensagens** (`{ t: 'move', ... }`) e cada lado
tinha um `switch` interpretando o que chegava. No Projeto 2, cada lado **chama métodos** do
outro, definidos numa interface com tipos. A mensagem continua existindo por baixo, mas quem
a monta e interpreta é a camada de RPC, e não o código do jogo.

```ts
// Projeto 1 (sockets)                          // Projeto 2 (RPC)
socket.send(JSON.stringify(                      await server.move({ from: 'e2', to: 'e3', kind: 'A' });
  { t: 'move', from: 'e2', to: 'e3', kind: 'A' }));
// ...e o erro chegava depois, como outra        // o erro volta como exceção DESTA chamada
// mensagem solta, num switch separado
```

## 2. A interface (`src/shared/protocol.ts`)

É o critério *Interface de Operações*. Dois contratos, um por sentido.

### Navegador → servidor: `FanoronaServer`

| Operação | Parâmetros | Retorno | Recusas possíveis |
|---|---|---|---|
| `join` | `{ matchId, playerId? }` | `{ playerId, color, matchId }` | `MATCH_NOT_FOUND`, `MATCH_FULL` |
| `move` | `{ from, to, kind }` | — | `NOT_YOUR_TURN`, `ILLEGAL_MOVE` |
| `endTurn` | — | — | `NOT_YOUR_TURN` |
| `resign` | — | — | — |
| `sendChat` | `{ text }` | — | — |

Toda operação tem resposta. `await server.move(...)` só termina depois que o worker da partida
aceitou ou recusou o lance.

### Servidor → navegador: `FanoronaClient` (callbacks)

| Callback | Parâmetros | Quando |
|---|---|---|
| `onState` | `{ snapshot }` | qualquer mudança no tabuleiro (estado completo, ADR-003) |
| `onChat` | `{ from, text, at }` | mensagem nova, ou histórico numa reconexão |
| `onPeer` | `{ status }` | adversário conectou ou caiu |
| `onOver` | `{ winner, reason }` | captura total, desistência ou abandono |

Callback é **de mão única**: o servidor avisa e não espera resposta. Precisa existir porque
RPC puro é pergunta e resposta, e o lance do adversário acontece sem que eu tenha perguntado
nada. No Java RMI isso é o *callback de cliente*: o cliente também exporta um objeto remoto,
e o servidor chama métodos nele.

### Funcionalidades do enunciado → operação

| Enunciado | Operação |
|---|---|
| Controle de turno, quem inicia | `join` (primeiro a entrar = brancas = começa) + `onState.turn` |
| Movimentação | `move`, `endTurn` (sequência de capturas é opcional) |
| Desistência | `resign` → `onOver` com `reason: 'resign'` |
| Chat durante a partida | `sendChat` → `onChat` nos dois |
| Indicação de vencedor | `onOver` |

## 3. Como a chamada vira mensagem (`src/shared/rpc.ts`)

O formato na rede é **JSON-RPC 2.0**, uma especificação pública e independente de linguagem.

```jsonc
// chamada (tem id: espera resposta)
{ "jsonrpc": "2.0", "id": 7, "method": "move", "params": { "from": "e2", "to": "e3", "kind": "A" } }
// resposta de sucesso                       // resposta de recusa
{ "jsonrpc": "2.0", "id": 7, "result": null } { "jsonrpc": "2.0", "id": 7, "error":
                                                { "code": -32000, "message": "Lance ilegal.", "data": "ILLEGAL_MOVE" } }
// callback (sem id: notificação, ninguém responde)
{ "jsonrpc": "2.0", "method": "onState", "params": { "snapshot": { ... } } }
```

O `id` é o que casa a resposta com a chamada. Duas chamadas podem estar no ar ao mesmo tempo, e
a resposta da segunda pode chegar antes da primeira.

A classe `RpcPeer` faz os dois papéis que o RMI gera sozinho com `rmic`:

| Papel no RMI | No código | O que faz |
|---|---|---|
| **Stub** (lado que chama) | `peer.stub` (um `Proxy`) | `stub.move(p)` monta a mensagem com um id novo, guarda a Promise em `pending` e devolve a Promise |
| **Skeleton** (lado que executa) | `peer.receive(raw)` | lê a mensagem, acha o método local pelo nome, executa e responde com `result` ou `error` |
| **Servant** (implementação) | objeto `servant` em `server/index.ts` | a implementação real de `FanoronaServer` |
| **Registry** (`rmiregistry`) | `POST /api/match` + `matchId` | onde o cliente descobre a partida que vai chamar |

O mesmo `rpc.ts` roda no navegador e no Node. Ele não sabe o que é WebSocket: recebe uma
função `send` e é alimentado por `receive`.

## 4. Por que o WebSocket ainda aparece

Ele é o **transporte**, e não o protocolo. RPC sempre precisa de um canal por baixo: o Java RMI
usa sockets TCP (JRMP), o gRPC usa HTTP/2. Aqui o canal é WebSocket porque o cliente é um
navegador, e navegador não abre socket TCP cru (ADR-001).

O que o enunciado proíbe é o jogo conversar por mensagens escritas à mão. Isso não existe mais:
`index.ts` não tem nenhum `switch` de mensagem, só a implementação da interface.

## 5. A segunda fronteira: thread principal ⇄ worker

A chamada `move` atravessa **duas** fronteiras: a rede (JSON-RPC) e a thread (`postMessage`
para o worker da partida, ADR-002). Para o `await` devolver o resultado certo, a segunda
fronteira ganhou o mesmo mecanismo da primeira, um **id de correlação**:

```
navegador            thread principal                    worker da partida
  │ move (id 7) ───────▶ registry.request()
  │                        req = 42, guarda resolve ──────▶ { t:'intent', req:42, ... }
  │                                                          valida e aplica o lance
  │                      ◀── { t:'state' } → onState(...)  ◀┤
  │ ◀── onState ─────────┤                                  │
  │                      ◀── { t:'done', req:42 } ──────────┘
  │ ◀── result (id 7) ───┤  resolve(42) → resposta da chamada 7
```

O worker responde **exatamente uma vez** a cada pedido (`done`), com ou sem código de recusa.
Isso permite que lance ilegal, fora do turno e partida inexistente voltem como erro da própria
chamada, só para quem chamou, sem derrubar a conexão.

## 6. Onde está provado

`src/server/network.test.ts` sobe o servidor de verdade e conecta dois clientes `RpcPeer`
reais, que jogam uma partida completa até a vitória chamando `server.move`. Também cobre:
recusa fora do turno e lance ilegal (a Promise rejeita com `data: 'ILLEGAL_MOVE'`),
desistência, chat, reconexão no mesmo assento, terceiro jogador recebendo `MATCH_FULL` e
`endTurn` encerrando uma sequência.
