# Decisões de arquitetura

Cada arquivo registra **uma** decisão: o problema, as alternativas consideradas, a escolha
e o que se aceitou perder. O formato é o ADR (*Architecture Decision Record*).

Uma decisão **aceita** não é uma decisão **implementada**. As duas colunas são separadas de
propósito: confundi-las foi o que fez [ADR-004](004-condicao-de-vitoria-e-captura-obrigatoria.md)
descrever por semanas uma tela que não existia.

| # | Decisão | Status | No código? |
|---|---|---|---|
| [001](001-websocket-em-vez-de-tcp-cru.md) | WebSocket em vez de socket TCP cru | Aceita | ✅ |
| [002](002-worker-thread-por-partida.md) | Uma `worker_thread` por partida | Aceita | ✅ |
| [003](003-estado-completo-em-vez-de-delta.md) | Servidor envia o estado completo, não deltas | Aceita | ✅ |
| [004](004-condicao-de-vitoria-e-captura-obrigatoria.md) | Captura obrigatória e condição de vitória | Aceita | 🟡 regra sim, exibição do bloqueio não |
| [005](005-chat-na-thread-principal.md) | Chat na thread principal, fora do worker | Aceita | ✅ |
| [006](006-observabilidade-de-threads.md) | Painel de observabilidade das threads | Aceita | 🔲 Fase 5 |
| [007](007-executavel-via-node-sea.md) | Executável via Node SEA | Aceita | 🔲 Fase 6 |
| [008](008-implantacao-multi-maquina.md) | Implantação em máquinas diferentes como capacidade de primeira classe | Aceita | 🔲 Fase 6 |
| [009](009-lances-bloqueados-no-protocolo.md) | Lances bloqueados viajam no protocolo | Aceita | 🔲 Fase 5 |

As decisões 001–005 são de **19/08/2026**, tomadas antes da primeira linha de código.
As 006–009 são de **03/09/2026**, do replanejamento registrado em
[`07-mapa-de-avaliacao.md`](../07-mapa-de-avaliacao.md) — todas motivadas por um critério de
avaliação específico, nenhuma por gosto arquitetural.
