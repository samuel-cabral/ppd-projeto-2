# ADR-001 — WebSocket em vez de socket TCP cru

**Data:** 19/08/2026 · **Status:** Aceita

## Contexto

O enunciado pede um jogo em rede sobre sockets. A implementação mais direta seria
`net.Socket` (TCP cru) com um cliente de terminal.

Duas restrições, porém, vêm da forma de avaliação:

1. A interface vale 0 a 10 pontos. Um cliente de terminal limita muito esse teto.
2. A apresentação é remota. O ideal é enviar um link e o professor jogar sem instalar nada.

**Navegadores não abrem sockets TCP crus.** Por segurança, a única conexão persistente
disponível em JavaScript de página é WebSocket.

## Alternativas

| Alternativa | Avaliação |
|---|---|
| TCP cru + cliente de terminal | Aderência máxima ao enunciado, mas nota de interface baixa e nada de link |
| TCP cru + cliente desktop (Java/Electron) | Interface possível, mas exige instalação do outro lado e sai da stack dominada |
| TCP cru no jogo + ponte WebSocket para o navegador | Junta as vantagens, mas duplica o protocolo e o ponto de falha sem ganho real |
| **WebSocket** | Roda no navegador, aceita link, e continua sendo socket TCP |

## Decisão

**WebSocket**, via biblioteca `ws`, com o mesmo processo Node servindo a interface por HTTP.

## Justificativa

WebSocket **é** um socket TCP persistente e full-duplex. O que ele acrescenta ao TCP puro é:

1. um *handshake* inicial em HTTP (`Upgrade: websocket`), que existe para atravessar
   proxies e firewalls;
2. um enquadramento padronizado (RFC 6455), que resolve o problema que qualquer protocolo
   sobre TCP precisa resolver de qualquer forma — TCP entrega um fluxo de bytes, não
   mensagens, então delimitar mensagem é obrigação da aplicação.

Escrever o próprio enquadramento sobre `net.Socket` seria reimplementar, pior, o que a
RFC 6455 já padroniza. Depois do handshake, a conexão é exatamente um socket TCP aberto
nos dois sentidos.

## Consequências

- ✅ O professor joga por um link, sem instalar nada
- ✅ Interface completa, com o teto de nota que ela permite
- ✅ Ping/pong de detecção de queda vem pronto no protocolo
- ⚠️ Há um handshake HTTP antes do socket — precisa ser explicado, não escondido
- ⚠️ Depende da biblioteca `ws` para o enquadramento
