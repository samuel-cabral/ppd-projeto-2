# ADR-010 — Camadas por contexto delimitado

**Data:** 06/09/2026 · **Status:** Aceita

## Contexto

O projeto já tem fronteiras arquiteturais corretas e elas são a espinha dorsal da defesa oral:

- `engine/` não importa nada — nem `ws`, nem `worker_threads`, nem React;
- a thread principal nunca calcula regra de jogo;
- o worker nunca toca em socket;
- o cliente não conhece nenhuma regra do Fanorona.

O problema não é que essas regras estejam erradas. É que elas são **convenção**. Existem no
comentário do topo de cada arquivo e neste diretório de documentação, e são sustentadas pela
disciplina de quem escreve. Nada no repositório impede que amanhã alguém importe `legalMoves`
dentro de `server/index.ts` e o projeto continue compilando, com os testes verdes.

Há também uma concentração de responsabilidades em um arquivo só. `match.worker.ts` mistura
três coisas que a Clean Architecture separa em anéis diferentes:

| Linhas | O que é | Onde deveria estar |
|---|---|---|
| 33–41 | Estado do jogo em variáveis soltas de módulo (`board`, `turn`, `sequence`, `captured`, `history`, `over`, `players`) | Agregado, no domínio |
| 97–118 | `handleIntent` — autorização, validação e aplicação do lance | Caso de uso, na aplicação |
| 120–152 | `port.on('message')` — tradução de `postMessage` para chamada | Adaptador, na infraestrutura |

Isso tem uma consequência prática que não é estética: **não dá para clonar o estado**. Variáveis
de módulo não se copiam. Como o oponente artificial ([ADR-011](011-bot-como-instrumento-de-demonstracao.md))
precisa simular lances sobre cópias do estado para fazer busca em árvore, a Fase 5 está bloqueada
pela ausência de um agregado.

Por fim, o critério de avaliação que mais pesa aqui é *Explicação do Código* (10 dos 30 pontos),
e numa disciplina de Programação Paralela e Distribuída ele significa, na prática, *"me mostre a
concorrência"*. Hoje a resposta a "prove que a thread principal não calcula regra" é *"leia os
imports e acredite"*.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Não refatorar | As fronteiras existem e funcionam. Mas continuam invisíveis, `match.worker.ts` segue com três responsabilidades, e o bot da Fase 5 continua bloqueado pela falta de um estado clonável |
| **Camada no topo** (`domain/`, `application/`, `infrastructure/`) | É o layout que a maioria dos tutoriais de Clean Architecture mostra. Aqui ele **dilui** a informação mais importante do projeto: a fronteira de thread ficaria espalhada dentro de cada uma das três pastas, e a regra "o worker nunca toca socket" não teria nenhuma expressão estrutural |
| DDD ortodoxo completo (repositories, domain events, CQRS, container de DI) | Produz mais pastas que código. Ver a tabela de padrões recusados adiante — nenhum deles remove uma dependência existente nem torna testável algo que hoje não é |
| **Contexto delimitado no topo, camada dentro** | Escolhida |

## Decisão

Dois *bounded contexts* no topo da árvore, cada um com suas camadas internas:

```
src/
  game/                    ← contexto "Jogo" — roda NA WORKER THREAD
    domain/                board.ts · moves.ts · notation.ts · game.ts (Aggregate Root)
    application/           gameSession.ts  — casos de uso + autorização
    adapters/              snapshot.ts     — Game → Snapshot (DTO)
    worker.ts              entry point + composition root
  table/                   ← contexto "Mesa" — roda NA THREAD PRINCIPAL
    domain/                match.ts        — assentos, chat, reconexão
    application/           matchRegistry.ts · ports.ts (GameRunner)
    adapters/              workerGameRunner.ts · wsGateway.ts · httpServer.ts
    main.ts                composition root
  shared/protocol.ts       Published Language — não pertence a nenhum dos dois
  client/                  interface React — fora do esquema, ver adiante
  architecture.test.ts     fitness function que executa as regras acima
```

### Modelo de domínio

| Conceito | Classificação | Nota |
|---|---|---|
| `Game` | **Aggregate Root** (contexto Jogo) | Absorve as variáveis de módulo de `match.worker.ts:33-39`. Ganha `clone()`, que destrava a Fase 5 |
| `Match` | **Aggregate Root** (contexto Mesa) | Assentos, chat com teto de 200, `closed`. **Sem `WebSocket` dentro** — o gateway é que guarda `Map<playerId, WebSocket>` |
| `Sequence` | **Value Object** | Já é imutável e substituída, nunca mutada. O exemplo mais limpo de VO no projeto |
| `RawMove`, `Outcome`, `Color`, `Kind` | **Value Objects** | Structs imutáveis e uniões de literais. Classe aqui seria cerimônia |
| `Point` | **Value Object com representação primitiva** | Continua `type Point = string`. `toIndex` / `toPoint` / `isPoint` são construtor, desconstrutor e validador; a invariante é aplicada na fronteira de rede por `parseClientMessage` |
| `Move`, `Snapshot` | **DTOs** do Published Language | `toMove()` e `adapters/snapshot.ts` são os mappers de fronteira |
| `legalMoves`, `continuationMoves`, `checkOver` | **Domain Services** (funções livres) | Computação sem estado próprio sobre (tabuleiro, cor, sequência). Assinaturas preservadas |
| `players: Map<playerId, Color>` | Sai do domínio → `GameSession` | Autorização não é regra de Fanorona |

Duas escolhas do modelo merecem justificativa porque contrariam o reflexo comum:

**`Point` não vira classe nem *branded type*.** Não está no caminho quente — `movesFromPoint`,
`sweep` e `step` trabalham com índices inteiros de 0 a 44, e `Point` só aparece na fronteira, via
`toMove()` e `snapshot()`. Ou seja, a separação entre *representação eficiente interna* e *VO de
fronteira* **já existe e está correta**. Uma classe com `equals()` alocaria objetos no laço de
geração de lances sem proteger nada que `toIndex` já não proteja, e um *branded type* quebraria a
tipagem de `network.test.ts`, que constrói `ClientMessage` com literais de string.

**`Board` não vira nem Entity nem VO.** Não tem identidade própria nem ciclo de vida fora da
partida: só existe *o* tabuleiro *daquele* jogo. Vira estrutura interna encapsulada por `Game`
(`private readonly cells: Cell[]`). O problema real de hoje — `applyMove` recebe um array e o
**muta**, deixando o chamador responsável por não errar a ordem — desaparece porque `applyMove`
passa a ser chamado apenas de dentro do agregado.

### Ports & Adapters — uma porta só

```ts
// src/table/application/ports.ts
export interface GameRunner {
  send(msg: ToWorker): void;
  onEvent(handler: (e: FromWorker) => void): void;
  terminate(): Promise<void> | void;
}
```

Justificativa tripla, nesta ordem de importância:

1. **Dá nome de tipo à fronteira de thread.** A coisa que a disciplina avalia deixa de ser
   convenção e passa a ser uma interface que o compilador conhece.
2. **Permite testar o `MatchRegistry` sem subir thread nenhuma** — um `InProcessGameRunner` de
   ~15 linhas roda uma partida inteira em processo.
3. **Materializa a [ADR-008](008-implantacao-multi-maquina.md).** "Partida em outra máquina" é
   outra implementação de `GameRunner`, sobre TCP, sem tocar em uma linha de `Match`. A porta
   existe porque uma decisão já aceita previu o segundo adaptador.

## Justificativa

### Por que contexto no topo e camada dentro

Em DDD a unidade máxima de modularidade é o *bounded context*, não a camada. Aqui os dois
contextos **coincidem exatamente com a fronteira de thread**, que é o núcleo pedagógico da
disciplina.

O efeito é que a regra que organiza o sistema inteiro — *a thread principal nunca calcula regra
de jogo, o worker nunca toca em socket* — deixa de ser uma frase em um `.md` e vira uma **regra
sobre caminhos de arquivo**: `src/table/**` não pode importar `src/game/domain/**`. Isso é
verificável a olho nu, e `architecture.test.ts` a executa a cada `npm test`.

Com camada no topo, essa mesma regra ficaria diluída dentro de três pastas e não teria expressão
estrutural nenhuma.

### Por que os anéis 3 e 4 estão colapsados

Existe uma única pasta `adapters/` por contexto, em vez de `interface-adapters/` mais
`infrastructure/`. O colapso é deliberado: `ws`, `node:http` e `node:worker_threads` são as
**três** dependências externas do projeto inteiro. Separar "quem adapta" de "qual framework"
produziria pastas de um arquivo.

Registrar isto importa: colapso consciente de anel é decisão de arquitetura; colapso por
esquecimento é dívida. A diferença entre os dois é este parágrafo existir.

### Onde a thread entra no diagrama de anéis

**Em lugar nenhum. Thread não é camada.**

Os anéis da Clean Architecture respondem *quem pode depender de quem*. A thread responde *o que
roda onde*. São eixos ortogonais, e desenhar a thread como um anel é erro de categoria.

O diagrama correto são **dois conjuntos de anéis, um por thread**, encostados pelos anéis
externos e ligados por um canal de mensagens:

```
   THREAD PRINCIPAL                             WORKER THREAD (uma por partida)
 ┌─ adapters ─────────────┐                  ┌─ worker.ts (entry + composition root) ─┐
 │ httpServer  wsGateway  │                  │ ┌─ adapters: snapshot.ts ───────────┐  │
 │ workerGameRunner ──────┼─── postMessage ──┼─┤ ┌─ application: gameSession ────┐ │  │
 │ ┌─ application: registry│    (ToWorker /   │ │ │ ┌─ domain: Game, moves, ───┐ │ │  │
 │ │ ┌─ domain: Match ─┐  │     FromWorker)  │ │ │ │   board, notation        │ │ │  │
 └─┴─┴─────────────────┴──┘                  └─┴─┴─┴──────────────────────────┴─┴─┴──┘
```

Três consequências que resolvem a tensão sem quebrar nada:

**`postMessage` é transporte, não camada.** `ToWorker`/`FromWorker` tem exatamente o mesmo status
arquitetural que `ClientMessage`/`ServerMessage`: protocolo entre dois processos lógicos. Que os
quatro já morem juntos em `shared/protocol.ts` é acerto do código atual. Do lado da Mesa,
`worker_threads` é um adaptador de **saída**; do lado do Jogo, `parentPort` é um adaptador de
**entrada**. Mesma dependência externa, dois papéis, dois arquivos.

**O worker continuar sendo entry point de build não é exceção, é a regra.** `worker.ts` é o
*composition root* do contexto Jogo: o único arquivo autorizado a construir `Game`, construir
`GameSession` e tocar em `parentPort`. Entry point mais composition root mais adaptador primário
no mesmo arquivo de ~40 linhas é o que qualquer projeto Clean Architecture faz com o seu `main()`.
O que estava errado nunca foi ele ser entry point — era ele acumular também o estado do agregado
e a lógica do caso de uso.

**Os dois contextos compartilham o identificador.** `matchId` identifica um `Match` na Mesa e um
`Game` no Jogo. É o padrão clássico: mesmo id, dois agregados, contextos diferentes, invariantes
diferentes. Isso também dá função ao `void matchId` da linha 154 de `match.worker.ts`, hoje um
identificador guardado e nunca usado — passa a ser a identidade do agregado.

### Por que o cliente React fica fora

`docs/02-arquitetura.md` §3 afirma: *"o cliente não sabe jogar Fanorona"*. **Um cliente sem
lógica de domínio não pode ter camada de domínio.** Criar `src/client/domain/` seria inventar
domínio para preencher pasta e, pior, contradiria por escrito a afirmação de que trapaça é
estruturalmente impossível. Se o avaliador abrir uma pasta `domain` no cliente, a primeira
pergunta será *"então o cliente conhece as regras?"*.

O que o cliente tem já está separado corretamente — o passo é **nomear, não mover**:

| Anel | Arquivo | Evidência |
|---|---|---|
| Apresentação | `App.tsx`, `Board.tsx`, `Chat.tsx` | só React e SVG |
| Estado de aplicação | `matchState.ts` | `(estado, ServerMessage) => estado`, puro, 7 testes, não importa React nem `ws` |
| Infraestrutura | `useMatch.ts` | único que abre WebSocket |

Isso é Clean Architecture com nomes de React, e o `matchState.ts` foi extraído justamente de
dentro do callback do socket, onde era intestável.

Resta um acoplamento real: `Board.tsx` importa `cellDiagonal` de `engine/board.ts`. A solução é
declarar `game/domain/board.ts` **Shared Kernel** entre o contexto Jogo e o cliente. É o único
módulo do projeto com zero imports, é geometria pura e estável, e duplicá-lo no cliente
reintroduziria exatamente o erro que o comentário da própria função alerta — desenhar um X em
toda célula transformaria todo ponto em forte. Dois desenhos de tabuleiro divergindo é pior que
um acoplamento declarado. A regra do kernel é estreita e o teste de arquitetura a executa: **o
cliente pode importar `board.ts`, e nada mais de `game/`.**

### Vocabulário em inglês

A linguagem ubíqua adotada é a da literatura do domínio — o paper *Best Play in Fanorona Leads to
Draw* (Schadd et al., 2008), que usa *approach*, *withdrawal*, *paika*. Os identificadores ficam
em inglês e os comentários em português, como já estão. Traduzir o domínio criaria uma fronteira
artificial contra o Published Language de `shared/protocol.ts`, que não pode mudar de forma.

## Padrões recusados

O critério, que também é a resposta pronta se perguntarem *"por que não usou X"*: **um padrão
entra quando remove uma dependência que existe, ou torna testável algo que hoje não é.**

| Padrão | Por que fica de fora |
|---|---|
| **Repository** | Não há persistência, e isso é decisão declarada na [ADR-002](002-worker-thread-por-partida.md): o worker é dono exclusivo do estado, em memória. Uma interface com uma implementação `InMemory` e nenhum requisito de durabilidade é indireção pura. O `Map` do `MatchRegistry` **é** a coleção |
| **Domain Events / EventBus** | Já existe um fluxo de eventos, e ele já é tipado e serializado como `FromWorker`. Um barramento interno duplicaria isso com um único consumidor, em processo, síncrono. Casos de uso devolvendo `SessionEvent[]` entregam o mesmo desacoplamento sem infraestrutura |
| **Event Sourcing** | `history: string[]` em notação já é um log de eventos, mas de *leitura*. Torná-lo fonte da verdade obrigaria a reconstruir 45 casas a cada snapshot, para ganhar auditoria que ninguém pediu, sobre um estado que cabe em centenas de bytes e que a [ADR-003](003-estado-completo-em-vez-de-delta.md) já manda enviar inteiro |
| **CQRS formal** | Informalmente já existe: `Snapshot` **é** o read model e `adapters/snapshot.ts` **é** a projeção. Command bus, query bus e handlers registrados não entram — só há um consumidor |
| **Container de DI** | Dois composition roots com cerca de quatro objetos cada. Um container acrescentaria dependência, decorators e `reflect-metadata` a um projeto que hoje tem três dependências de runtime |
| **Anticorruption Layer entre Jogo e Mesa** | ACL traduz modelos que discordam. Aqui os dois contextos falam o mesmo `shared/protocol.ts` por decisão — isso é **Published Language**, e uma camada de tradução duplicaria tipos idênticos |
| **Specification pattern** | `legalMoves(board, color, sequence)` já é a especificação, e é a única. Encapsular cada filtro em objeto triplicaria `continuationMoves`, que hoje são seis linhas legíveis |
| **Portas de log, relógio e UUID** | `console.log`, `setTimeout`, `randomUUID`. Se um teste precisar controlar o tempo, passa-se a função por construtor. Função como argumento custa menos que interface |
| **Um arquivo por caso de uso** | Quatro arquivos de dez linhas compartilhando o mesmo agregado e a mesma credencial. Um `GameSession` com quatro métodos nomeados como casos de uso comunica o mesmo e lê melhor |
| **Camada de domínio no cliente** | Contradiria a afirmação de que o cliente não conhece as regras — ver acima |

## Consequências

- ✅ A fronteira de thread deixa de ser convenção e vira estrutura de diretórios, verificada por
  `architecture.test.ts` a cada `npm test`. A resposta a *"prove que a thread principal não
  calcula regra"* passa de "leia os imports" para "`src/table/**` não alcança `src/game/domain/**`,
  e existe um teste que falha se alguém tentar"
- ✅ `Game.clone()` destrava a Fase 5: o bot passa a poder simular lances sobre cópias
- ✅ Comportamentos que hoje só são testáveis abrindo dois sockets — turno alheio, lance ilegal
  que não altera estado, `MATCH_FULL`, reconexão — passam a ter teste unitário
- ✅ O protocolo de rede não muda de forma, então `network.test.ts` atravessa a refatoração
  inteira sem uma única edição, funcionando como teste de contrato
- ⚠️ Mais arquivos e mais indireção para um projeto de ~2.500 linhas. O custo é real e foi
  aceito porque *Explicação do Código* vale 10 dos 30 pontos, e a arquitetura invisível não
  pontuava
- ⚠️ `scripts/build-server.mjs` precisa passar `entryPoints` para a forma de objeto. Com a forma
  de array, o esbuild calcula o `outbase` pelo ancestral comum dos entry points; com as entradas
  em `src/table/` e `src/game/`, a saída viraria `dist/server/table/main.js`, quebrando
  `npm start`, o `WORKER_URL` do registry e o `spawn` de `network.test.ts`
- ⚠️ Documentação a reescrever: `02-arquitetura.md`, `03-concorrencia.md` e `04-protocolo.md`
  referenciam caminhos que mudam
