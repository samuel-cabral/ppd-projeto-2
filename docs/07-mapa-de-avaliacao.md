# Mapa de avaliação — do enunciado à evidência

> Replanejamento arquitetural de **03/09/2026**, feito depois de reler o
> [enunciado](referencias/enunciado.pdf) linha a linha e o código inteiro.
> Entrega: **09/09/2026 até 13h** · apresentação em **10/09/2026**.
>
> Este documento existe por um motivo só: a nota tem exatamente três critérios, e
> arquitetura **não é um deles**. Toda decisão registrada aqui é justificada por qual
> critério ela move, ou não entra.
>
> ⚠️ **Estado real em 10/09:** das sete decisões da §4, **nenhuma das que exigiam código novo
> foi implementada** (AD-1 `/api/stats`, AD-2 bot, AD-3 `blockedMoves`, AD-5 IPs da LAN,
> AD-6 banners, AD-7 chat de sistema). A única executada foi a **AD-4**, que era uma decisão
> de *não* fazer. A §3 (matriz de rastreabilidade) continua correta e é a fonte confiável
> deste arquivo; a §7 (ordem de execução) é registro histórico. Ver a §8 no fim.

## 1. O que o enunciado pede, literalmente

**Objetivo:** *"Implementar o jogo Fanorona utilizando Sockets para comunicação entre os
tabuleiros que podem estar em **máquinas diferentes**."*

**Funcionalidades básicas** — cinco, nominais:

1. Controle de turno, com definição de quem inicia a partida
2. Movimentação das peças nos tabuleiros
3. Desistência
4. Chat para comunicação durante toda a partida
5. Indicação de vencedor

**Critérios de avaliação** — 30 pontos, e nada mais:

| Critério | Faixa |
|---|---|
| Interface do Jogo (UI) | 0–10 |
| Implementação de Funcionalidades | 0–10 |
| Explicação do Código | 0–10 |

> *"Elementos da UI só serão considerados quando suas funcionalidades forem implementadas."*

**Entregáveis:** todos os códigos + **um código executável** (.jar, .exe, etc.) *"se a
linguagem de programação permitir"*. E-mail até 13h. Apresentação pessoal obrigatória.

## 2. O que "10" significa em cada critério

Não existe rubrica detalhada. A leitura defensável:

| Critério | O que provavelmente separa 7 de 10 |
|---|---|
| **UI** | Não é bonito — é *legível*. Cada uma das 5 funcionalidades precisa ter um lugar óbvio na tela, e as regras difíceis do Fanorona (captura obrigatória, aproximação × afastamento, sequência) precisam ser visíveis, não implícitas |
| **Funcionalidades** | As 5 funcionam **e resistem a uso adversarial**: lance ilegal, queda de conexão, duas máquinas de verdade, jogador tentando trapacear |
| **Explicação do Código** | O aluno consegue mostrar *onde* cada conceito da disciplina vive no código, e provar que funciona — não descrever de boca |

O terceiro critério é o mais barato de subestimar e o mais caro de perder: numa disciplina de
**Programação Paralela e Distribuída**, "explicar o código" quase certamente significa
*"me mostre a concorrência"*.

## 3. Matriz de rastreabilidade

Requisito → onde vive no código → como se demonstra ao vivo.

| # | Requisito do enunciado | Código | Evidência demonstrável | Status |
|---|---|---|---|---|
| Obj. | Sockets entre máquinas diferentes | [`server/index.ts`](../src/server/index.ts) (WS), [`client/useMatch.ts`](../src/client/useMatch.ts) | Duas máquinas na mesma rede, via IP da LAN | 🔲 **Lacuna** — ver AD-5 |
| 1 | Controle de turno + quem inicia | [`match.worker.ts`](../src/server/match.worker.ts) (`turn`, brancas começam) | Painel de assentos destaca a vez; banner inicial diz quem abre | 🟡 Existe, mal sinalizado — AD-6 |
| 2 | Movimentação das peças | [`engine/moves.ts`](../src/engine/moves.ts) + [`Board.tsx`](../src/client/Board.tsx) | Jogar; mostrar seletor A×W no primeiro lance `d3-e3` | ✅ |
| 3 | Desistência | `match.worker.ts` (`resign`) | Botão com confirmação; os dois lados veem o fim | ✅ |
| 4 | Chat durante toda a partida | [`registry.ts`](../src/server/registry.ts) (`postChat`), [`Chat.tsx`](../src/client/Chat.tsx) | Enviar durante o turno do adversário | ✅ |
| 5 | Indicação de vencedor | `match.worker.ts` (`checkOver`) | Hoje: uma linha de texto no painel | 🟡 Fraco — AD-6 |
| — | Executável | — | `npm start` em clone limpo; sem binário, por decisão ([ADR-012](adr/012-entrega-sem-binario.md)) | ✅ Decidido — AD-4 |
| — | Todos os códigos | repositório | Link do GitHub | ✅ |

## 4. Decisões arquiteturais deste replanejamento

Sete decisões. Cada uma indica qual critério move.

### AD-1 — Tornar a concorrência visível (critério: Explicação do Código)

**Problema:** a arquitetura mais forte do projeto — uma `worker_thread` por partida — é
completamente invisível na tela. Não há como *mostrar* o que só dá para *afirmar*.

**Decisão:** um painel de observabilidade alimentado por um endpoint `/api/stats` na thread
principal: partidas ativas, `threadId` real de cada worker, contagem de mensagens trocadas
por partida e tempo de vida. Registrado em [ADR-006](adr/006-observabilidade-de-threads.md).

Isso transforma a defesa oral de "eu criei uma thread por partida" em "abra duas partidas e
veja os dois `threadId` diferentes se movendo".

### AD-2 — Oponente artificial como *instrumento de demonstração* (critério: Explicação do Código)

O bot da Fase 5 nunca foi sobre jogar bem. É a **única tarefa do sistema pesada o bastante
para bloquear o event loop**, e portanto a única forma de demonstrar empiricamente por que as
threads existem. Sem ele, [`03-concorrencia.md` §4.2](03-concorrencia.md) fica no discurso.

**Decisão:** manter na Fase 5, com o seletor *thread principal × worker*, e tratá-lo
explicitamente como aparato de demonstração — não como funcionalidade de jogo.

### AD-3 — Lances bloqueados viajam no protocolo (critérios: UI + Funcionalidades)

**Problema:** [ADR-004](adr/004-condicao-de-vitoria-e-captura-obrigatoria.md) e
[`01-visao-de-produto.md` §3.6](01-visao-de-produto.md) **prometem** que a interface mostra os
destinos paika bloqueados *com o motivo*. Isso nunca foi implementado — o servidor filtra os
paika e o cliente, que não conhece regra nenhuma, não tem como saber que existiam.

Uma regra que o jogador não vê é uma regra que o avaliador não pontua. Pior: some
silenciosamente a evidência de que a regra mais difícil do jogo foi implementada.

**Decisão:** o `Snapshot` passa a carregar `blockedMoves: BlockedMove[]` — os lances
descartados, com o motivo (`'captura-obrigatoria'` ou `'direcao-repetida'` ou
`'ponto-visitado'`). Registrado em [ADR-009](adr/009-lances-bloqueados-no-protocolo.md).

Um efeito colateral valioso: resolve o risco R-1 da §5 abaixo.

### AD-4 — ~~Executável via Node SEA~~ → **Entrega sem binário** (critério: entregável obrigatório)

> **Revisada em 06/09.** A decisão original era empacotar com Node SEA
> ([ADR-007](adr/007-executavel-via-node-sea.md)), pelo argumento de que Node *permite* gerar
> binário e invocar a cláusula de escape seria factualmente errado.

A premissa foi reexaminada e não se sustenta. A cláusula *"se a linguagem de programação
permitir"* não pergunta se é tecnicamente possível — pergunta se é o modo natural de entregar
aquele programa. Os exemplos do próprio enunciado são `.jar` e `.exe`, onde o artefato compilado
**é** a forma normal de distribuir. Em Node não é: a forma normal é código-fonte mais
`npm install && npm start`.

Somam-se três fatos que a própria ADR-007 já registrava como consequências: o binário é **por
plataforma** (o gerado no macOS ARM não roda no Windows do avaliador), embutir os assets do
cliente é a parte com risco real, e o macOS pode exigir assinatura.

**Decisão:** não produzir binário; entregar o caminho `npm install && npm run build && npm start`
conferido em clone limpo, com a ausência justificada por escrito em
[ADR-012](adr/012-entrega-sem-binario.md).

As ~2 horas liberadas vão para a Fase 5, que move *Explicação do Código*. O executável não movia
critério nenhum — não há item de nota para ele.

### AD-5 — Implantação em máquinas diferentes como capacidade de primeira classe (critério: Funcionalidades)

**Problema:** "máquinas diferentes" está na frase de objetivo do enunciado, e hoje o projeto
trata isso como detalhe (`npx ngrok` mencionado de passagem no README).

**Decisão:** o servidor passa a anunciar, no boot, **todos os endereços de rede em que está
acessível** (IPs da LAN, não só `localhost`), e o lobby exibe o link compartilhável já com o IP
correto. Registrado em [ADR-008](adr/008-implantacao-multi-maquina.md).

Custo baixo, e converte o objetivo literal do enunciado em algo que se demonstra abrindo o
notebook do professor.

### AD-6 — Estados de partida com peso visual proporcional ao requisito (critério: UI)

Duas das cinco funcionalidades nominais estão hoje sinalizadas por uma linha de texto:

- **quem inicia a partida** (requisito 1) — só dá para inferir olhando qual assento está aceso;
- **indicação de vencedor** (requisito 5) — é uma frase no painel lateral.

Como *"elementos da UI só serão considerados quando suas funcionalidades forem
implementadas"*, o inverso também vale na prática: uma funcionalidade que a UI mal mostra é uma
funcionalidade que o avaliador pode não registrar.

**Decisão:** banner de abertura (*"Brancas começam"*) e banner/modal de fim de partida com
motivo e vencedor, ambos em destaque no fluxo principal, não no painel lateral.

### AD-7 — Usar as mensagens de sistema que o protocolo já tem (critério: UI, custo quase zero)

O tipo `ServerMessage` já prevê `chat` com `from: 'system'`, e
[`registry.ts`](../src/server/registry.ts) já tem `postChat(match, 'system', …)` — **nunca
chamado**. O chat vira a linha do tempo da partida ("Pretas entraram", "Brancas desistiram")
de graça, usando código que já existe.

## 5. Riscos

### R-1 🔴 — Nosso motor é mais restritivo que o enunciado

O enunciado define a sequência de capturas assim: *"desde que não passe duas vezes pelo mesmo
lugar"* — **e só**. Nosso motor implementa a regra canônica do paper, que proíbe também
**repetir a direção do lance anterior** ([`moves.ts`](../src/engine/moves.ts),
`continuationMoves`).

Consequência concreta: se o professor tentar uma continuação que repete direção — legal pelo
texto dele, ilegal pelo nosso motor — a interface simplesmente não oferece o lance, e a leitura
natural dele é *"tem bug"*.

~~**Mitigação (via AD-3):** o lance aparece visível e bloqueado, com o motivo escrito.~~

⛔ **Esta mitigação não existe.** A AD-3 (`blockedMoves`) não foi implementada, então o lance
continua **sumindo silenciosamente** da lista de destinos. O risco R-1 está **aberto**.

**Mitigação real, sem código:** antecipar em voz alta, antes de jogar, que o motor segue a
regra canônica do paper e é mais restritivo que o enunciado em três pontos — e que um lance
não oferecido é isso, não bug. Dizer antes de acontecer transforma o que pareceria defeito na
prova de que a regra foi estudada. O texto pronto está no `ROTEIRO.md` da raiz. E o
comportamento continua sendo **uma linha para inverter** (`moves.ts:150`), se ele preferir a
regra do enunciado.

### R-2 🟡 — A apresentação é pessoal e obrigatória

*"TODOS os trabalhos só serão aceitos se apresentados pessoalmente pelo aluno."* O código
entregue no prazo não fecha a nota sozinho. A apresentação já está confirmada como podendo ser
posterior à entrega (19/08), mas **precisa acontecer**.

### R-3 ⚫ — ~~Node SEA é o caminho menos trilhado~~ (extinto em 06/09)

Empacotar Node em binário tem pegadinhas (assets, workers). Mitigação: começar a Fase 6 com
dois dias, e plano B explícito — entregar `.zip` com `node_modules` e um script de start
documentado, o que ainda atende *"se a linguagem permitir"*.

## 6. O que este replanejamento **não** muda

Decisões avaliadas e mantidas — registrar o que não muda é tão importante quanto o que muda:

| Mantido | Por quê |
|---|---|
| WebSocket em vez de TCP cru | [ADR-001](adr/001-websocket-em-vez-de-tcp-cru.md), já validada com o professor em 19/08. Não reabrir |
| Uma `worker_thread` por partida | [ADR-002](adr/002-worker-thread-por-partida.md). É o núcleo da defesa da disciplina |
| Estado completo, sem delta | [ADR-003](adr/003-estado-completo-em-vez-de-delta.md). Dessincronização impossível por construção |
| Chat fora do worker | [ADR-005](adr/005-chat-na-thread-principal.md). É o canal que evidencia bloqueio do event loop |
| Stack full-stack TypeScript no navegador | Restrição do projeto. Nenhuma decisão aqui a contraria |
| Não testar renderização SVG automaticamente | [`05-testes.md` §7](05-testes.md). Custo alto, retorno baixo a 6 dias da entrega |

Nenhuma reescrita estrutural entra neste replanejamento. O código está bem fatiado
(`engine/` puro, servidor sem regra, cliente sem regra) e refatorar arquitetura a seis dias da
entrega é risco sem retorno de nota — arquitetura não é critério.

## 7. Ordem de execução — registro histórico de 03/09

> ⚠️ **Nada abaixo de P0 foi executado.** Mantido como registro do que foi priorizado, não
> como plano vivo. O resultado real está na §8.

| Prioridade | Item | Critério que move | Fase |
|---|---|---|---|
| P0 | Verificar `npm start` em clone limpo (AD-4) | Entregável obrigatório | 6 |
| P0 | Multi-máquina (AD-5) | Funcionalidades / objetivo literal | 6 |
| P1 | Banners de início e fim (AD-6) | UI | 5 |
| P1 | Lances bloqueados (AD-3) | UI + Funcionalidades, e mitiga R-1 | 5 |
| P1 | Bot + demonstração de threads (AD-2) | Explicação do Código | 5 |
| P2 | Painel de observabilidade (AD-1) | Explicação do Código | 5 |
| P2 | Mensagens de sistema no chat (AD-7) | UI | 5 |

Cronograma dia a dia em [`06-plano-de-implementacao.md`](06-plano-de-implementacao.md).

---

## 8. O que de fato ficou pronto — fechamento em 10/09/2026

Escrito depois da entrega, contra o código em `main = a848c35`.

### As 5 funcionalidades nominais: ✅ todas

Prontas desde 03/09 e cobertas por teste de rede ponta a ponta. É o que o enunciado exige
nominalmente, e é o que sustenta os critérios *UI* e *Funcionalidades*.

### O que foi planejado e não entrou

| Item | Decisão de |
|---|---|
| `GET /api/stats` + painel de threads (AD-1) | falta de tempo |
| `server/bot.ts` + seletor de thread (AD-2) | falta de tempo |
| `blockedMoves` (AD-3) | falta de tempo — **deixa o risco R-1 aberto** |
| IPs da LAN no boot (AD-5) | falta de tempo |
| Banners de início e fim (AD-6) | falta de tempo |
| Chat de sistema (AD-7) | falta de tempo |
| Executável (AD-4) | **decisão deliberada** — [ADR-012](adr/012-entrega-sem-binario.md) |
| Refatoração DDD/Clean da [ADR-010](adr/010-camadas-por-contexto-delimitado.md) | falta de tempo — a árvore continua `engine/ server/ client/` |

### O que ocupou o lugar deles no critério *Explicação do Código*

Duas demonstrações empíricas que **não estavam previstas em lugar nenhum deste documento**, e
que não precisaram de código novo — ambas em [`03-concorrencia.md` §4](03-concorrencia.md):

1. **Contagem de threads do SO** (`ps -M`): `+1` ao criar a partida, `−1` quando ela é
   destruída. O número vem do sistema operacional, não da aplicação — é mais forte que o
   painel `/api/stats` que a AD-1 planejava, justamente por não passar pelo código do autor.
2. **Bloqueio do event loop medido** (`JSON.parse` de 90 MB na thread principal congelando o
   chat de *outra* partida por 1,1 s). A AD-2 supunha que só o bot poderia demonstrar isso.
   Estava errado: o caminho de entrada já tinha a tarefa de CPU, e ela é ao mesmo tempo um
   achado de segurança com correção de uma linha.

**A lição que vale registrar:** as duas melhores provas de concorrência do projeto vieram de
*medir o que já existia*, não de construir um instrumento novo. O replanejamento de 03/09
gastou seis dias de plano num aparato de demonstração que não foi construído, enquanto a
demonstração melhor estava a um `ps -M` de distância.
