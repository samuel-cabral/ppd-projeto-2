# Concorrência e threads

> Este é o documento que responde diretamente ao requisito da disciplina:
> *"vão precisar de threads para paralelizar envio e recepção nos sockets"*.

## 1. O problema que as threads resolvem

Em um socket **bloqueante** (o modelo padrão de Java, C e do módulo `socket` de Python),
a chamada de leitura trava a thread até chegar um byte:

```java
// enquanto esta linha não retorna, esta thread não faz mais nada.
String linha = entrada.readLine();
```

Se a única thread do programa está parada em `readLine()`, ela **não pode enviar nada**.
Um jogador digitando no chat ficaria bloqueado esperando o adversário mover. Daí a solução
clássica: uma thread dedicada à leitura, outra à escrita. As duas direções passam a
progredir de forma independente.

O problema real, portanto, não é "usar threads". É: **nenhuma operação pode monopolizar o
caminho por onde as mensagens entram e saem.**

## 2. Como este projeto resolve

O sistema tem **duas camadas de concorrência**, e cada uma resolve metade do problema.

### Camada 1 — event loop: paralelismo de entrada e saída

Node usa I/O não-bloqueante. A leitura do socket não trava ninguém: o sistema operacional
avisa o processo quando há dado disponível (`epoll` no Linux, `kqueue` no macOS), e a
biblioteca `libuv` invoca o callback correspondente.

```ts
socket.on('message', (dados) => { /* chegou algo */ });   // recepção
socket.send(payload);                                      // envio, não bloqueia
```

Envio e recepção já são independentes: nenhuma chamada fica parada esperando byte, então
não existe a situação de "estou travado lendo, logo não consigo escrever". **A separação
que as threads leitora e escritora produzem manualmente, aqui é feita pelo event loop.**

Isso é fato verificável no projeto: o chat continua funcionando durante o turno do
adversário, durante uma sequência de capturas e enquanto outra partida está em andamento.

### Camada 2 — `worker_threads`: paralelismo de CPU

O event loop tem uma fraqueza, e é exatamente aqui que threads voltam a ser obrigatórias:
**ele é uma única thread.** Qualquer código que ocupe a CPU por muito tempo impede que os
callbacks de rede rodem. Enquanto uma função demorada executa, **nada entra e nada sai** —
o efeito é idêntico ao de uma thread bloqueada em `readLine()`, e afeta *todas* as
conexões, não só a de quem causou.

Neste projeto a tarefa pesada **planejada** era a busca alpha-beta de um oponente
artificial ([ADR-011](adr/011-bot-como-instrumento-de-demonstracao.md)). Ela **não foi
implementada** — não existe `src/server/bot.ts`. O que existe hoje, e é mensurável, é
uma tarefa de CPU acidental na thread principal: o `JSON.parse` de `parseClientMessage`
(`shared/protocol.ts:76`), chamado em `index.ts:96` antes de qualquer validação. Ver §4.2.

Solução: cada partida roda em uma `worker_thread` própria.

| | Thread principal | Worker de partida (uma por partida) |
|---|---|---|
| **Faz** | HTTP, WebSocket, parse de frames, roteamento, chat | estado do jogo, regras |
| **Não faz** | nenhum cálculo de regra | nenhum acesso a socket |
| **Custo típico** | microssegundos | microssegundos (as regras do Fanorona são baratas) |
| **Se travar** | o servidor inteiro para | só aquela partida atrasa |

> ⚠️ Como as regras rodam em microssegundos, **o worker não é uma otimização de
> throughput** — para um jogo de turnos que passa quase todo o tempo esperando socket,
> uma thread por partida é mais lenta que só o event loop. A escolha é de **isolamento**,
> não de velocidade ([ADR-002](adr/002-worker-thread-por-partida.md)). Afirmar ganho de
> desempenho não sobrevive a uma repergunta.

## 3. Comunicação entre threads

Threads não compartilham memória neste desenho. Elas trocam mensagens:

```ts
// thread principal → worker
worker.postMessage({ t: 'intent', playerId, move });

// worker → thread principal
parentPort.postMessage({ t: 'state', snapshot });
```

O formato completo está em [`04-protocolo.md` §3](04-protocolo.md).

Consequência que vale registrar: **não há variável compartilhada, portanto não há
condição de corrida, não há `mutex` e não há deadlock.** O estado de cada partida é
propriedade exclusiva de uma única thread, e o único jeito de alterá-lo é enviar uma
mensagem para ela. É o mesmo modelo de concorrência dos sockets — passagem de mensagem em
vez de memória compartilhada — aplicado dentro do processo.

Isso também explica por que a lista de lances legais é recalculada dentro do worker: se
ela fosse calculada fora e passada para dentro, duas threads teriam opinião sobre o mesmo
estado.

## 4. Demonstração empírica

O argumento acima não precisa ser aceito de boa-fé — mas as duas camadas estão em estágios
diferentes de implementação, e é importante não confundir uma com a outra.

### 4.1 Camada 1 (event loop) e a contagem de threads do SO

Sem escrever nenhuma linha a mais, dá pra mostrar ao vivo:

- enviar uma mensagem de chat **durante o turno do adversário** — chega na hora, porque o
  envio nunca ficou atrás de nenhuma leitura (ver [`05-testes.md` §6](05-testes.md));
- abrir **duas partidas em abas diferentes** e jogar as duas ao mesmo tempo — cada uma tem
  seu próprio `worker_thread` ([ADR-002](adr/002-worker-thread-por-partida.md)), e nenhuma
  enxerga o estado da outra.

**A prova mais forte é a contagem de threads do sistema operacional**, porque o número não
vem da aplicação — vem do SO. Com o servidor rodando:

```fish
function threads
    ps -M (lsof -nP -iTCP:3000 -sTCP:LISTEN -t | head -1) | tail -n +2 | wc -l | string trim
end
```

Medido em 10/09/2026, com duas partidas e uma desistência, servidor subido com
`env FANORONA_ABANDON_MS=20000`:

| Momento | Threads |
|---|---|
| ocioso, 0 partidas | 12 |
| 1 partida | 13 |
| 2 partidas | 14 |
| logo após a desistência (dentro da sobrevida) | 14 |
| passada a sobrevida | **13** |

A base varia com o runtime do Node (11 ou 12 conforme o processo) — **o que o argumento usa
é o delta**. Sobe `+1` no `new Worker(WORKER_URL)` de `registry.ts:63`; desce `−1` no
`worker.terminate()` de `registry.ts:235`, chamado por `destroy` quando a sobrevida da
partida encerrada expira ([`04-protocolo.md` §4.2](04-protocolo.md)). O log do servidor
narra os dois sentidos, e `GET /api/match?id=<encerrada>` passa a responder `404`.

Isso prova a Camada 1 e o **ciclo de vida** da Camada 2. O que a contagem não prova é as
threads trabalhando ao mesmo tempo sob carga — para isso, §4.2.

### 4.2 O bloqueio por CPU — demonstrável hoje, sem o bot

> **Revisado em 09–10/09/2026.** Este parágrafo dizia que a demonstração dependia do bot da
> Fase 5 e que "não pode ser apresentado como já verificável". **Isso estava errado.** A
> demonstração existe no código atual e foi medida.

O bot nunca foi escrito, mas ele não era a única tarefa capaz de ocupar a thread principal.
Há uma no caminho de entrada, e ela não é intencional:

- `parseClientMessage` roda `JSON.parse` **na thread principal** (`shared/protocol.ts:76`),
  chamado em `index.ts:96` **antes** de qualquer validação — inclusive antes do
  `msg.text.slice(0, 500)` de `protocol.ts:102`;
- o `WebSocketServer` de `index.ts:74` **não define `maxPayload`**, então o `ws` aceita até
  100 MiB por frame, o padrão da biblioteca.

Um cliente pode, portanto, fazer a thread principal gastar mais de um segundo de CPU num
único `JSON.parse`. Medição de 09/09/2026, com duas partidas simultâneas A e B:

```
servidor ocioso                      → maior intervalo entre ecos de chat na B:    54 ms
durante o JSON.parse de 90 MB na A   → maior intervalo entre ecos de chat na B:  1148 ms
```

**O chat da partida B parou por 1,1 segundo por causa de uma mensagem da partida A.** Nenhuma
trava foi tocada, nenhuma conexão caiu, nenhum erro apareceu — nada entrou e nada saiu. O
servidor se recuperou por completo depois.

É exatamente o efeito que o enunciado descreve ao falar de uma thread travada em
`readLine()`: enquanto a thread principal está ocupada com CPU, todas as conexões param, não
só a de quem causou. E é a razão de o estado da partida **não** morar na thread principal.

**O limite honesto desta prova:** ela demonstra o *custo do caminho principal*, não o
*proveito do caminho paralelo*. Não dá para observar os workers progredindo durante o
congelamento, porque a saída deles passa pela thread principal, que está bloqueada.

**Alternativa sem payload gigante:** `node --inspect dist/server/index.js` + `chrome://inspect`.
Breakpoint em `index.ts:96` para o servidor inteiro; breakpoint em `match.worker.ts:97` para
só aquela partida. É a mesma fronteira, com ferramenta padrão.

**Isto também é um achado de segurança, com correção de uma linha** — qualquer cliente
conectado pode congelar o servidor:

```ts
new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 })
```

A correção **não foi aplicada de propósito**, para que a demonstração continue possível na
apresentação. Aplicá-la fecha o vetor e mata a demonstração; nesse caso, use o depurador.

## 5. Escalabilidade

Como cada partida é uma thread, N partidas simultâneas usam até N núcleos.

O limite é a constante `MAX_MATCHES` em [`server/registry.ts`](../src/server/registry.ts),
hoje **50**, fixa no código (não há variável de ambiente). Além dela, `POST /api/match`
responde `503 SERVER_BUSY` em vez de degradar todas as partidas existentes — decisão
consciente: preferir recusar a entregar um serviço ruim para quem já está jogando.

O número é folgado de propósito: como cada worker fica ocioso entre lances, o gargalo real
não é CPU, é memória por thread. Para a escala deste projeto (uma apresentação, duas ou
três partidas simultâneas) o limite nunca é atingido.

## 6. O que foi deliberadamente evitado

| Alternativa | Por que não |
|---|---|
| Uma thread por **conexão** | Duas threads mexendo no mesmo tabuleiro exigiria trava. Uma por partida elimina o problema por construção. |
| `SharedArrayBuffer` para o tabuleiro | Traz de volta memória compartilhada e a necessidade de sincronização, sem ganho: o tabuleiro tem 45 casas e a cópia é irrelevante. |
| Cluster / múltiplos processos | Resolveria CPU, mas cada processo teria seu próprio registro de partidas, exigindo estado externo. Complexidade sem retorno na escala deste projeto. |
| Nenhuma thread, só event loop | Funcionaria para as regras, que rodam em microssegundos — e, medido o throughput, seria até mais rápido. O que se perde é o **isolamento**: o estado de uma partida passaria a viver no mesmo heap de todas as outras, e qualquer tarefa de CPU futura (o bot, uma análise de posição) congelaria o servidor inteiro, como a §4.2 demonstra que já acontece com o `JSON.parse`. |
