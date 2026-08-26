# Fanorona Multiplayer — Projeto de Sockets

Jogo de tabuleiro **Fanorona** (variante Fanoron-Sivy, 9×5) para dois jogadores em rede:
servidor autoritativo, chat em tempo real durante toda a partida e **paralelismo real via threads**.

|  |  |
|---|---|
| **Disciplina** | Programação Paralela e Distribuída (PPD) — 2026.2 |
| **Instituição** | IFCE |
| **Professor** | Cidcley T. de Souza |
| **Aluno** | Samuel Cabral Lima |
| **Entrega** | 02/09/2026 até 13h — assunto *Projeto Sockets* |
| **Stack** | Node.js · TypeScript · React · WebSocket (`ws`) · `worker_threads` |

---

## Resposta rápida às perguntas mais prováveis

| Pergunta | Onde está a resposta |
|---|---|
| **Onde estão as threads?** | [`03-concorrencia.md`](03-concorrencia.md) — e há uma demonstração ao vivo do que acontece sem elas |
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
| 06 | [Plano de implementação](06-plano-de-implementacao.md) | Fases, cronograma até 02/09, critérios de pronto, ordem de corte |
| — | [Decisões de arquitetura (ADRs)](adr/) | Cada decisão relevante, com alternativas descartadas e o porquê |

### Material de apoio

| Arquivo | O que é |
|---|---|
| [`referencias/enunciado.pdf`](referencias/enunciado.pdf) | Enunciado original do projeto |
| [`referencias/fanorona-referencia.html`](referencias/fanorona-referencia.html) | Tabuleiro interativo com o motor de regras completo. Abre no navegador, funciona offline. Usado para validar as regras antes de escrever o servidor. |
| [`referencias/transcricao-video-professor.txt`](referencias/transcricao-video-professor.txt) | Transcrição do vídeo indicado no enunciado |

---

## Como executar

> Preenchido na Fase 6 do [plano de implementação](06-plano-de-implementacao.md).
> Os comandos abaixo são o alvo acordado no projeto.

```bash
npm install
npm run build     # compila cliente (Vite) e servidor (tsc)
npm start         # sobe HTTP + WebSocket na porta 3000
npm test          # motor de regras + integração do protocolo
```

Abra `http://localhost:3000`, clique em **Criar partida** e compartilhe o link
`http://localhost:3000/match/<id>` com o segundo jogador.

Para jogar pela internet sem instalar nada do outro lado:

```bash
npx ngrok http 3000
```

---

## Estrutura do repositório

```
.
├── docs/                    esta documentação
├── src/
│   ├── shared/              tipos do protocolo, compartilhados cliente+servidor
│   ├── engine/              motor de regras — puro, sem rede, sem threads
│   ├── server/              thread principal (I/O) + worker de partida + bot
│   └── client/              interface React
├── tests/
├── package.json
└── vite.config.ts
```

A separação não é cosmética: o `engine/` não importa nada de `server/` nem de `client/`.
É o que permite testá-lo isoladamente contra a literatura e o que garante que o
cliente não tenha como aplicar uma regra por conta própria.
