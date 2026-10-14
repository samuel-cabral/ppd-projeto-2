# Fanorona via RPC — PPD Projeto 2

Fanoron-Sivy (9x5) para dois jogadores em rede. Toda a comunicacao entre os
tabuleiros e **RPC** (JSON-RPC 2.0): o navegador invoca operacoes da interface
`FanoronaServer` e o servidor invoca callbacks da interface `FanoronaClient`.
Servidor Node com uma **thread por partida**. O servidor e a autoridade: o
cliente nao conhece nenhuma regra do jogo.

**Comece por [`docs/08-rpc.md`](docs/08-rpc.md)**: a interface de operacoes,
como uma chamada vira mensagem e o que mudou em relacao ao Projeto 1 (sockets).

IFCE · Programacao Paralela e Distribuida · Prof. Cidcley T. de Souza

## Como executar

```bash
npm install
npm run build
npm start
```

Abra `http://localhost:3000`, clique em **Criar partida** e mande o link da
pagina para o segundo jogador. Duas abas do mesmo navegador funcionam: o
assento fica no `sessionStorage`, que e por aba.

Desenvolvimento com recarga automatica:

```bash
npm run dev
```

Cliente em `http://localhost:5173` (Vite faz proxy do canal RPC para a 3000).

Jogar entre maquinas diferentes:

```bash
npx ngrok http 3000
```

## Testes

```bash
npm test
```

- `src/engine/engine.test.ts` — regras puras, sem rede. Inclui o teste-ouro da
  abertura do paper (as brancas tem exatamente 5 lances legais na posicao
  inicial) e 200 partidas simuladas verificando as invariantes.
- `src/server/network.test.ts` — sobe o servidor de verdade em porta efemera e
  conecta **dois clientes RPC reais**, que jogam uma partida completa ate a
  vitoria chamando `server.move`, alem de lance fora de turno, lance ilegal,
  desistencia, chat e reconexao.

## Mapa do codigo

| Arquivo | Responsabilidade |
|---|---|
| `src/engine/board.ts` | Geometria: pontos fortes e fracos, vizinhanca, posicao inicial. Nao importa nada. |
| `src/engine/moves.ts` | Geracao de lances, captura em linha, sequencias, fim de jogo. |
| `src/engine/notation.ts` | Notacao `b2-c2A`. |
| `src/shared/protocol.ts` | **A interface de operacoes**: `FanoronaServer` e `FanoronaClient`, importadas pelos dois lados. |
| `src/shared/rpc.ts` | Runtime JSON-RPC 2.0: stub (chamar) e skeleton (executar). Mesmo arquivo no navegador e no servidor. |
| `src/server/index.ts` | HTTP + servidor RPC: o *servant* que implementa `FanoronaServer`. So entrada e saida. |
| `src/server/registry.ts` | Ciclo de vida das partidas: assentos, reconexao, chat, destruicao da partida encerrada. |
| `src/server/match.worker.ts` | A thread da partida: recebe intencao, devolve estado. |
| `src/client/matchState.ts` | Reducer puro: interpreta mensagens do servidor sem WebSocket nem React, por isso e testado como o `engine/`. |
| `src/client/` | Interface React + SVG. |

A regra que organiza tudo: **a thread principal nunca calcula regra de jogo, e
o worker nunca toca em socket.**

Documentacao de projeto em [`docs/`](docs/README.md); decisoes em
[`docs/adr/`](docs/adr/README.md).

## Estado

| Funcionalidade exigida | Situacao |
|---|---|
| Controle de turno e quem inicia | pronto — o servidor define, brancas comecam |
| Movimentacao das pecas | pronto — inclui captura obrigatoria, aproximacao x afastamento e sequencias |
| Desistencia | pronto |
| Chat durante toda a partida | pronto |
| Indicacao de vencedor | pronto |
