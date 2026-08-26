# ADR-003 — Servidor envia o estado completo, não deltas

**Data:** 19/08/2026 · **Status:** Aceita

## Contexto

A cada lance o servidor precisa informar os dois clientes. Há duas formas: enviar o que
mudou (delta), ou enviar o estado inteiro.

O instinto de otimização puxa para o delta. É preciso verificar se ele se paga.

## Alternativas

| Alternativa | Tamanho por lance | Risco |
|---|---|---|
| Delta (`{ moveu: d3→e3, removeu: [f3] }`) | ~40 bytes | O cliente precisa aplicar a mudança, e uma mensagem perdida ou fora de ordem dessincroniza permanentemente |
| **Estado completo (`Snapshot`)** | ~300 bytes | Nenhum: o cliente substitui o que tinha |

## Decisão

**Estado completo em toda mudança**, incluindo a lista de lances legais já calculada.

## Justificativa

A diferença é de ~260 bytes por lance. Uma partida média tem 44 lances
(ver [`05-testes.md` §4](../05-testes.md)), o que dá cerca de **11 KB por partida inteira**.
Não há problema de banda a resolver — a otimização não se paga.

O que ela custaria é caro: com delta, o cliente passa a **manter estado derivado**. Toda
divergência entre o que o cliente calculou e o que o servidor tem se torna um bug
silencioso que se acumula e só aparece lances depois. Com estado completo, o cliente é uma
função pura do último `snapshot` recebido, e essa classe inteira de bug deixa de existir.

Há um segundo efeito, mais importante que a simplicidade: como `legalMoves` vem pronto do
servidor com as capturas de cada lance já calculadas, **o cliente não precisa conhecer as
regras**. Ele desenha o que recebeu. Um cliente adulterado não consegue produzir um lance
ilegal, porque quem decide o que é legal é o worker — e ele recalcula a lista a cada
intenção recebida.

Isso também entrega de graça quatro requisitos de interface (destaque dos destinos,
marcador por tipo de captura, seletor aproximação × afastamento e prévia das peças
condenadas): todos saem de `legalMoves`.

## Consequências

- ✅ Dessincronização é impossível por construção
- ✅ Trapaça pelo cliente é impossível por construção
- ✅ Depuração trivial: cada `snapshot` é um retrato completo e registrável
- ✅ O cliente fica pequeno e sem lógica de regra
- ⚠️ ~7× mais bytes por lance — irrelevante nesta escala, revisitar só se houver muitas partidas simultâneas
