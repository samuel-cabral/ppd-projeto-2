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

Neste projeto existe uma tarefa exatamente assim: a **busca alpha-beta** do oponente
artificial, que percorre a árvore de jogadas por vários segundos.

Solução: cada partida roda em uma `worker_thread` própria.

| | Thread principal | Worker de partida (uma por partida) |
|---|---|---|
| **Faz** | HTTP, WebSocket, parse de frames, roteamento, chat | estado do jogo, regras, busca alpha-beta |
| **Não faz** | nenhum cálculo de regra | nenhum acesso a socket |
| **Custo típico** | microssegundos | milissegundos a segundos |
| **Se travar** | o servidor inteiro para | só aquela partida atrasa |

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

O argumento acima não precisa ser aceito de boa-fé. A interface tem um seletor:

```
Oponente artificial roda em:   ( ) thread principal   (•) worker thread
```

**Com a busca na thread principal** — o botão que o professor pode acionar:

- o jogador digita no chat e a mensagem não sai;
- o cronômetro da interface congela;
- as **outras partidas** no mesmo servidor também param;
- ao fim da busca, todas as mensagens represadas chegam de uma vez.

**Com a busca no worker:**

- o chat flui normalmente enquanto a IA pensa;
- o indicador *"pensando…"* anima;
- as outras partidas seguem sem perceber nada.

É a demonstração direta da afirmação do enunciado: sem thread separada, o caminho de
envio e recepção fica bloqueado.

## 5. Escalabilidade

Como cada partida é uma thread, N partidas simultâneas usam até N núcleos.

O limite é configurável (`MAX_WORKERS`, padrão 4). Além dele, novas partidas são
recusadas em vez de degradar todas as existentes — decisão consciente: preferir recusar a
entregar um serviço ruim para quem já está jogando.

## 6. O que foi deliberadamente evitado

| Alternativa | Por que não |
|---|---|
| Uma thread por **conexão** | Duas threads mexendo no mesmo tabuleiro exigiria trava. Uma por partida elimina o problema por construção. |
| `SharedArrayBuffer` para o tabuleiro | Traz de volta memória compartilhada e a necessidade de sincronização, sem ganho: o tabuleiro tem 45 casas e a cópia é irrelevante. |
| Cluster / múltiplos processos | Resolveria CPU, mas cada processo teria seu próprio registro de partidas, exigindo estado externo. Complexidade sem retorno na escala deste projeto. |
| Nenhuma thread, só event loop | Funcionaria para as regras (microssegundos), mas a busca alpha-beta congelaria o servidor inteiro. |
