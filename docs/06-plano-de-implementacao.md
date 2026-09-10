# Plano de implementação

> Início: 19/08/2026 · Entrega original: 02/09/2026 · renegociada para **09/09/2026 até 13h**
> (prazo já vencido). Apresentação pessoal em **10/09/2026**.
>
> ⚠️ **Este documento é registro histórico do planejamento, não descrição do que existe.**
> As Fases 1–4 foram concluídas. **A Fase 5 não foi implementada** e a Fase 6 saiu
> parcialmente. O que existe de fato no código está em
> [`07-mapa-de-avaliacao.md` §3](07-mapa-de-avaliacao.md); o roteiro de apresentação que
> vale é o `ROTEIRO.md` da raiz do repositório, **não a §3 abaixo**.

## 1. Fases

Cada fase tem um critério de pronto verificável. Nenhuma fase começa antes de a anterior
passar no seu critério.

### ✅ Fase 1 — Motor de regras · 19–20/08 · 2 dias · concluída

Nenhuma linha de rede. O motor é escrito contra os testes da
[estratégia de testes](05-testes.md), que são escritos primeiro.

- Estrutura do projeto: TypeScript, Vite, `vitest`
- `engine/board.ts` — paridade forte/fraco, vizinhança, posição inicial
- `engine/moves.ts` — geração de lances, captura em linha, sequências, fim de jogo
- `engine/notation.ts` — `b2-c2A`
- `shared/protocol.ts` — os tipos das mensagens

**Pronto quando:** `npm test` passa, incluindo o teste-ouro dos 5 lances de abertura e as
200 partidas simuladas.

### ✅ Fase 2 — Rede e threads · 21–22/08 · 2 dias · concluída

- `server/index.ts` — HTTP + WebSocket, handshake, `join`, roteamento, heartbeat ping/pong
- `server/registry.ts` — ciclo de vida das partidas, assentos, janela de reconexão, chat
- `server/match.worker.ts` — o worker de partida
- Teste de integração com dois clientes WebSocket

**Pronto quando:** dois clientes de terminal jogam uma partida completa até a vitória, e o
teste de integração passa.

### ✅ Fase 3 — Tabuleiro · 23–26/08 · 4 dias · concluída

A fase mais longa, porque é onde está a maior parte da nota de interface.

- Tabuleiro SVG com as diagonais corretas (uma por célula, alternando — o erro clássico é
  desenhar um X em todas; ver [`01-visao-de-produto.md` §2](01-visao-de-produto.md))
- Peças sobre as interseções, seleção, destaque dos destinos legais
- Marcador visual distinto por tipo: paika, aproximação, afastamento
- Seletor quando o destino aceita os dois tipos de captura
- Prévia das peças condenadas ao passar o cursor
- Modo sequência: peça travada, direções já usadas bloqueadas, botão *Encerrar jogada*

**Pronto quando:** uma partida inteira é jogável em duas abas do navegador, incluindo
sequências de captura.

### ✅ Fase 4 — Funcionalidades exigidas · planejada 27–28/08, concluída 03/09 · atrasou 6 dias

- Chat lateral, ativo durante toda a partida — **concluído em 03/09**, junto com um
  refactor: `matchState.ts`, reducer puro que substituiu o `switch` inline que vivia dentro
  do callback do WebSocket (ver [`02-arquitetura.md` §2](02-arquitetura.md)). Não estava no
  plano original; foi feito porque a extração deixou a lógica de estado testável do mesmo
  jeito que o `engine/`, e porque adicionar o chat era a oportunidade natural de fazer essa
  extração — só depois de mexer no hook para o chat é que valia a pena testar o resto dele junto.
- Botão *Desistir* com confirmação — concluído
- Placar de capturas 22 → 0 para cada lado — concluído
- Histórico de lances em notação — concluído
- Tela de fim de partida com o motivo — concluído
- Indicador de status da conexão e do oponente — concluído

**Pronto quando:** os 13 requisitos de [`01-visao-de-produto.md` §4](01-visao-de-produto.md)
existem e funcionam. **Atingido em 03/09/2026.**

### ⛔ Fase 5 — Visibilidade das regras e das threads · 04–06/09 · **NÃO IMPLEMENTADA**

> **Nenhum dos itens abaixo entrou no código.** Confirmado por inspeção em 09–10/09: não
> existem `src/server/bot.ts`, `GET /api/stats`, `blockedMoves`, banners de início/fim nem
> mensagens de sistema no chat. O texto fica como registro do que foi planejado.
>
> **O que substituiu a demonstração de threads na apresentação:** a contagem de threads do
> SO via `ps -M`, que sobe `+1` por partida e desce `−1` quando a partida é destruída, e a
> medição do bloqueio do event loop pelo `JSON.parse` — as duas em
> [`03-concorrencia.md` §4](03-concorrencia.md). Nenhuma das duas precisou do bot.

Replanejada em 03/09 a partir do [mapa de avaliação](07-mapa-de-avaliacao.md). O tema da fase
não é "adicionar recursos": é **tornar visível o que já funciona mas não aparece na tela**.
Numa avaliação em que UI e Explicação do Código valem 20 dos 30 pontos, funcionalidade
invisível é funcionalidade não pontuada.

**04/09 — regras visíveis (UI + Funcionalidades)**
- `blockedMoves` no `Snapshot` ([ADR-009](adr/009-lances-bloqueados-no-protocolo.md)): motor
  devolve os lances descartados com o motivo; interface os desenha bloqueados
- Banner de abertura (*"Brancas começam"*) e banner de fim de partida com vencedor e motivo
  (AD-6 — requisitos nominais 1 e 5, hoje sinalizados só por uma linha de texto)
- Mensagens de sistema no chat, usando o `from: 'system'` que o protocolo já tem e ninguém
  chama (AD-7)

**05–06/09 — threads visíveis (Explicação do Código)**
- `server/bot.ts` — busca alpha-beta sobre o motor
- Seletor **thread principal × worker** para a demonstração de bloqueio
- `GET /api/stats` + painel de observabilidade ([ADR-006](adr/006-observabilidade-de-threads.md)):
  `threadId` real de cada worker na tela
- Botão *Sugerir lance* (primeiro item da ordem de corte, se apertar)
- Fechar [`03-concorrencia.md` §4.2](03-concorrencia.md) e o item 9 do roteiro de
  [`05-testes.md`](05-testes.md), hoje marcados como pendentes

**Pronto quando:** (a) um destino bloqueado explica na tela por que está bloqueado; (b) com a
busca na thread principal o chat e o `/api/stats` visivelmente congelam, e com a busca no
worker, não.

### 🟡 Fase 6 — Entrega · 07–09/09 · **parcial**

- ~~**Executável via Node SEA**~~ — **cancelado por decisão**, não por falta de tempo:
  [ADR-012](adr/012-entrega-sem-binario.md) substitui a [ADR-007](adr/007-executavel-via-node-sea.md).
  A cláusula *"se a linguagem permitir"* é invocada; `npm start` é a entrega
- 🔲 **Duas máquinas de verdade** ([ADR-008](adr/008-implantacao-multi-maquina.md)):
  **não implementado** — o servidor ainda só imprime `localhost` no boot; o IP da LAN
  precisa ser descoberto na mão (`ipconfig getifaddr en0`). Jogar entre máquinas **funciona**;
  o que falta é o servidor anunciar o endereço
- ✅ `README.md` com instruções de execução
- ✅ Revisão da documentação contra o código final — feita em 09/09 e 10/09
- ✅ Roteiro de apresentação — **`ROTEIRO.md` na raiz**, que substitui a §3 abaixo

**Resultado:** o jogo roda entre duas máquinas diferentes pela LAN, que é a frase de objetivo
do enunciado. Não há executável, e a ausência está justificada por escrito.

### Folga — 09/09 manhã

Reservada para revisão de última hora antes do e-mail das 13h. Não é tempo de
desenvolvimento novo.

## 2. Divisão do trabalho

Este é um trabalho individual e a apresentação é pessoal. As partes que o professor tem
maior probabilidade de questionar são escritas à mão:

| Escrito à mão | Assistido |
|---|---|
| `engine/board.ts`, `engine/moves.ts` — as regras | Estrutura do projeto, configuração de build |
| `server/index.ts` — handshake e roteamento do socket | `server/registry.ts` |
| `server/match.worker.ts` — o plumbing das threads | `client/**`, testes (`server/bot.ts` estava previsto aqui e nunca existiu) |

## 3. Roteiro da apresentação — ⛔ OBSOLETO, não use

> **Este roteiro foi escrito em 03/09 contra a Fase 5 planejada. Cinco dos nove passos
> demonstram coisas que não existem no código.** Ensaiar por ele significa clicar ao vivo
> em telas que nunca foram implementadas.
>
> **O roteiro em vigor é o `ROTEIRO.md` da raiz do repositório**, escrito em 10/09 contra o
> código real e verificado passo a passo.

O que este roteiro prometia e não existe, registrado para não ser tentado de novo:

| Passo prometido | Situação |
|---|---|
| Paika bloqueado **com o motivo escrito** | ❌ `blockedMoves` não existe; o paika só some da lista |
| Continuação bloqueada por direção repetida, marcada na tela | ❌ o destino só some |
| **Painel de threads** com dois `threadId` | ❌ não existe `/api/stats` nem painel |
| Rodar **a IA** na thread principal | ❌ não existe `bot.ts` |
| Banner de vencedor | ❌ é uma linha de texto no painel lateral |
| Abrir em duas máquinas pela rede | 🟡 funciona, mas o IP precisa ser descoberto na mão |

A demonstração de threads que **de fato** foi ao ar está em
[`03-concorrencia.md` §4](03-concorrencia.md): contagem de threads do SO subindo e descendo,
e a medição do bloqueio do event loop.

## 4. Riscos e ordem de corte

**Situação em 03/09:** as 5 funcionalidades exigidas nominalmente pelo enunciado já estão
prontas (Fases 1–4). O que resta (Fases 5–6) é bot/demonstração de threads e entrega —
nada ali é, tecnicamente, exigência nominal. Isso muda a lista de risco de "o que pode não
ficar pronto" para "o que fica sem a defesa mais forte se não ficar pronto".

| Risco | Mitigação |
|---|---|
| O bot não ficar pronto a tempo | Único item que pode ser cortado sem zerar nenhum requisito — ver ordem de corte |
| ~~Node SEA ter pegadinha de empacotamento~~ — **risco extinto em 06/09**: não haverá binário ([ADR-012](adr/012-entrega-sem-binario.md)) | Substituído por um risco menor: o caminho `npm install && npm run build && npm start` precisa ser conferido em **clone limpo**, não assumido |
| `ngrok` falhar no dia da apresentação | Testado na Fase 6, com plano B de compartilhamento de tela |

Se o cronograma apertar de novo, cortar **nesta ordem**:

1. Botão *Sugerir lance* (não é a demonstração de threads, é conveniência)
2. O seletor de UI thread-principal×worker — manter a defesa só no código e no discurso de
   [`03-concorrencia.md`](03-concorrencia.md), sem botão ao vivo
3. O bot inteiro (Fase 5) — a defesa das threads fica só no discurso, apoiada no que já é
   demonstrável hoje ([`03-concorrencia.md` §4.1](03-concorrencia.md): chat durante o turno
   do adversário, duas partidas simultâneas isoladas)

**Nunca cortar:** as 5 funcionalidades exigidas — condição de entrega do enunciado, não
apenas de nota. Foram entregues.

> ⚠️ Esta linha dizia *"e o executável"* até 10/09, contradizendo a
> [ADR-012](adr/012-entrega-sem-binario.md), que decidiu em 06/09 não produzir binário. A
> contradição era do documento, não da decisão: o executável **não** é condição de entrega,
> porque a cláusula do enunciado é condicional (*"se a linguagem de programação permitir"*).
>
> **O corte 3 acontecer de fato:** o bot inteiro foi cortado. A defesa das threads não ficou
> "só no discurso" como esta seção previa — ela ficou na contagem de threads do SO e na
> medição do bloqueio do event loop ([`03-concorrencia.md` §4](03-concorrencia.md)), as duas
> empíricas e nenhuma prevista aqui.

## 5. Entrega

O enunciado impõe condições **cumulativas**: falhar uma zera a entrega, independentemente da
qualidade do código. Checklist literal, com a frase do enunciado ao lado.

| # | Condição | Texto do enunciado | Como cumprir |
|---|---|---|---|
| 1 | **Prazo** | *"Data de Entrega: 02/09. Depois disso o trabalho será desconsiderado"* | Renegociado com o Prof. Cidcley em 03/09: **09/09/2026**. Não há atraso tolerado depois disso |
| 2 | **Hora** | *"só serão recebidos por email até às 13h da data de entrega"* | E-mail enviado antes das 13h — não "no dia" |
| 3 | **Canal** | *"Não serão aceitos trabalhos enviados de qualquer outra forma"* | Só e-mail. WhatsApp, entrega em mãos ou pendrive **não contam** |
| 4 | **Destinatário e assunto** | *"enviado por email (cidcleyppd@gmail.com)... No assunto do email deve conter o texto 'Projeto Sockets'"* | `cidcleyppd@gmail.com`, assunto exatamente **Projeto Sockets** |
| 5 | **Formato do envio** | *"o link do Google drive com os códigos fontes compactados em um único arquivo ou link do GitHub"* | **Plano A:** link do repositório no GitHub. **Plano B**, se o repo estiver privado ou o link falhar: `.zip` único no Google Drive, com permissão de leitura pública conferida |
| 6 | **Todos os códigos** | *"Devem ser entregues TODOS os códigos"* | O repositório inteiro, incluindo `docs/` e testes |
| 7 | **Executável** | *"Deverá ser entregue, **se a linguagem de programação permitir**, um código executável (.jar, .exe, etc.)"* | **Não haverá binário** — [ADR-012](adr/012-entrega-sem-binario.md), que substitui a ADR-007. A cláusula condicional é invocada: em Node, `npm start` é o modo natural de entregar um servidor, e um binário SEA seria de plataforma única (macOS ARM), inútil na máquina do avaliador. `README.md` traz o caminho conferido em clone limpo |
| 8 | **Apresentação pessoal** | *"TODOS os trabalhos só serão aceitos se apresentados pessoalmente pelo aluno na data final de entrega ou, em casos excepcionais, a combinar com o professor"* | Obrigatória para a nota, mas **não precisa ser no dia da entrega** — combinado com o Prof. Cidcley em 19/08/2026. O prazo travado é só o e-mail |

**Trabalho individual.** O enunciado abre a seção de entrega com *"Trabalho Individual"* em
destaque. A divisão registrada na §2 acima descreve o uso de assistência de código, não
coautoria: a apresentação é pessoal e as partes com maior probabilidade de serem questionadas
foram escritas à mão.
