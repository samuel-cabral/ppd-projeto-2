# Fanorona — Visão de Produto

> Projeto de Sockets · PPD 2026.2 · IFCE · Prof. Cidcley T. de Souza
> Entrega **02/09/2026 até 13h** · e-mail `cidcleyppd@gmail.com` · assunto **"Projeto Sockets"** · apresentação pessoal obrigatória

## 1. O que é o jogo

Fanorona (variante **Fanoron-Sivy**, 9×5) é um jogo abstrato de dois jogadores de Madagascar,
derivado do Alquerque. Não tem sorte, não tem informação oculta: é xadrez-like, 100% determinístico.

O que o jogador vê: um tabuleiro de **45 pontos** (9 colunas × 5 linhas) ligados por linhas
horizontais, verticais e **diagonais em células alternadas**. 22 peças brancas embaixo,
22 peças pretas em cima, e o **ponto central vazio**. Ganha quem capturar todas as peças do outro.

Fontes: enunciado (PDF), [vídeo do professor](https://www.youtube.com/watch?v=TbqGy7jLioQ)
(transcrição em `docs/referencias/transcricao-video-professor.txt`), [Wikipedia](https://en.wikipedia.org/wiki/Fanorona)
e o paper canônico *Best Play in Fanorona Leads to Draw* (Schadd et al., 2008).

## 2. Geometria do tabuleiro — a parte que a UI precisa acertar

Notação: colunas **a–i** (1–9) da esquerda pra direita, linhas **1–5** de baixo pra cima.
Centro = **e3**.

### Pontos fortes e fracos

Cada ponto é **forte** ou **fraco**, e isso define quantos vizinhos ele tem:

| Tipo | Regra | Vizinhos | Direções |
|------|-------|----------|----------|
| **Forte** | `(coluna + linha)` é **par** | até 8 | N, S, L, O + 4 diagonais |
| **Fraco** | `(coluna + linha)` é **ímpar** | até 4 | N, S, L, O |

Confirmação do paper: `e2` é fraco (5+2=7, ímpar), `e3` é forte (5+3=8, par).
Os quatro cantos (`a1`, `i1`, `a5`, `i5`) e o centro `e3` são **fortes**.

### Como desenhar as diagonais (o erro clássico)

**Não é um X em toda célula.** Cada uma das 32 células (8×4) tem **exatamente uma** diagonal:
a que liga os dois cantos fortes daquela célula. Direções alternam em xadrez — `/`, `\`, `/`, `\`…

Regra de desenho para a célula cujo canto inferior-esquerdo é `(c, l)`:

- se `(c + l)` é **par** → diagonal `/` (de `(c,l)` até `(c+1,l+1)`)
- se `(c + l)` é **ímpar** → diagonal `\` (de `(c+1,l)` até `(c,l+1)`)

O resultado visual é um mosaico de triângulos (tetrakis square tiling): cada ponto fraco fica
no centro de um losango formado por 4 pontos fortes. Se você desenhar X em todas as células,
o tabuleiro fica errado e todo ponto vira forte.

### Posição inicial (44 peças, `e3` vazio)

```
5   ● ● ● ● ● ● ● ● ●      linha 5: 9 pretas
4   ● ● ● ● ● ● ● ● ●      linha 4: 9 pretas
3   ● ○ ● ○ · ● ○ ● ○      linha 3: alternada, centro vazio
2   ○ ○ ○ ○ ○ ○ ○ ○ ○      linha 2: 9 brancas
1   ○ ○ ○ ○ ○ ○ ○ ○ ○      linha 1: 9 brancas
    a b c d e f g h i
```

Linha 3 exata: `a3`=preta, `b3`=branca, `c3`=preta, `d3`=branca, **`e3`=vazio**,
`f3`=preta, `g3`=branca, `h3`=preta, `i3`=branca.
Total: 9+9+4 = **22 de cada**. A posição é simétrica por rotação de 180°.

**Brancas embaixo, pretas em cima. Brancas jogam primeiro.**

## 3. Regras

### 3.1 Movimento

Uma peça move-se **um ponto por vez**, para um ponto vizinho **vazio**, ao longo de uma linha
desenhada. Ponto fraco → 4 direções; ponto forte → 8.

Movimento que não captura chama-se **paika**.

### 3.2 Captura por aproximação

A peça move-se em direção a uma peça inimiga que está **na continuação da linha do movimento**,
ficando adjacente a ela. Captura essa peça **e todas as peças inimigas seguidas atrás dela**,
na mesma direção, até encontrar um ponto vazio ou uma peça própria.

Exemplo do paper (Fig. 3): `b2-c2A` — a branca vai de `b2` para `c2`, aproxima-se da preta em `d2`,
captura `d2` **e** `e2` (também preta, na sequência); `g2` não cai porque `f2` está vazio.

### 3.3 Captura por afastamento

A peça está adjacente a uma peça inimiga e move-se **para o lado oposto**, na mesma linha.
Captura a peça de que se afastou e todas as inimigas seguidas atrás dela.

Exemplo (Fig. 3): `f4-e4W` — a branca sai de `f4` afastando-se da preta em `g4`, capturando `g4`;
`i4` não cai porque `h4` tem uma branca interrompendo a linha.

### 3.4 As regras que quase todo mundo erra

1. **Captura é obrigatória.** Se existe qualquer captura possível, é proibido jogar paika.
2. **Aproximação e afastamento não acontecem juntos.** Se o mesmo movimento pode capturar dos dois
   jeitos, **o jogador escolhe um** — e só aquele lado cai. Isso acontece já no primeiro lance:
   `d3-e3` pode ser aproximação (captura `f3`) ou afastamento (captura `c3`).
   → **Isso é um requisito de UI**: precisa de um seletor quando o destino é ambíguo.
3. **A captura só vale na extensão da linha do movimento.** Não existe captura "na esquina".
4. **Sequência de capturas** com a mesma peça, com duas restrições:
   - não pode **chegar duas vezes ao mesmo ponto** na sequência;
   - não pode **mover duas vezes seguidas na mesma direção** (ex. `f4-e4W-d4A` é ilegal).
     Pode repetir a direção se houver outra direção no meio. A direção do turno anterior não conta.
5. **Continuar a sequência é opcional** (diferente de damas). O jogador pode parar a qualquer momento
   depois de pelo menos uma captura. → **Requisito de UI**: botão "Encerrar jogada".
6. Uma jogada inteira, mesmo com N capturas encadeadas, conta como **um único turno**.

### 3.5 Fim de jogo

- **Vitória:** um jogador captura **todas** as peças do adversário.
- **Sem movimento legal:** quem não tem jogada perde (convenção do paper; não há documentação
  tradicional). Raro na prática.
- **Empate:** nenhum lado consegue vencer — na prática, repetição de posição.
  (Fanorona é matematicamente um **empate** com jogo perfeito, resolvido em 2007.)
- **Desistência:** exigida pelo enunciado; encerra a partida com vitória do adversário.

### 3.6 Divergência entre as fontes — decisão tomada

O vídeo do professor encerra dizendo *"o vencedor é aquele que capturar mais peças"*, mas
tanto o enunciado quanto o texto do próprio vídeo dizem *"capturar todas as peças do outro jogador,
deixando sem movimentos possíveis"*.

**Decisão:** vitória = adversário com 0 peças **ou** sem movimento legal **ou** desistência.
O placar de peças capturadas fica visível na UI o tempo todo, o que atende à leitura do vídeo
sem inventar uma condição de vitória por pontos.

O vídeo também não menciona a obrigatoriedade de captura. **Decisão:** implementar obrigatória
(regra canônica) e deixar isso explícito na UI — quando houver captura disponível, os destinos
paika aparecem bloqueados com o motivo. Assim a regra é defendida visualmente na apresentação.

## 4. O que a tela precisa ter

Requisitos do enunciado (UI vale 0–10 e **só pontua se a funcionalidade existir**):

| # | Elemento | Por quê |
|---|----------|---------|
| 1 | Tabuleiro 9×5 com diagonais corretas, peças sobre as interseções | É o produto |
| 2 | Indicador de turno + de quem começa | Exigido |
| 3 | Seleção de peça → destaque dos destinos legais | Exigido (movimentação) |
| 4 | Marcação visual distinta: paika / captura por aproximação / por afastamento | Regra 3.4.2 |
| 5 | Seletor quando o destino permite os dois tipos de captura | Regra 3.4.2 |
| 6 | Prévia das peças que vão cair antes de confirmar | Reduz erro, mostra domínio da regra |
| 7 | Modo sequência: peça travada, direções já usadas bloqueadas, botão "Encerrar jogada" | Regra 3.4.4/5 |
| 8 | Placar de capturas (22 → 0) para cada lado | Vídeo do professor |
| 9 | Histórico de lances em notação `b2-c2A` | Facilita a defesa oral |
| 10 | Chat lateral, sempre ativo | Exigido |
| 11 | Botão Desistir com confirmação | Exigido |
| 12 | Tela/banner de fim de partida com o motivo | Exigido ("indicação de vencedor") |
| 13 | Status da conexão (conectado / esperando oponente / caiu) | É um projeto de sockets — mostrar a rede é nota |

## 5. Consequências para a arquitetura

- O **servidor é a autoridade**: gera os movimentos legais, valida, aplica capturas e decide o fim.
  O cliente nunca decide regra — só desenha estado e envia intenção. Isso é o que torna a
  demonstração de duas abas honesta.
- O **estado de uma jogada em sequência é servidor-side**: peça travada, pontos já visitados,
  última direção. Se ficasse no cliente, dava pra trapacear.
- A UI precisa de um estado intermediário "sequência em andamento" que **não** troca o turno.
- O chat é canal independente na mesma conexão — precisa continuar funcionando no turno do outro.

## 6. Próximo passo

Fechar o **protocolo de mensagens** (WebSocket) a partir desta lista de telas, e só então codar.
