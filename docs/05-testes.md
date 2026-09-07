# Estratégia de testes

> O motor de regras é a parte do sistema em que um erro é silencioso: o jogo continua
> rodando, mas jogando errado. Por isso ele é validado contra fontes externas, não contra
> a própria intuição de quem escreveu.

## 1. O que é testado, e por quê

**33 testes, em três arquivos** (`npm test`):

| Arquivo | Testes | Camada | Como é testada | Motivo |
|---|---|---|---|---|
| `engine/engine.test.ts` | 17 | `engine/` | Testes unitários contra a literatura | É onde erro passa despercebido |
| `client/matchState.test.ts` | 7 | `client/matchState.ts` | Testes unitários, mesmo motivo do `engine/` | Reducer puro — não importa WebSocket nem React, roda sem DOM |
| `server/network.test.ts` | 9 | Protocolo + worker | Integração ponta a ponta, com servidor e sockets reais | Garante que as duas pontas concordam; o plumbing só é correto se a partida inteira funcionar |
| — | — | Interface (renderização) | Verificação manual, com roteiro (§6) | Testar SVG automatizado custa mais do que vale aqui |

O motor não importa `ws`, `worker_threads` nem React
(ver [`02-arquitetura.md` §2](02-arquitetura.md)), então roda em milissegundos sem subir
servidor nenhum.

## 2. Teste-ouro: a abertura do paper

A referência é *Best Play in Fanorona Leads to Draw* (Schadd, Winands, Uiterwijk,
van den Herik, Bergsma — 2008), que resolveu o jogo por completo.

Da posição inicial, as brancas têm **exatamente cinco** lances legais:

```
d2-e3A   captura f4, g5
d3-e3A   captura f3
d3-e3W   captura c3
e2-e3A   captura e4, e5
f2-e3A   captura d4, c5
```

Este único teste prova, de uma vez:

| O que ele prova | Como |
|---|---|
| A geometria está certa | Se `e3` não fosse ponto forte, as diagonais `d2-e3` e `f2-e3` não existiriam |
| A posição inicial está certa | Um único erro de paridade na linha 3 muda a lista |
| Captura obrigatória funciona | Nenhum paika aparece, embora existam dezenas disponíveis |
| Aproximação e afastamento são distintos | `d3-e3` aparece **duas vezes**, com capturas diferentes |
| A captura em linha funciona | `d2-e3A` derruba duas peças, não uma |

> Este teste já pegou um bug real: a primeira versão do motor colocava a linha 3 como
> `preta-branca-preta-branca…` em toda a extensão. O correto é a paridade **inverter
> depois do centro**, porque a posição inicial é simétrica por rotação de 180°. Com o erro,
> `f3` ficava branca e a lista de aberturas saía errada.

## 3. Demais testes unitários

| Teste | O que fixa |
|---|---|
| Paridade forte/fraco | `e3` forte com 8 vizinhos, `e2` fraco com 4, os 4 cantos fortes |
| Contagem inicial | 22 brancas, 22 pretas, `e3` vazia, 45 casas |
| Captura em linha (`b2-c2A`) | Derruba `d2` e `e2`; **não** derruba `g2`, pois `f2` está vazia |
| Afastamento (`f4-e4W`) | Derruba `g4`; **não** derruba `i4`, pois há peça branca em `h4` |
| Sem captura em curva | Uma peça inimiga fora da linha do movimento não cai |
| Sequência: ponto repetido | Voltar a uma casa já visitada não é oferecido |
| Sequência: direção repetida | `f4-e4W-d4A` não é oferecido; com outra direção no meio, é |
| Um turno só | Uma sequência de N capturas não passa a vez no meio |
| Vitória | Adversário zerado e sem lance legal (desistência é testada em §5, no protocolo) |

## 4. Teste de invariantes por simulação

200 partidas jogadas com lances aleatórios legais, verificando a cada lance:

1. a partida sempre termina (nenhum laço infinito na geração de sequências);
2. o total de peças nunca aumenta;
3. `capturadas + no tabuleiro = 22` para cada cor;
4. nenhuma exceção é lançada.

Resultado da execução do protótipo: **média de 43,8 lances por partida**, maior sequência
observada de 6 capturas encadeadas, nenhuma falha. A média de referência do paper para
partidas entre buscas alpha-beta é 43,81.

> ⚠️ Esses três números são **medição histórica do protótipo**, anotada à mão em 20/08 — não são
> asserção do teste. O que o teste afirma são as quatro invariantes acima; ele não verifica a
> média de lances nem o tamanho da maior sequência, e não falharia se elas mudassem. A
> proximidade com o número do paper é indício de que o motor se comporta como a literatura
> descreve, não prova disso.

## 5. Teste de integração do protocolo

Um teste sobe o servidor em porta efêmera, conecta **dois clientes WebSocket reais** e
joga uma partida roteirizada até o fim, verificando:

- o primeiro a entrar recebe as brancas, o segundo as pretas, e o terceiro recebe
  `MATCH_FULL` sem derrubar a própria conexão e sem criar um terceiro assento;
- um lance ilegal recebe `ILLEGAL_MOVE` e **não altera** o estado — provado pela *ausência*
  de um `state` novo, não só pelo código de erro;
- um lance fora do turno recebe `NOT_YOUR_TURN`;
- **sequência é opcional** (regra 3.4.5): com uma sequência em curso, `endTurn` é aceito,
  limpa a sequência e passa a vez;
- mensagem de chat enviada durante o turno do adversário chega aos dois lados;
- fechar e reabrir a conexão com o mesmo `playerId` restaura o mesmo `snapshot`;
- `resign` encerra com `over` para os dois lados;
- em toda a partida roteirizada, os dois clientes recebem `snapshot` **idêntico** — é o
  teste que sustenta [ADR-003](adr/003-estado-completo-em-vez-de-delta.md) na prática.

Este teste é o que prova que thread principal, worker e cliente concordam sobre o
protocolo — nenhum teste unitário cobre isso.

### 5.1 Determinismo: a corrida que os próprios testes tinham

Um teste de integração sobre sockets pode ser não determinístico **por culpa do teste**, e este
conjunto foi. Vale registrar porque o bug é exatamente o conteúdo da disciplina aparecendo no
ferramental.

Cinco dos nove testes começavam assim:

```ts
a.send({ t: 'join', matchId });
b.send({ t: 'join', matchId });   // sem esperar a resposta de `a`
```

`send` não espera resposta, e `a` e `b` são **duas conexões TCP independentes**. Qual delas o
servidor atende primeiro é decidido pelo sistema operacional e pela rede, não pelo código do
teste. Como o servidor dá as brancas a quem chega primeiro, os assentos trocavam de dono de forma
imprevisível.

Sintoma: `rejeita lance ilegal` falhava cerca de **1 em 3 execuções**, com
`expected 'NOT_YOUR_TURN' to be 'ILLEGAL_MOVE'` — uma mensagem que aponta para a validação de
lances, que estava correta. O defeito real estava quinze linhas acima, na ordem de entrada.

O servidor nunca esteve errado. Quem assumia uma ordem que ninguém garantiu era o observador —
que é a forma canônica de uma condição de corrida, e o motivo de o teste ser um bom exemplo para
a apresentação.

**Correção:** `seatBoth()`, que espera o `joined` de cada cliente antes do próximo entrar, e que
documenta a armadilha no lugar onde o próximo teste vai ser escrito.

**Critério de aceitação de um teste de rede neste projeto, daqui em diante:** dez execuções
consecutivas verdes. Uma execução verde não distingue um teste correto de um teste sortudo.

> Um teste instável é pior que um teste que sempre falha. O que sempre falha informa; o instável
> **desinforma** — ensina a ignorar o vermelho, e no dia em que ficar vermelho por um bug de
> verdade, a reação treinada é rodar de novo e seguir.

## 6. Roteiro de verificação manual da interface

Executado antes da entrega, uma vez, com duas abas abertas:

1. Selecionar uma peça sem lance legal — nada é destacado.
2. Selecionar `d3` no primeiro lance — o destino `e3` mostra o seletor de aproximação **ou** afastamento.
3. Passar o cursor sobre cada opção — as peças condenadas mudam entre `f3` e `c3`.
4. **Pendente até `blockedMoves` existir ([ADR-009](adr/009-lances-bloqueados-no-protocolo.md),
   não implementado):** com captura disponível, um destino paika aparece bloqueado com o
   motivo. Hoje o paika apenas **desaparece** da lista — a regra é aplicada, mas não é
   explicada na tela.
5. Executar uma sequência de 2 capturas — a peça fica travada, a direção usada some, o botão *Encerrar jogada* aparece, o turno não vira.
6. Enviar chat durante o turno do adversário — chega imediatamente.
7. Desistir — a confirmação aparece e os dois lados veem o vencedor com o motivo.
8. Fechar uma aba e reabrir o link — a partida continua no mesmo ponto.
9. **Pendente até a Fase 5 (bot ainda não implementado):** rodar a IA na thread principal —
   o chat congela. No worker — o chat flui. ([`03-concorrencia.md` §4.2](03-concorrencia.md))

## 7. O que não é testado, e por quê

| Não testado | Motivo |
|---|---|
| Renderização SVG | Custo alto, retorno baixo; o roteiro manual cobre |
| Carga com muitas partidas | Fora do escopo do enunciado |
| Qualidade de jogo do bot (Fase 5, planejado) | Vai existir para ocupar CPU e demonstrar bloqueio de thread, não para jogar bem |
