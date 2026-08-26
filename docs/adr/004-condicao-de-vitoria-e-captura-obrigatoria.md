# ADR-004 — Captura obrigatória e condição de vitória

**Data:** 19/08/2026 · **Status:** Aceita

## Contexto

As fontes consultadas divergem em dois pontos, e ambos mudam o comportamento do jogo.

**Condição de vitória.** O vídeo indicado no enunciado encerra dizendo que *"o vencedor é
aquele que capturar mais peças"*. Mas o próprio enunciado, o corpo do mesmo vídeo, a
Wikipédia e o paper de Schadd et al. (2008) dizem *capturar todas as peças do adversário*.

**Captura obrigatória.** O vídeo não menciona a regra. Todas as demais fontes a tratam
como regra canônica: havendo qualquer captura possível, jogar paika é proibido.

## Decisão

1. **Vitória:** adversário com zero peças, **ou** sem lance legal, **ou** desistência.
   O placar de capturas fica visível o tempo todo na interface.
2. **Captura é obrigatória.** Havendo captura disponível, nenhum paika é oferecido — e a
   interface mostra os destinos paika bloqueados **com o motivo**.

## Justificativa

Sobre a vitória: "capturar mais peças" exigiria inventar um critério de parada que
nenhuma fonte define — mais peças *quando*? Adotar a regra canônica e manter o placar
sempre visível atende à leitura do vídeo sem introduzir uma condição de vitória que não
existe em lugar nenhum.

Sobre a captura obrigatória: é a regra que mais muda a natureza do jogo. Sem ela, o jogo
vira outro. Implementá-la e **exibi-la** — o destino bloqueado explica por que está
bloqueado — transforma uma divergência de fonte em uma demonstração de que a regra foi
compreendida, e não ignorada.

Ambas as decisões estão registradas em
[`01-visao-de-produto.md` §3.6](../01-visao-de-produto.md) e cobertas por testes
([`05-testes.md` §2](../05-testes.md)).

## Consequências

- ✅ Comportamento alinhado com a literatura e verificável contra o paper
- ✅ A divergência entre as fontes é tratada explicitamente, não escondida
- ⚠️ Se o professor esperava vitória por contagem de peças, a discrepância precisa ser
  apontada na apresentação — o placar visível é o que torna a conversa fácil
