# ADR-011 — Oponente artificial como instrumento de demonstração

**Data:** 06/09/2026 · **Status:** Aceita

## Contexto

O enunciado **não pede** oponente artificial. As cinco funcionalidades exigidas nominalmente —
turno, movimentação, desistência, chat e indicação de vencedor — já estão implementadas sem ele.

Ele existe por um motivo só, e é um motivo de arquitetura, não de jogo.

A afirmação central da disciplina, registrada em [`03-concorrencia.md`](../03-concorrencia.md),
é que uma tarefa pesada de CPU na thread principal bloqueia **todas** as conexões: enquanto ela
executa, nada entra e nada sai. É o mesmo efeito de uma thread travada em `readLine()`, que é
literalmente o problema que o enunciado cita ao falar em *"threads para paralelizar envio e
recepção nos sockets"*.

O problema é que **este projeto não tem nenhuma tarefa pesada.** As regras do motor rodam em
microssegundos: as 200 partidas simuladas do teste de invariantes terminam em ~300ms no total.
Não há nada para travar, portanto não há como demonstrar a diferença entre rodar no worker e
rodar na thread principal. Sem isso, `03-concorrencia.md` §4.2 permanece no discurso.

Daí o requisito invertido que define este componente: **o bot precisa ser lento.** Não
"aceitavelmente lento" — lento de propósito, por vários segundos, de forma previsível. É o
oposto do requisito de qualquer IA de jogo real, e é a razão pela qual ele merece um ADR
próprio em vez de uma linha no plano.

## Alternativas

### Quanto ao que executar

| Alternativa | Avaliação |
|---|---|
| `while (Date.now() - início < 4000) {}` — bloqueio artificial | Produz exatamente o mesmo congelamento e custa cinco minutos de trabalho. **Recusada por honestidade:** se o avaliador perguntar *"isso é trabalho de verdade?"*, a resposta é não, e a demonstração inteira perde o valor. Um bloqueio fabricado prova que `while` trava o event loop, não que uma carga real de CPU trava |
| `crypto.pbkdf2Sync` ou hash em laço | Trabalho real de CPU, mas alheio ao domínio. Não explica por que *este* sistema precisa de threads |
| **Busca alpha-beta sobre o motor de regras** | Trabalho real, do domínio, e usando o código que já existe. A pergunta *"por que uma thread por partida?"* passa a ter resposta concreta: porque a partida tem uma computação de segundos |

### Quanto ao papel na aplicação

| Alternativa | Avaliação |
|---|---|
| Oponente jogável — modo "jogar contra a máquina" | Exigiria o bot ocupando um assento, o registry sabendo criar partida de um jogador só, e o worker disparando lance sozinho. Mexe em `Match` e nos assentos, justamente a parte mais frágil do sistema (timers, sockets, reconexão). Custo alto, e o enunciado não pede |
| **Instrumento: botão *Sugerir lance* + seletor de thread** | O bot calcula um lance e o devolve como sugestão ao jogador humano. Zero impacto em assentos, em turno e em condição de vitória |

## Decisão

O oponente artificial é **aparato de demonstração, não funcionalidade de jogo** — confirmando a
AD-2 do [mapa de avaliação](../07-mapa-de-avaliacao.md).

### Algoritmo

Busca **alpha-beta de profundidade fixa** sobre `Game.clone()`, com função de avaliação por
**diferença de material**:

```
avaliação(estado, cor) = peças(cor) − peças(adversário)
```

Material puro é a heurística honesta aqui, e a justificativa é do domínio: em Fanorona a captura
é obrigatória e uma jogada encadeada pode derrubar seis peças de uma vez, então a diferença de
material domina qualquer consideração posicional em busca rasa. Mobilidade e controle de pontos
fortes foram considerados e cortados — acrescentariam parâmetros a justificar na defesa sem
mudar o que o componente existe para fazer.

### Calibração

A profundidade é **fixa**, escolhida empiricamente para a busca levar **3 a 5 segundos** na
posição de meio de jogo. O valor exato entra em uma constante nomeada, medida na máquina de
apresentação, não estimada.

A faixa não é arbitrária:

- **abaixo de ~2s** o congelamento do chat é ambíguo — parece lag de rede, não bloqueio;
- **acima de ~8s** parece travamento de verdade, e o avaliador tende a interpretar como defeito
  em vez de demonstração;
- **profundidade fixa em vez de orçamento de tempo** porque é determinística: a mesma posição
  leva sempre o mesmo tempo, então o ensaio da apresentação vale para o dia da apresentação.

### Onde roda

Por padrão, **dentro do worker da partida** — é a tarefa que justifica a existência do worker
([ADR-002](002-worker-thread-por-partida.md)).

Um seletor na interface permite rodá-la **na thread principal**, violando a fronteira de
propósito. Essa é a única violação deliberada de fronteira do sistema, e existe para ser
observada:

| Bot no worker | Bot na thread principal |
|---|---|
| chat flui normalmente | mensagens de chat não saem |
| `GET /api/stats` responde | o endpoint que mede o bloqueio **é vítima dele** |
| outras partidas seguem | todas as partidas do servidor param |
| indicador *"pensando…"* anima | a interface inteira congela |

O caso mais eloquente é o `/api/stats` ([ADR-006](006-observabilidade-de-threads.md)) parar de
responder: o instrumento de medição travando junto é a evidência mais direta possível de que o
event loop parou.

## Justificativa

Escolher busca real em vez de bloqueio fabricado custa algumas horas e compra uma coisa que não
se compra depois: **a demonstração resiste a pergunta**. O avaliador pode abrir `bot.ts`, ver
uma poda alpha-beta legítima operando sobre o mesmo `legalMoves` que o jogo usa, e verificar que
a lentidão é consequência do problema, não de um `sleep`.

Manter o bot como instrumento, e não como oponente, protege a parte do sistema que já funciona.
As cinco funcionalidades exigidas estão prontas; um modo "contra a máquina" reabriria assentos,
turno e condição de vitória a três dias da entrega, arriscando pontos garantidos para ganhar
pontos que o enunciado não oferece.

`Game.clone()` é pré-requisito e vem da [ADR-010](010-camadas-por-contexto-delimitado.md): com o
estado em variáveis soltas de módulo, como está hoje em `match.worker.ts`, não há o que clonar e
a busca é impossível.

## Consequências

- ✅ `03-concorrencia.md` §4.2 sai do discurso e vira demonstração ao vivo — é o trecho da
  apresentação que carrega os pontos de *Explicação do Código*
- ✅ A resposta a *"por que uma thread por partida?"* passa a ter uma carga real para apontar
- ✅ Sem impacto em assento, turno ou condição de vitória: o bot sugere, quem joga é o humano
- ✅ O congelamento do próprio `/api/stats` vira evidência, não defeito
- ⚠️ É o **primeiro item da ordem de corte** do [plano](../06-plano-de-implementacao.md). Se o
  tempo acabar, a defesa das threads recua para o que já é demonstrável hoje: chat durante o
  turno do adversário e duas partidas simultâneas isoladas ([`03-concorrencia.md` §4.1](../03-concorrencia.md))
- ⚠️ A profundidade precisa ser **medida na máquina da apresentação**. Uma constante calibrada
  num MacBook M1 e apresentada em outra máquina pode cair fora da faixa de 3 a 5 segundos
- ⚠️ Um bot que joga por material puro joga mal. Isso é aceitável e declarado: ele não existe
  para jogar bem. Se o avaliador perguntar por que a sugestão foi ruim, a resposta é esta ADR
