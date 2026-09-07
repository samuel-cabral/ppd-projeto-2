# ADR-009 — Lances bloqueados viajam no protocolo

**Data:** 03/09/2026 · **Status:** Aceita

## Contexto

Duas promessas foram feitas na documentação e nunca implementadas:

1. [ADR-004](004-condicao-de-vitoria-e-captura-obrigatoria.md): *"a interface mostra os destinos
   paika bloqueados **com o motivo**"* — apresentada ali como o que transforma a captura
   obrigatória "de divergência de fonte em demonstração de que a regra foi compreendida".
2. [`01-visao-de-produto.md` §3.6](../01-visao-de-produto.md): mesma promessa.

O código faz o oposto: [`moves.ts`](../../src/engine/moves.ts) `legalMoves()` **descarta** os
paika quando existe captura, e o `Snapshot` só carrega `legalMoves`. O cliente, que por
construção não conhece regra nenhuma ([ADR-003](003-estado-completo-em-vez-de-delta.md)), não
tem como saber que aqueles destinos existiram e foram removidos.

Há um segundo problema, mais grave, descoberto ao reler o enunciado. Ele define a sequência de
capturas como *"desde que não passe duas vezes pelo mesmo lugar"* — **e só isso**. Nosso motor
implementa a regra canônica do paper, que também proíbe **repetir a direção do lance anterior**.
Somos mais restritivos que o enunciado.

Consequência prática: se o avaliador tentar uma continuação que repete direção — legal segundo o
texto dele — a interface simplesmente não oferece o lance. A leitura natural é *"tem bug"*, e a
regra estudada com mais cuidado no projeto vira, na tela, uma ausência silenciosa.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Corrigir a documentação e não implementar nada | Honesto, mas joga fora o argumento central do ADR-004 e deixa R-1 sem mitigação |
| Afrouxar o motor para a regra do enunciado | Contraria a literatura, quebra testes existentes, e troca uma regra correta por uma leitura de um parágrafo resumido |
| Cliente recalcula os bloqueados | Quebra a invariante de que o cliente não conhece regra — a base de ADR-003 |
| **Servidor envia os bloqueados, com motivo** | Mantém o cliente burro, cumpre a promessa e torna a divergência visível |

## Decisão

O `Snapshot` ganha um campo:

```ts
type BlockReason = 'captura-obrigatoria' | 'direcao-repetida' | 'ponto-visitado';

interface BlockedMove {
  from: Point;
  to: Point;
  kind: Kind;
  reason: BlockReason;
}

interface Snapshot {
  // …
  legalMoves:   Move[];          // o que pode ser jogado
  blockedMoves: BlockedMove[];   // o que foi descartado, e por quê
}
```

O motor passa a devolver os lances filtrados junto com o motivo, em vez de descartá-los em
silêncio. A interface desenha esses destinos em estado bloqueado, e o motivo aparece ao passar o
cursor.

## Justificativa

O cliente continua sem conhecer regra nenhuma: ele desenha o que recebe, exatamente como faz
com `legalMoves`. A autoridade permanece inteira no worker — o `blockedMoves` é informativo, e
enviar um deles como intenção continua sendo rejeitado com `ILLEGAL_MOVE`, porque a validação
segue consultando só `legalMoves`.

Sobre a divergência com o enunciado: mostrar o lance bloqueado **com o motivo escrito na tela**
converte o pior cenário no melhor. Em vez de o avaliador concluir "não implementou a sequência
direito", ele lê *"direção repetida — regra 3.4.4"* e vê que a restrição é deliberada, com
fonte. Se ele discordar, a conversa acontece com a regra visível, e inverter o comportamento é
uma linha em `continuationMoves()`.

É o mesmo movimento do ADR-004, agora de fato implementado: **a regra que o jogador vê ser
aplicada é a regra que o avaliador pontua.**

## Consequências

- ✅ Cumpre uma promessa que a documentação já fazia desde 19/08
- ✅ Mitiga o risco R-1 do [mapa de avaliação](../07-mapa-de-avaliacao.md): a divergência com o
  enunciado deixa de parecer bug
- ✅ A captura obrigatória — a regra que mais muda o jogo — fica visível, e não implícita
- ✅ Sem impacto na autoridade do servidor: `blockedMoves` é informativo, nunca jogável
- ⚠️ O `Snapshot` cresce (dezenas de lances a mais por estado). Continua na casa de poucos KB,
  irrelevante nesta escala — mas é o primeiro item que o ADR-003 previu revisitar se houvesse
  muitas partidas simultâneas
- ⚠️ `legalMoves` e `blockedMoves` precisam ser disjuntos por construção, senão a interface
  ofereceria e bloquearia o mesmo destino. Invariante a cobrir por teste
