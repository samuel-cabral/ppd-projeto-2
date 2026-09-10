# Fanorona Multiplayer — Projeto de Sockets

Jogo de tabuleiro **Fanorona** (variante Fanoron-Sivy, 9×5) para dois jogadores em rede:
servidor autoritativo, chat em tempo real durante toda a partida e **paralelismo real via threads**.

|  |  |
|---|---|
| **Disciplina** | Programação Paralela e Distribuída (PPD) — 2026.2 |
| **Instituição** | IFCE |
| **Professor** | Cidcley T. de Souza |
| **Aluno** | Samuel Cabral Lima |
| **Entrega** | 09/09/2026 até 13h — assunto *Projeto Sockets* (prazo original 02/09, renegociado em 03/09) |
| **Apresentação** | 10/09/2026, pessoal — roteiro em [`../ROTEIRO.md`](../ROTEIRO.md) |
| **Estado** | As 5 funcionalidades exigidas estão prontas e testadas. A Fase 5 do plano (bot, `/api/stats`, `blockedMoves`, banners) **não foi implementada** — ver [`07-mapa-de-avaliacao.md` §8](07-mapa-de-avaliacao.md) |
| **Stack** | Node.js · TypeScript · React · WebSocket (`ws`) · `worker_threads` |

---

## Resposta rápida às perguntas mais prováveis

| Pergunta | Onde está a resposta |
|---|---|
| **Onde estão as threads?** | [`03-concorrencia.md` §4](03-concorrencia.md) — contagem de threads do SO subindo e descendo (§4.1) e o bloqueio do event loop medido (§4.2). As duas são empíricas e reprodutíveis |
| Cada requisito do enunciado está onde no código? | [`07-mapa-de-avaliacao.md` §3](07-mapa-de-avaliacao.md) — matriz de rastreabilidade |
| Por que WebSocket e não socket TCP cru? | [`adr/001-websocket-em-vez-de-tcp-cru.md`](adr/001-websocket-em-vez-de-tcp-cru.md) |
| Como o cliente é impedido de trapacear? | [`02-arquitetura.md` §3](02-arquitetura.md) — o cliente não conhece as regras |
| Qual o formato das mensagens? | [`04-protocolo.md`](04-protocolo.md) |
| E se a conexão cair no meio da partida? | [`04-protocolo.md` §4](04-protocolo.md) |
| As regras do jogo estão certas? | [`01-visao-de-produto.md`](01-visao-de-produto.md) + [`05-testes.md`](05-testes.md) |

---

## Documentos

Leia nesta ordem. Cada arquivo trata de um assunto só.

| # | Documento | O que responde |
|---|-----------|----------------|
| 01 | [Visão de produto](01-visao-de-produto.md) | O que é o jogo, geometria do tabuleiro, regras completas, requisitos de interface |
| 02 | [Arquitetura](02-arquitetura.md) | Processos, threads, módulos, fluxo de dados, fronteiras de responsabilidade |
| 03 | [Concorrência e threads](03-concorrencia.md) | Event loop × `worker_threads`, o que cada thread faz, a demonstração empírica |
| 04 | [Protocolo](04-protocolo.md) | Mensagens WebSocket, mensagens thread↔thread, handshake, reconexão, erros |
| 05 | [Estratégia de testes](05-testes.md) | Como o motor de regras é provado correto contra a literatura |
| 06 | [Plano de implementação](06-plano-de-implementacao.md) | Fases, cronograma até 09/09, critérios de pronto, ordem de corte |
| 07 | [Mapa de avaliação](07-mapa-de-avaliacao.md) | Cada requisito do enunciado → onde vive no código → como se demonstra. Replanejamento de 03/09 |
| — | [Decisões de arquitetura (ADRs)](adr/) | Cada decisão relevante, com alternativas descartadas e o porquê |

### Material de apoio

| Arquivo | O que é |
|---|---|
| [`referencias/enunciado.pdf`](referencias/enunciado.pdf) | Enunciado original do projeto |
| [`referencias/fanorona-referencia.html`](referencias/fanorona-referencia.html) | Tabuleiro interativo com o motor de regras completo. Abre no navegador, funciona offline. Usado para validar as regras antes de escrever o servidor. |
| [`referencias/transcricao-video-professor.txt`](referencias/transcricao-video-professor.txt) | Transcrição do vídeo indicado no enunciado |

---

## Como executar

```bash
npm install
npm run build     # cliente com Vite, servidor com esbuild (scripts/build-server.mjs)
npm start         # sobe HTTP + WebSocket na porta 3000
npm test          # motor de regras + reducer do cliente + integração do protocolo
```

Abra `http://localhost:3000`, clique em **Criar partida** e compartilhe a URL da página
(`http://localhost:3000/#/m/<id>` — a rota é por *hash*) com o segundo jogador.

Duas abas do mesmo navegador funcionam como dois jogadores: o assento fica no
`sessionStorage`, que é por aba ([`04-protocolo.md` §4.1](04-protocolo.md)).

Desenvolvimento com recarga automática:

```bash
npm run dev       # cliente em :5173, servidor em :3000, com proxy do WebSocket
```

Para jogar pela internet sem instalar nada do outro lado:

```bash
npx ngrok http 3000
```

---

## Estrutura do repositório

```
.
├── docs/                    esta documentação
├── scripts/                 build do servidor (esbuild)
├── src/
│   ├── shared/              tipos do protocolo, compartilhados cliente+servidor
│   ├── engine/              motor de regras — puro, sem rede, sem threads
│   ├── server/              thread principal (I/O) + worker de partida
│   └── client/              interface React
├── package.json
└── vite.config.ts
```

Os testes ficam **ao lado do código** que testam (`src/**/*.test.ts`), não em uma pasta
`tests/` separada. `src/server/bot.ts` está previsto para a Fase 5 e ainda não existe.

A separação não é cosmética: o `engine/` não importa nada de `server/` nem de `client/`.
É o que permite testá-lo isoladamente contra a literatura e o que garante que o
cliente não tenha como aplicar uma regra por conta própria.
