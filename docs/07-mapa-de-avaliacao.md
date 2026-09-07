# Mapa de avaliação — do enunciado à evidência

> Replanejamento arquitetural de **03/09/2026**, feito depois de reler o
> [enunciado](referencias/enunciado.pdf) linha a linha e o código inteiro.
> Entrega: **09/09/2026 até 13h**.
>
> Este documento existe por um motivo só: a nota tem exatamente três critérios, e
> arquitetura **não é um deles**. Toda decisão registrada aqui é justificada por qual
> critério ela move, ou não entra.

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
| — | Executável | — | Binário rodando fora do repositório | 🔲 **Lacuna** — AD-4 |
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

### AD-4 — Executável via Node SEA (critério: entregável obrigatório)

O enunciado pede executável *"se a linguagem permitir"*. Node 22 permite: **Single Executable
Applications** produz um binário nativo. Registrado em
[ADR-007](adr/007-executavel-via-node-sea.md).

Não vale nota diretamente, mas é condição de entrega — sua ausência é um risco de zerar item,
não de perder pontos.

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

**Mitigação (via AD-3):** o lance aparece **visível e bloqueado, com o motivo escrito**
("direção repetida — regra 3.4.4"), em vez de sumir. A divergência deixa de ser um bug
aparente e vira a prova de que a regra foi estudada. Se ele discordar, a conversa acontece com
a regra na tela — e o comportamento é uma linha de código para inverter.

### R-2 🟡 — A apresentação é pessoal e obrigatória

*"TODOS os trabalhos só serão aceitos se apresentados pessoalmente pelo aluno."* O código
entregue no prazo não fecha a nota sozinho. A apresentação já está confirmada como podendo ser
posterior à entrega (19/08), mas **precisa acontecer**.

### R-3 🟡 — Node SEA é o caminho menos trilhado

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

## 7. Ordem de execução

| Prioridade | Item | Critério que move | Fase |
|---|---|---|---|
| P0 | Executável (AD-4) | Entregável obrigatório | 6 |
| P0 | Multi-máquina (AD-5) | Funcionalidades / objetivo literal | 6 |
| P1 | Banners de início e fim (AD-6) | UI | 5 |
| P1 | Lances bloqueados (AD-3) | UI + Funcionalidades, e mitiga R-1 | 5 |
| P1 | Bot + demonstração de threads (AD-2) | Explicação do Código | 5 |
| P2 | Painel de observabilidade (AD-1) | Explicação do Código | 5 |
| P2 | Mensagens de sistema no chat (AD-7) | UI | 5 |

Cronograma dia a dia em [`06-plano-de-implementacao.md`](06-plano-de-implementacao.md).
