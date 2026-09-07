# ADR-002 — Uma `worker_thread` por partida

**Data:** 19/08/2026 · **Status:** Aceita

## Contexto

A disciplina exige demonstração de paralelismo: *"vão precisar de threads para paralelizar
envio e recepção nos sockets"*.

Em Node, envio e recepção **já** são independentes: o I/O é não-bloqueante e o event loop
alterna entre os callbacks. Não existe o problema de uma thread travada em `read()`
impedindo o envio.

Mas existe um problema equivalente e pior: o event loop é **uma thread só**. Qualquer
código intensivo de CPU impede que os callbacks de rede rodem, e isso afeta *todas* as
conexões do processo, não só a de quem causou.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Nenhuma thread, só event loop | Suficiente para as regras (microssegundos), mas a busca alpha-beta congelaria o servidor |
| Uma thread por **conexão** | Duas threads no mesmo tabuleiro exigiria trava e traria condição de corrida |
| `SharedArrayBuffer` para o tabuleiro | Reintroduz memória compartilhada e sincronização, sem ganho: são 45 casas |
| Múltiplos processos (cluster) | Resolve CPU, mas o registro de partidas passa a exigir estado externo |
| **Uma thread por partida** | Unidade natural de isolamento; sem trava por construção |

## Decisão

**Uma `worker_thread` por partida em andamento.** A thread principal cuida apenas de I/O
e roteamento; o worker é dono exclusivo do estado do jogo, das regras e da busca do bot.

## Justificativa

A partida é a unidade natural de isolamento: é o menor pedaço de estado que precisa ser
consistente consigo mesmo e que **não** precisa saber de nenhum outro.

Como o worker é o único dono do seu tabuleiro e a comunicação é por `postMessage`
(cópia, não referência), não há variável compartilhada — logo, não há condição de corrida,
`mutex` nem deadlock. É o mesmo modelo de passagem de mensagem dos sockets, aplicado
dentro do processo.

O paralelismo é real e verificável: N partidas simultâneas ocupam até N núcleos, e a
demonstração descrita em [`03-concorrencia.md` §4](../03-concorrencia.md) mostra
empiricamente o que acontece quando a busca roda na thread errada.

## Consequências

- ✅ Paralelismo real de CPU, demonstrável ao vivo
- ✅ Sem sincronização: nenhuma trava no código
- ✅ Uma partida travada não derruba as outras
- ⚠️ Todo estado cruza a fronteira por cópia — aceitável, o `Snapshot` tem poucas centenas de bytes
- ⚠️ Cada thread custa memória; daí o limite `MAX_MATCHES` (hoje 50, constante em `server/registry.ts`)
- ⚠️ Depurar código em worker é mais trabalhoso: o log precisa ser roteado para a thread principal
