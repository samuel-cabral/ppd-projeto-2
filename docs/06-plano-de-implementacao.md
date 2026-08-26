# Plano de implementação

> Início: 19/08/2026 · Entrega: **02/09/2026 até 13h**
> 14 dias corridos: 12 de trabalho, 2 de folga proposital.

## 1. Fases

Cada fase tem um critério de pronto verificável. Nenhuma fase começa antes de a anterior
passar no seu critério.

### Fase 1 — Motor de regras · 19–20/08 · 2 dias

Nenhuma linha de rede. O motor é escrito contra os testes da
[estratégia de testes](05-testes.md), que são escritos primeiro.

- Estrutura do projeto: TypeScript, Vite, `vitest`
- `engine/board.ts` — paridade forte/fraco, vizinhança, posição inicial
- `engine/moves.ts` — geração de lances, captura em linha, sequências, fim de jogo
- `engine/notation.ts` — `b2-c2A`
- `shared/protocol.ts` — os tipos das mensagens

**Pronto quando:** `npm test` passa, incluindo o teste-ouro dos 5 lances de abertura e as
200 partidas simuladas.

### Fase 2 — Rede e threads · 21–22/08 · 2 dias

- `server/index.ts` — HTTP + WebSocket, handshake, `join`, roteamento
- `server/registry.ts` — ciclo de vida das partidas, reconexão, ping/pong
- `server/match.worker.ts` — o worker de partida
- Teste de integração com dois clientes WebSocket

**Pronto quando:** dois clientes de terminal jogam uma partida completa até a vitória, e o
teste de integração passa.

### Fase 3 — Tabuleiro · 23–26/08 · 4 dias

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

### Fase 4 — Funcionalidades exigidas · 27–28/08 · 2 dias

- Chat lateral, ativo durante toda a partida
- Botão *Desistir* com confirmação
- Placar de capturas 22 → 0 para cada lado
- Histórico de lances em notação
- Tela de fim de partida com o motivo
- Indicador de status da conexão e do oponente

**Pronto quando:** os 13 requisitos de [`01-visao-de-produto.md` §4](01-visao-de-produto.md)
existem e funcionam.

### Fase 5 — Oponente artificial e demonstração · 29/08 · 1 dia

- `server/bot.ts` — busca alpha-beta sobre o motor
- Botão *Sugerir lance*
- Seletor **thread principal × worker** para a demonstração de bloqueio

**Pronto quando:** com a busca na thread principal o chat visivelmente congela; com a
busca no worker, não.

### Fase 6 — Entrega · 30/08 · 1 dia

- `npx ngrok http 3000` testado com um segundo dispositivo
- `README.md` com instruções de execução preenchidas
- Revisão da documentação contra o código final
- Roteiro de apresentação (§3) e ensaio cronometrado

**Pronto quando:** um link enviado para outra máquina abre e joga.

### Folga — 31/08 e 01/09

Reservada para o que atrasar. Não é tempo livre: é o que separa o cronograma da
madrugada de 02/09.

## 2. Divisão do trabalho

Este é um trabalho individual e a apresentação é pessoal. As partes que o professor tem
maior probabilidade de questionar são escritas à mão:

| Escrito à mão | Assistido |
|---|---|
| `engine/board.ts`, `engine/moves.ts` — as regras | Estrutura do projeto, configuração de build |
| `server/index.ts` — handshake e roteamento do socket | `server/registry.ts` |
| `server/match.worker.ts` — o plumbing das threads | `server/bot.ts`, `client/**`, testes |

## 3. Roteiro da apresentação — 10 minutos

| Tempo | O quê |
|---|---|
| 0:00 | Abrir duas abas, criar partida, compartilhar o link |
| 1:00 | Jogar o primeiro lance `d3-e3` mostrando o seletor aproximação × afastamento |
| 2:30 | Mostrar um paika bloqueado — a captura é obrigatória |
| 3:30 | Executar uma sequência de capturas; explicar por que o turno não vira |
| 5:00 | Chat durante o turno do adversário |
| 6:00 | **Demonstração das threads:** rodar a IA na thread principal e mostrar o chat congelando; depois no worker |
| 8:00 | Percorrer o código: `engine` puro → `index.ts` → `match.worker.ts` |
| 9:30 | Fechar com a desistência e a tela de vencedor |

O trecho das 6:00 é o núcleo da defesa e deve ser ensaiado até sair sem hesitação.

## 4. Riscos e ordem de corte

| Risco | Mitigação |
|---|---|
| A regra de sequência de capturas consumir mais tempo que o previsto | É a primeira coisa escrita, na Fase 1, com testes antes do código |
| A interface do tabuleiro atrasar | Tem 4 dias e 2 de folga logo depois |
| `ngrok` falhar no dia | Testado na Fase 6, com plano B de compartilhamento de tela |

Se o cronograma apertar, cortar **nesta ordem**:

1. Oponente artificial (a defesa das threads fica só no discurso)
2. Histórico em notação
3. Reconexão após queda

**Nunca cortar:** chat, desistência e indicação de vencedor — são exigência explícita do
enunciado, e a nota de interface só conta quando a funcionalidade existe.

## 5. Entrega

- Todo o código-fonte
- Esta documentação
- E-mail para `cidcleyppd@gmail.com`, assunto **"Projeto Sockets"**, até 13h de 02/09/2026
- Apresentação pessoal — obrigatória
