# ADR-005 — Chat na thread principal, fora do worker

**Data:** 19/08/2026 · **Status:** Aceita

## Contexto

O enunciado exige chat funcionando durante toda a partida. Como cada partida tem uma
`worker_thread` própria ([ADR-002](002-worker-thread-por-partida.md)), a pergunta natural
é se as mensagens de chat devem passar por ela.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| Chat pelo worker | Coloca o chat atrás de qualquer processamento pesado da partida — exatamente o problema que as threads existem para evitar |
| **Chat na thread principal** | Retransmissão direta entre os dois sockets, sem tocar no estado do jogo |

## Decisão

O chat é retransmitido pela **thread principal**. Nenhuma mensagem de chat cruza a
fronteira de thread; o protocolo interno
([`04-protocolo.md` §3](../04-protocolo.md)) não tem mensagem de chat.

## Justificativa

O chat não é parte do estado do jogo. Não altera tabuleiro, não altera turno, não é
validado contra regra nenhuma. Fazê-lo atravessar o worker acrescentaria duas travessias
de fronteira e o colocaria em fila atrás do trabalho pesado da partida — o oposto do
objetivo.

Mantê-lo na thread principal é também o que torna a demonstração de
[`03-concorrencia.md` §4](../03-concorrencia.md) honesta e legível: o chat é o canal que
**deveria** estar sempre disponível, e é por isso que o seu congelamento é a evidência
visível de que o event loop foi bloqueado.

## Consequências

- ✅ Chat com a menor latência possível, independente do que a partida esteja fazendo
- ✅ Continua funcionando com o oponente desconectado e após o fim da partida
- ✅ O canal serve como indicador visível de bloqueio do event loop
- ⚠️ O histórico do chat vive no registro da partida na thread principal, não no worker —
  se o worker for reiniciado, o chat sobrevive; é o comportamento desejado
