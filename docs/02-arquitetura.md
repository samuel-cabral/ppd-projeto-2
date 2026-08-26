# Arquitetura

> Pré-requisito: [`01-visao-de-produto.md`](01-visao-de-produto.md) (regras do jogo e requisitos de tela).
> Detalhamento das threads: [`03-concorrencia.md`](03-concorrencia.md). Formato das mensagens: [`04-protocolo.md`](04-protocolo.md).

## 1. Visão geral

Um único processo Node atende tudo: serve a interface, aceita as conexões WebSocket e
hospeda uma thread isolada por partida em andamento.

```
┌─ Navegador (jogador 1) ─┐        ┌─ Navegador (jogador 2) ─┐
│  React + SVG            │        │  React + SVG            │
└───────────┬─────────────┘        └───────────┬─────────────┘
            │ WebSocket                        │ WebSocket
            └───────────────┬──────────────────┘
                            ▼
┌─ Processo Node ─────────────────────────────────────────────────┐
│                                                                  │
│  THREAD PRINCIPAL — somente entrada e saída                     │
│    • servidor HTTP: entrega o build do cliente                  │
│    • servidor WebSocket: aceita conexões, faz parse dos frames  │
│    • MatchRegistry: matchId → { worker, socketW, socketB, chat }│
│    • roteamento: socket ⇄ worker.postMessage                    │
│    • chat: retransmitido aqui, nunca entra no worker            │
│                                                                  │
│    ├── Worker  match:a3f9 ──┐                                   │
│    │     • GameState (fonte da verdade)                         │
│    │     • engine (regras)                                      │
│    │     • bot alpha-beta (tarefa intensiva de CPU)             │
│    │                                                             │
│    ├── Worker  match:b7c1 ──┤  partidas simultâneas rodam em    │
│    └── Worker  match:...  ──┘  núcleos diferentes, sem contato  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

A regra que organiza tudo: **a thread principal nunca calcula regra de jogo, e o worker
nunca toca em socket.** Cada lado só conhece mensagens.

## 2. Módulos

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `src/shared/protocol.ts` | Tipos das mensagens trocadas na rede e entre threads | nada |
| `src/engine/board.ts` | Geometria: pontos fortes e fracos, vizinhança, posição inicial | nada |
| `src/engine/moves.ts` | Geração de lances legais, aplicação de captura, condição de fim | `board` |
| `src/engine/notation.ts` | Conversão de e para a notação `b2-c2A` | `board` |
| `src/server/index.ts` | Servidor HTTP + WebSocket, handshake, roteamento | `shared`, `registry` |
| `src/server/registry.ts` | Ciclo de vida das partidas: criar, entrar, reconectar, encerrar | `shared` |
| `src/server/match.worker.ts` | Corpo da thread de partida: recebe intenção, devolve estado | `engine`, `shared` |
| `src/server/bot.ts` | Busca alpha-beta sobre o motor | `engine` |
| `src/client/**` | Interface React | `shared` |

Restrição de dependência verificável por inspeção: **`engine/` não importa nada.**
Não conhece `ws`, não conhece `worker_threads`, não conhece React. É uma biblioteca de
regras pura, e por isso pode ser testada sem subir servidor nenhum
(ver [`05-testes.md`](05-testes.md)).

## 3. O servidor é a autoridade

O cliente **não sabe jogar Fanorona**. Ele não conhece captura obrigatória, não sabe
distinguir ponto forte de ponto fraco e não consegue calcular qual peça cai.

O que o cliente faz:

1. desenha o estado que recebeu;
2. desenha os destinos que o servidor marcou como legais;
3. envia a intenção do jogador (`{ de, para, tipo de captura }`);
4. desenha o próximo estado que chegar.

Consequências:

- **Trapaça é estruturalmente impossível.** Uma mensagem forjada com um lance ilegal é
  rejeitada pelo worker, que não tem como aceitá-la — ele recalcula a lista de lances
  legais a cada intenção recebida. O cliente adulterado não ganha nada.
- **Dessincronização é impossível.** O servidor envia o estado completo, nunca um delta
  (ver [ADR-003](adr/003-estado-completo-em-vez-de-delta.md)). Não existe "o cliente A
  acha que a peça está em d3 e o cliente B acha que está em e3".
- **A demonstração com duas abas é honesta.** As duas abas são dois clientes iguais e
  independentes; nenhuma das duas tem estado privilegiado.

## 4. Fluxo de dados de um lance

```
jogador clica em d3, depois em e3, e escolhe "aproximação"
   │
   │ 1. cliente → servidor, via WebSocket
   │    { t:'move', from:'d3', to:'e3', kind:'A' }
   ▼
THREAD PRINCIPAL — não interpreta o conteúdo
   │ 2. identifica de qual partida e de qual jogador veio o socket
   │ 3. worker.postMessage({ t:'intent', playerId, move })
   ▼
WORKER DA PARTIDA
   │ 4. é a vez desse jogador?                    senão → 'rejected'
   │ 5. o lance está na lista de lances legais?   senão → 'rejected'
   │ 6. aplica: move a peça, remove as capturadas
   │ 7. há sequência de captura possível a partir daqui?
   │       sim → mantém o turno, marca a peça travada e a direção usada
   │       não → passa o turno
   │ 8. calcula a nova lista de lances legais e a condição de fim
   │ 9. parentPort.postMessage({ t:'state', snapshot })
   ▼
THREAD PRINCIPAL
   │ 10. envia o snapshot para os DOIS sockets da partida
   ▼
os dois navegadores redesenham
```

O passo 5 é o ponto em que a autoridade do servidor é exercida, e o passo 7 é onde vive
a regra mais difícil do Fanorona (sequência de capturas com continuação opcional —
ver [`01-visao-de-produto.md` §3.4](01-visao-de-produto.md)).

## 5. Ciclo de vida de uma partida

| Evento | O que acontece |
|---|---|
| Jogador clica em **Criar partida** | Thread principal gera um `matchId`, cria o worker, devolve o link `/match/<id>` |
| Primeiro `join` | Recebe as brancas. Estado: *aguardando oponente* |
| Segundo `join` | Recebe as pretas. Worker envia o estado inicial. Brancas começam |
| Terceiro `join` | Recusado com `MATCH_FULL` — não há espectadores |
| Um socket cai | Worker continua vivo; o oponente é avisado; janela de 5 minutos para reconexão |
| Reconexão dentro da janela | O socket novo é reatado ao mesmo `playerId`; o worker reenvia o estado |
| Janela expira, ou partida termina | `worker.terminate()` e remoção do registro |

Detalhamento em [`04-protocolo.md` §4](04-protocolo.md).

## 6. Decisões registradas

| ADR | Decisão |
|---|---|
| [001](adr/001-websocket-em-vez-de-tcp-cru.md) | WebSocket em vez de socket TCP cru |
| [002](adr/002-worker-thread-por-partida.md) | Uma `worker_thread` por partida |
| [003](adr/003-estado-completo-em-vez-de-delta.md) | Servidor envia o estado completo, não deltas |
| [004](adr/004-condicao-de-vitoria-e-captura-obrigatoria.md) | Captura obrigatória e condição de vitória |
| [005](adr/005-chat-na-thread-principal.md) | Chat na thread principal, fora do worker |
