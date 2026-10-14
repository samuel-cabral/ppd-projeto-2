# Defesa do Projeto 2 (RPC): o que você precisa conseguir dizer

A apresentação vale **20 dos 50 pontos** (*Explicação do Código*), e outros 10 vêm de
*Interface de Operações*. Leia na ordem. Cada bloco fecha com **a frase para dizer em voz alta**.

Detalhe técnico completo: [`docs/08-rpc.md`](docs/08-rpc.md).

---

## 0. O mapa de 60 segundos

> "É o mesmo Fanorona do Projeto 1, com a mesma regra, a mesma interface e uma thread por
> partida. Só a comunicação mudou. Antes eu mandava mensagens pelo socket e interpretava cada
> uma num switch. Agora existe uma **interface remota com tipos**, a `FanoronaServer`, e o
> navegador chama métodos dela: `move`, `endTurn`, `resign`, `sendChat`, `join`. O servidor
> chama de volta métodos da `FanoronaClient` para avisar mudanças: `onState`, `onChat`,
> `onPeer` e `onOver`. Por baixo, cada chamada vira uma mensagem JSON-RPC 2.0."

## 1. O que é RPC

Remote Procedure Call: chamar uma função que roda em outra máquina **como se fosse local**.
Quem chama não monta mensagem, não abre canal e não interpreta resposta. Escreve
`await server.move(...)` e recebe o retorno, ou uma exceção.

RMI é a versão do Java orientada a objetos: em vez de procedimentos soltos, você chama métodos
de um **objeto remoto** que implementa uma interface `Remote`.

> **Diga:** "RPC esconde a rede atrás de uma chamada de função. A interface é o contrato; o
> stub finge ser o objeto remoto do lado de quem chama."

## 2. A interface de operações (abra `src/shared/protocol.ts`)

Mostre as duas interfaces. Pontos para falar:
- **Um parâmetro objeto por operação** (`{ from, to, kind }`), e não argumentos soltos. Fica
  auto-descritivo na rede e dá para validar na fronteira (`parseMove`).
- **Toda operação do servidor tem resposta**, inclusive as que retornam nada. É assim que o
  cliente fica sabendo que o lance foi recusado.
- **Recusa é erro da chamada**, código `-32000` com o motivo em `data` (`ILLEGAL_MOVE`,
  `NOT_YOUR_TURN`, `MATCH_FULL`). Só quem chamou recebe, e a conexão não cai.
- **Callbacks são de mão única** (notificação JSON-RPC, sem `id`).

> **Diga:** "Separei em duas interfaces porque existem dois sentidos. O cliente pergunta ao
> servidor, e o servidor avisa o cliente. O aviso precisa existir porque o lance do adversário
> chega sem eu ter perguntado nada. No RMI isso é o callback de cliente."

## 3. Stub e skeleton (abra `src/shared/rpc.ts`)

| | O que é | Onde |
|---|---|---|
| Stub | objeto falso com os métodos da interface, que vira mensagem | `peer.stub` (um `Proxy`) |
| Skeleton | recebe a mensagem, chama o método real e devolve o resultado | `peer.receive` |
| Servant | a implementação real | `servant` em `src/server/index.ts` |

Caminho de uma chamada, em quatro passos:
1. `stub.move(p)` gera o id 7, guarda a Promise em `pending` e envia `{ id: 7, method: 'move', params }`.
2. No servidor, `receive` acha `servant.move` pelo nome e executa.
3. Responde `{ id: 7, result }` ou `{ id: 7, error }`.
4. No cliente, `receive` vê o id 7, tira a Promise de `pending` e resolve ou rejeita.

> **Diga:** "O `id` é o que casa a resposta com a pergunta. Sem ele, com duas chamadas no ar,
> eu não saberia qual resposta é de qual. É o mesmo arquivo nos dois lados: os dois são cliente
> e servidor ao mesmo tempo."

## 4. Pergunta provável: "mas isso não continua sendo WebSocket?"

O WebSocket é só o **transporte**. Todo RPC roda em cima de algum canal: o Java RMI roda em
cima de socket TCP, e o gRPC em cima de HTTP/2. O navegador não abre socket TCP cru, então o
canal é WebSocket. O código do jogo não manda mensagem nenhuma: `index.ts` não tem `switch` de
mensagens, só a implementação da interface.

> **Diga:** "WebSocket aqui está para o meu RPC como o TCP está para o RMI. Ninguém no código
> do jogo escreve no socket; tudo passa pela interface."

## 5. A parte mais difícil: duas fronteiras (abra `registry.ts`, método `request`)

O lance atravessa a **rede** (navegador → servidor) e depois uma **thread** (thread principal
→ worker da partida). Para o `await server.move()` devolver aceito ou recusado, a thread
precisava do mesmo truque do RPC: o pedido ao worker leva um `req`, e o worker responde
`{ t: 'done', req, code? }` **exatamente uma vez**. O registry guarda as Promises em
`match.waiting` e resolve a certa quando o `done` chega.

> **Diga:** "Usei correlação por id duas vezes: na rede, com o `id` do JSON-RPC, e entre as
> threads, com o `req`. É o mesmo problema nos dois lugares: várias perguntas no ar e a
> resposta precisa voltar para quem perguntou."

## 6. O que NÃO mudou (e por quê isso é bom)

`src/engine/` (regras), `match.worker.ts` (só ganhou o `done`), a interface React e o chat
fora do worker (ADR-005). As regras não sabem que existe rede, então trocar o transporte de
sockets para RPC não exigiu mexer em nenhuma regra.

> **Diga:** "Como as camadas estavam separadas, a troca ficou restrita à camada de comunicação."

## 7. Demonstração (2 minutos)

```bash
npm install && npm run build && npm start
```
1. Abra `http://localhost:3000` e clique em **Criar partida**. Abra o link numa segunda janela.
2. Jogue `e2 → e3`: o lance aparece no outro tabuleiro (callback `onState`).
3. Tente jogar fora da vez: aparece "Não é a sua vez" (recusa voltando como erro da chamada).
4. Mande uma mensagem no chat. Desista: o outro lado vê o vencedor (`onOver`).
5. Se pedirem prova: abra o DevTools, aba Network, clique em `rpc` e depois em Messages, e
   mostre o `{"jsonrpc":"2.0","id":…,"method":"move"…}` passando.

Testes: `npm test`, 34 verdes, incluindo dois clientes RPC reais jogando uma partida completa.
