# Decisões de arquitetura

Cada arquivo registra **uma** decisão: o problema, as alternativas consideradas, a escolha
e o que se aceitou perder. O formato é o ADR (*Architecture Decision Record*).

| # | Decisão | Status |
|---|---|---|
| [001](001-websocket-em-vez-de-tcp-cru.md) | WebSocket em vez de socket TCP cru | Aceita |
| [002](002-worker-thread-por-partida.md) | Uma `worker_thread` por partida | Aceita |
| [003](003-estado-completo-em-vez-de-delta.md) | Servidor envia o estado completo, não deltas | Aceita |
| [004](004-condicao-de-vitoria-e-captura-obrigatoria.md) | Captura obrigatória e condição de vitória | Aceita |
| [005](005-chat-na-thread-principal.md) | Chat na thread principal, fora do worker | Aceita |
