# ADR-012 — Entrega sem binário: script de start documentado

**Data:** 06/09/2026 · **Status:** Aceita ·
**Substitui:** [ADR-007 — Executável via Node SEA](007-executavel-via-node-sea.md)

## Contexto

O enunciado pede, entre os entregáveis:

> *"Deverá ser entregue, **se a linguagem de programação permitir**, um código executável
> (.jar, .exe, etc.)"*

A [ADR-007](007-executavel-via-node-sea.md) decidiu, em 03/09, empacotar com Node SEA. O
raciocínio de lá era: Node permite, logo invocar a cláusula de escape seria factualmente errado
diante de um professor que pode saber disso.

Três dias depois, com a entrega em 09/09 e a Fase 5 ainda aberta, essa premissa foi reexaminada
e não se sustenta.

**A cláusula não pergunta se é tecnicamente possível — pergunta se a linguagem *permite*, no
sentido de ser o modo natural de entregar aquele programa.** Os exemplos que o próprio enunciado
dá são `.jar` e `.exe`: Java e C#, onde o artefato compilado **é** a forma normal de distribuir.
Node não funciona assim. A forma normal de entregar um servidor Node é o código-fonte mais
`npm install && npm start`, e é assim que todo projeto Node do mundo é entregue.

Há ainda três fatos concretos que a ADR-007 já registrava nas próprias consequências, e que
pesam mais agora:

1. **O binário é por plataforma.** O gerado no macOS ARM do autor não roda no Windows do
   avaliador. Entregar um binário que ele não consegue executar é pior que não entregar.
2. **Os assets do cliente são a parte não trivial.** O servidor lê `dist/client/` do disco;
   embutir o build do React no binário é justamente onde mora o risco, e a ADR-007 admitia isso.
3. **macOS pode exigir assinatura** para executar sem aviso de segurança.

Somando: o item custa horas, tem risco de empacotamento não previsto, produz um artefato que o
avaliador provavelmente não consegue rodar, e compete por tempo com a Fase 5, que é o que carrega
os 10 pontos de *Explicação do Código*.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Manter Node SEA ([ADR-007](007-executavel-via-node-sea.md)) | Cumpre a letra, mas produz binário de plataforma única, consome as horas da Fase 5 e tem risco de empacotamento com os assets do cliente |
| `.zip` com `node_modules` embutido | Evita o `npm install` do outro lado, mas gera um arquivo de dezenas de MB, e continua não sendo um "executável" |
| **Código-fonte + `npm start` documentado, com a ausência justificada por escrito** | Escolhida |

## Decisão

**Não produzir binário.** A entrega é o repositório GitHub com:

- todo o código-fonte, como o enunciado exige em item separado;
- `README.md` com o caminho de execução conferido em máquina limpa:
  `npm install && npm run build && npm start`;
- esta ADR, que registra a ausência como decisão e não como esquecimento.

A verificação de que o caminho funciona é parte da entrega, não do discurso: `git clone` limpo em
diretório temporário, instalar, buildar, subir e jogar uma partida completa antes de mandar o
e-mail.

## Justificativa

A diferença entre um item faltando e um item decidido é um parágrafo escrito. Se o avaliador
perguntar pelo executável, a resposta não é *"não deu tempo"* — é a cláusula do próprio enunciado
mais o argumento de que, em Node, `npm start` **é** a forma de entregar um servidor, mais o fato
de que um binário de plataforma única seria menos útil para ele do que o código que roda em
qualquer lugar que tenha Node.

Este é também o motivo de a ADR-007 ter sido **substituída e não editada**. Apagar a decisão
anterior esconderia que houve uma reavaliação; mantê-la mostra o critério mudando com o contexto,
que é o que um registro de decisões existe para preservar.

O tempo liberado vai para a Fase 5 — bot, seletor de thread e `/api/stats` —, que move o critério
de *Explicação do Código*. O executável não movia critério nenhum: não há item de nota para ele.

## Consequências

- ✅ Libera as ~2 horas da Fase 6 que iriam para empacotamento, e elimina o risco de uma
  pegadinha de SEA descoberta na véspera
- ✅ O avaliador recebe algo que roda na máquina dele, em vez de um binário ARM de macOS
- ✅ A ausência fica justificada por escrito, com a cláusula do enunciado citada
- ⚠️ **É uma interpretação da cláusula, e o professor pode discordar.** Se ele considerar o
  executável obrigatório, o plano B da ADR-007 continua válido e custa poucas horas — o bundle
  que o SEA consome já é produzido por `scripts/build-server.mjs`
- ⚠️ O caminho `npm install && npm run build && npm start` passa a ser entregável crítico:
  precisa ser testado em clone limpo, não assumido
