# Plano de implementação

> Início: 19/08/2026 · Entrega original: 02/09/2026 até 13h.
> **Prazo passou sem entrega. Renegociado com o Prof. Cidcley em 03/09/2026: nova entrega
> 09/09/2026 até 13h**, mesma condição (e-mail até 13h, assunto "Projeto Sockets").
>
> As Fases 1–4 abaixo são o registro do que foi planejado e quando foi de fato concluído.
> A partir da Fase 5 o plano foi refeito em 03/09 para caber na janela nova (6 dias).

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

### 🔲 Fase 5 — Visibilidade das regras e das threads · 04–06/09 · 3 dias

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

### 🔲 Fase 6 — Entrega · 07–08/09 · 2 dias

- **Executável via Node SEA** ([ADR-007](adr/007-executavel-via-node-sea.md)) — entregável
  obrigatório do enunciado; plano B (`.zip` + script) documentado se travar
- **Duas máquinas de verdade** ([ADR-008](adr/008-implantacao-multi-maquina.md)): servidor
  anuncia os IPs de LAN no boot; testar notebook contra notebook na mesma rede, com o firewall
  do macOS já autorizado. `ngrok` como plano B
- `README.md` com instruções de execução conferidas do zero, em máquina limpa
- Revisão da documentação contra o código final — repetir o audit de 03/09 (doc reescrita para
  bater com o código, não o contrário)
- Roteiro de apresentação (§3) e ensaio cronometrado

**Pronto quando:** o jogo roda entre **duas máquinas diferentes** — que é a frase de objetivo do
enunciado — **e** existe um executável funcionando fora deste repositório.

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
| `server/match.worker.ts` — o plumbing das threads | `server/bot.ts`, `client/**`, testes |

## 3. Roteiro da apresentação — 10 minutos

| Tempo | O quê | Critério que ataca |
|---|---|---|
| 0:00 | Abrir a partida em **duas máquinas diferentes** pela rede — é a frase de objetivo do enunciado, executada na frente dele | Funcionalidades |
| 1:00 | Jogar `d3-e3` mostrando o seletor aproximação × afastamento | UI |
| 2:30 | Mostrar um paika **bloqueado, com o motivo escrito** — a captura é obrigatória | UI |
| 3:30 | Executar uma sequência de capturas; explicar por que o turno não vira, e mostrar a continuação bloqueada por direção repetida | UI + Explicação |
| 5:00 | Chat durante o turno do adversário | Funcionalidades |
| 5:30 | **Painel de threads:** duas partidas abertas, dois `threadId` diferentes, nenhum igual ao da thread principal | Explicação |
| 6:00 | **Demonstração do bloqueio:** rodar a IA na thread principal — o chat e o próprio painel congelam; depois no worker — tudo flui | Explicação |
| 8:00 | Percorrer o código: `engine` puro → `index.ts` → `match.worker.ts` | Explicação |
| 9:30 | Fechar com a desistência e o banner de vencedor | Funcionalidades |

O trecho de 5:30 a 8:00 é o núcleo da defesa — é onde os 10 pontos de *Explicação do Código*
são ganhos ou perdidos — e deve ser ensaiado até sair sem hesitação.

## 4. Riscos e ordem de corte

**Situação em 03/09:** as 5 funcionalidades exigidas nominalmente pelo enunciado já estão
prontas (Fases 1–4). O que resta (Fases 5–6) é bot/demonstração de threads e entrega —
nada ali é, tecnicamente, exigência nominal. Isso muda a lista de risco de "o que pode não
ficar pronto" para "o que fica sem a defesa mais forte se não ficar pronto".

| Risco | Mitigação |
|---|---|
| O bot não ficar pronto a tempo | Único item que pode ser cortado sem zerar nenhum requisito — ver ordem de corte |
| Node SEA (executável) ter alguma pegadinha de empacotamento não prevista | Puxar a documentação atual do Node antes de implementar (regra do projeto); começar a Fase 6 com 2 dias de folga, não 1 |
| `ngrok` falhar no dia da apresentação | Testado na Fase 6, com plano B de compartilhamento de tela |

Se o cronograma apertar de novo, cortar **nesta ordem**:

1. Botão *Sugerir lance* (não é a demonstração de threads, é conveniência)
2. O seletor de UI thread-principal×worker — manter a defesa só no código e no discurso de
   [`03-concorrencia.md`](03-concorrencia.md), sem botão ao vivo
3. O bot inteiro (Fase 5) — a defesa das threads fica só no discurso, apoiada no que já é
   demonstrável hoje ([`03-concorrencia.md` §4.1](03-concorrencia.md): chat durante o turno
   do adversário, duas partidas simultâneas isoladas)

**Nunca cortar:** as 5 funcionalidades exigidas (já entregues) e o executável — ambos são
condição de entrega do enunciado, não apenas de nota.

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
| 7 | **Executável** | *"Deverá ser entregue, se a linguagem de programação permitir, um código executável (.jar, .exe, etc.)"* | Node SEA — [ADR-007](adr/007-executavel-via-node-sea.md). Plano B: `.zip` com `node_modules` e script de start documentado |
| 8 | **Apresentação pessoal** | *"TODOS os trabalhos só serão aceitos se apresentados pessoalmente pelo aluno na data final de entrega ou, em casos excepcionais, a combinar com o professor"* | Obrigatória para a nota, mas **não precisa ser no dia da entrega** — combinado com o Prof. Cidcley em 19/08/2026. O prazo travado é só o e-mail |

**Trabalho individual.** O enunciado abre a seção de entrega com *"Trabalho Individual"* em
destaque. A divisão registrada na §2 acima descreve o uso de assistência de código, não
coautoria: a apresentação é pessoal e as partes com maior probabilidade de serem questionadas
foram escritas à mão.
