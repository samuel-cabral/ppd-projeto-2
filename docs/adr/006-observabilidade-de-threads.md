# ADR-006 — Painel de observabilidade das threads

**Data:** 03/09/2026 · **Status:** Aceita

## Contexto

A decisão estrutural mais forte do projeto é [uma `worker_thread` por
partida](002-worker-thread-por-partida.md). Ela sustenta a resposta à pergunta central da
disciplina — *"onde estão as threads?"*.

O problema é que ela é **invisível**. Rodando o jogo, nada na tela indica que existem threads:
o tabuleiro seria idêntico se tudo rodasse no event loop. Numa avaliação em que *Explicação do
Código* vale 10 pontos, isso significa depender inteiramente de o avaliador **acreditar** na
descrição, ou de percorrer o código-fonte junto.

Há uma assimetria cruel aqui: a parte mais difícil do projeto é a que menos aparece.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Não fazer nada — explicar lendo o código na apresentação | Funciona, mas gasta o tempo mais caro da apresentação e depende de o avaliador acompanhar código ao vivo |
| `console.log` no terminal do servidor | Já existe parcialmente. Serve para depurar, mas obriga a mostrar um terminal ao lado do jogo, e não sobrevive à leitura assíncrona do projeto |
| Página de debug separada (`/debug`) | Melhor, mas fica fora do fluxo — algo que só aparece se o avaliador for levado até lá |
| **Endpoint `/api/stats` + painel na própria interface** | A concorrência vira parte do produto, observável durante o jogo normal |

## Decisão

A thread principal expõe **`GET /api/stats`** com o retrato do registro de partidas:

```ts
{
  matches: [
    { id: 'a3f9…', threadId: 12, seats: 2, plies: 17, uptimeMs: 94_000, chatCount: 4 },
    { id: 'b7c1…', threadId: 13, seats: 1, plies: 0,  uptimeMs: 5_000,  chatCount: 0 },
  ],
  mainThreadId: 1,
  activeWorkers: 2,
}
```

O `threadId` é o identificador **real** da thread (`worker.threadId` do módulo
`node:worker_threads`), não um número inventado pela aplicação.

A interface consome isso num painel recolhido por padrão, dentro da tela de partida.

## Justificativa

O dado que prova a arquitetura é o `threadId`: duas partidas abertas mostram dois números
diferentes, e o `mainThreadId` mostra que nenhum dos dois é a thread principal. É a diferença
entre afirmar isolamento e exibir isolamento.

Isso também dá base numérica à demonstração de bloqueio da
[`03-concorrencia.md` §4.2](../03-concorrencia.md): com a busca do bot na thread principal, o
próprio `/api/stats` **para de responder** — o endpoint que mede o bloqueio é vítima dele, o
que é a demonstração mais direta possível de que o event loop travou.

O endpoint fica na thread principal e lê apenas o `MatchRegistry`, que já é a estrutura que
conhece todas as partidas. Nenhuma mensagem nova cruza a fronteira de thread: **o worker não
precisa ser perguntado nada** — se precisasse, um worker bloqueado não responderia, e a métrica
mentiria justamente no momento em que importa.

## Consequências

- ✅ A afirmação central da disciplina passa a ser verificável na tela, não só no discurso
- ✅ O congelamento do próprio painel vira evidência do bloqueio do event loop
- ✅ Custo baixo: os dados já existem no `MatchRegistry`, falta expor
- ⚠️ Um endpoint a mais na superfície pública do servidor — expõe apenas contadores e ids
  opacos, nenhum estado de jogo e nenhum dado de jogador
- ⚠️ O painel precisa de *polling*; se o intervalo for curto demais, ele mesmo vira ruído no
  event loop que pretende medir. Intervalo de 1s é suficiente e desprezível
