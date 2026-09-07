# ADR-007 — Executável via Node SEA

**Data:** 03/09/2026 · **Status:** ⛔ **Substituída** pela
[ADR-012](012-entrega-sem-binario.md) em 06/09/2026

> Esta decisão foi revertida. O texto abaixo fica **inalterado**, como registro do que se
> pensava em 03/09 e por quê — um ADR substituído não é apagado nem editado, senão o histórico
> de decisões vira só a lista das que deram certo.
>
> O que mudou: a premissa da §Contexto — *"alegar que Node não permite seria factualmente
> errado diante de um professor que pode saber disso"* — estava tratando o professor como
> alguém a ser convencido de que a cláusula de escape se aplica. Ele sabe que Node roda como
> servidor. A [ADR-012](012-entrega-sem-binario.md) tem o raciocínio completo.

## Contexto

O enunciado exige, entre os entregáveis:

> *"Deverá ser entregue, **se a linguagem de programação permitir**, um código executável
> (.jar, .exe, etc.)"*

A cláusula condicional é uma saída legítima para linguagens interpretadas, mas usá-la é uma
escolha: Node **permite**. Alegar que não permite seria factualmente errado diante de um
professor que pode saber disso.

Isso não é item de nota — é condição de entrega. O risco não é perder pontos, é ter um item do
enunciado marcado como não cumprido.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Não entregar executável, invocando *"se a linguagem permitir"* | Defensável na letra, fraco na prática: Node permite desde a v20 |
| `.zip` com `node_modules` + script `start.sh` | Cumpre o espírito ("roda sem instalar dependências"), mas não é um executável |
| `pkg` (Vercel) | Foi o padrão do ecossistema por anos, hoje **descontinuado**. Não introduzir dependência morta em projeto novo |
| `nexe` | Vivo, mas menos mantido, e compila Node do zero em alguns cenários |
| **Node SEA (Single Executable Applications)** | Recurso **oficial** do Node 20+, sem dependência de terceiros |

## Decisão

Empacotar com **Node SEA**, produzindo um binário único para a plataforma de entrega.
O pipeline reaproveita o que já existe: [`scripts/build-server.mjs`](../../scripts/build-server.mjs)
já usa `esbuild` para gerar `dist/server/index.js` em bundle.

Etapas: bundle (esbuild, já existe) → blob SEA (`node --experimental-sea-config`) → injeção no
binário do Node → assinatura, quando a plataforma exigir.

Antes de implementar, **puxar a documentação atual do Node** — o recurso ainda evolui entre
versões menores, e a regra do projeto é não escrever configuração de ferramenta de memória.

## Justificativa

Ser recurso oficial da plataforma é o argumento decisivo: nada de dependência extra, nada de
projeto de terceiros que pode morrer, e a explicação na apresentação é curta e verdadeira —
*"é o empacotador do próprio Node"*.

O bundle já existir muda o custo: o trabalho não é "empacotar o projeto", é "empacotar um
arquivo que o build já produz". A parte não trivial é o cliente — os assets do React/Vite
precisam viajar junto, e é aí que mora a pegadinha (o servidor hoje lê `dist/client/` do
disco).

## Consequências

- ✅ Cumpre o entregável do enunciado sem invocar a cláusula de escape
- ✅ Zero dependência nova: é o Node empacotando a si mesmo
- ✅ O binário roda em máquina sem Node instalado — o que reforça a demonstração de
  [implantação em máquinas diferentes](008-implantacao-multi-maquina.md)
- ⚠️ Binário é **por plataforma**: o gerado no macOS ARM do autor não roda no Windows do
  avaliador. Entregar junto o código-fonte e as instruções, que é o que o enunciado pede de
  qualquer forma
- ⚠️ Os assets do cliente precisam ser embutidos ou distribuídos ao lado do binário — decidir
  na implementação, é a parte com risco real
- ⚠️ macOS pode exigir passo de assinatura para executar sem aviso de segurança
- ⚠️ Plano B registrado: `.zip` com `node_modules` + script de start documentado
