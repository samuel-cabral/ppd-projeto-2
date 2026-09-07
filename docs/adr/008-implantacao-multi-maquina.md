# ADR-008 — Implantação em máquinas diferentes como capacidade de primeira classe

**Data:** 03/09/2026 · **Status:** Aceita

## Contexto

A primeira frase do enunciado define o objetivo:

> *"Implementar o jogo Fanorona utilizando Sockets para comunicação entre os tabuleiros que
> podem estar em **máquinas diferentes**."*

"Máquinas diferentes" não é um detalhe de implantação — é o objetivo declarado do trabalho.
Um jogo de sockets que só foi visto rodando em duas abas do mesmo computador cumpre o
requisito tecnicamente (são dois clientes, dois sockets) mas não o **demonstra**.

Estado antes desta decisão: o servidor sobe em `localhost:3000`, e o README menciona
`npx ngrok http 3000` de passagem, como recurso avulso. O convite que o lobby copia para a área
de transferência é `http://localhost:3000/#/m/<id>` — um link que, colado em outra máquina,
**não funciona**.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Manter só `localhost` + `ngrok` avulso | Depende de rede externa e de um serviço de terceiros no dia da apresentação |
| Hospedar em nuvem (Render, Fly, Railway) | Demonstra bem, mas acrescenta plataforma, conta e ponto de falha; e o enunciado não pede internet, pede máquinas diferentes |
| **Anunciar os IPs de LAN no boot + convite com o endereço correto** | Zero dependência externa; funciona na rede da sala; `ngrok` continua como plano B |

## Decisão

1. O servidor, ao subir, **enumera as interfaces de rede** (`node:os` → `networkInterfaces()`)
   e imprime todos os endereços em que está acessível, não apenas `localhost`:

   ```
   Fanorona ouvindo em:
     http://localhost:3000
     http://192.168.0.14:3000   ← use este para outra máquina na mesma rede
   ```

2. O botão **Copiar link do convite** passa a copiar a URL baseada no `location.host` que o
   segundo jogador realmente consegue abrir — o que já acontece naturalmente quando o primeiro
   jogador acessa pelo IP da LAN, e é o motivo de o passo 1 importar.

3. `ngrok` permanece documentado como **plano B** para o caso de a rede da sala isolar clientes
   entre si (comum em Wi-Fi institucional com *client isolation*).

## Justificativa

O servidor já escuta em todas as interfaces — `http.listen(PORT)` sem host faz isso por padrão.
Ou seja, **a capacidade já existe**; o que falta é o usuário saber o endereço. O trabalho é de
descoberta e comunicação, não de rede.

Isso muda a demonstração de "duas abas no meu notebook" para "seu notebook contra o meu, pela
rede da sala" — que é literalmente a frase do objetivo do enunciado, executada na frente do
avaliador. Custo: uma função de ~10 linhas.

A escolha de LAN em vez de nuvem é deliberada: menos partes móveis no dia, e nenhuma
dependência de internet ou de conta em serviço externo. O enunciado pede máquinas diferentes,
não internet.

## Consequências

- ✅ O objetivo literal do enunciado passa a ser demonstrável sem serviço externo
- ✅ Nenhuma mudança de arquitetura: o servidor já escutava em todas as interfaces
- ✅ Combina com o [executável](007-executavel-via-node-sea.md): binário numa máquina,
  navegador na outra, nada instalado do outro lado
- ⚠️ Rede com *client isolation* (Wi-Fi de instituição) pode bloquear o tráfego entre as duas
  máquinas — daí `ngrok` continuar documentado, e o plano C ser roteador/hotspot próprio
- ⚠️ Firewall do macOS pede autorização na primeira conexão externa: precisa ser aceito **antes**
  da apresentação, não durante
- ⚠️ O servidor passa a anunciar IPs internos no log — irrelevante nesta escala, mas é
  informação que antes não saía do processo
