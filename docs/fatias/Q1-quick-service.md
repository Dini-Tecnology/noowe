# Q1 — Quick Service completo

**Objetivo:** jornada curta e transacional — pedir antes, pagar antes, retirar por código.
**Depende de:** N4
**Spec:** capítulo 5 inteiro, §6 (comparativo)
**ADRs:** 003 (QR de balcão), 005 (selo na retirada), 013 (jornada de pedido antecipado, provisório)

> Esta fatia **não depende do motor de grupo**. Pode ser desenvolvida em paralelo a G1–G3 por
> outra pessoa, e é o caminho mais curto até uma unidade em produção.

## Entregáveis

**Banco**
- `pickup_codes` / `orders.pickup_code`, único por estabelecimento por dia
- `pickup_slots` com `capacity_per_slot`
- `combo_definitions` e regra de desconto (basis points, config)

**Servidor**
- Combo builder: wizard de três etapas (principal, acompanhamento, bebida) com desconto
  automático sobre a soma dos avulsos
- Cupons e pontos aplicados **sobre o subtotal, antes das taxas** (spec §5.4)
- Capacidade por janela: ao lotar, o app oferece o próximo horário **em vez de aceitar o
  pedido** (spec §5.4)
- Máquina de preparo de 4 etapas: `Recebido → Preparando → Conferência → Pronto`. A conferência
  é obrigatória e é o ponto de controle de erro de montagem.
- Tempo total do ciclo (pagamento → retirada) registrado por pedido

**Jornada do cliente (ADR-013)**
- Tela do restaurante: **Fazer pedido**, **Agendar retirada**, **Meus pedidos / Pedir novamente**,
  por capability `orderAhead` / `pickupSlots`, com status, tempo de preparo e local de retirada
- Carrinho com nome para chamada, comer aqui ou levar, retirar agora ou agendar
- Checkout com política de não retirada aceita, Pix com expiração e aviso de distância
- Aceite automático ou manual (timeout cancela com estorno), pausa de pedidos, encerramento X min
  antes do fechamento, pedido duplicado bloqueado
- Etapas para o cliente: Pago → Aceito → Em preparo → Pronto → Retirado; terminais Não retirado e
  Cancelado. A conferência segue obrigatória no KDS
- Tolerância 15–60 min (default 30) contada a partir de "pronto"; `order_status_events` registra cada
  mudança de status
- Personalização do item: grupos obrigatórios e opcionais com extra pago, remover ingredientes,
  "Adicione também" e personalização dentro das etapas do combo; o servidor valida e precifica
  (ADR-013 §2.9)

**App**
- Skip the Line com fila atual visível, combo builder, personalização, carrinho, pagamento
  rápido, acompanhamento em 4 etapas, código de retirada, cartão de selos

**Painel / KDS**
- Estação de preparo, tela de conferência, tela de retirada por código

## Critérios de aceite

1. **Nenhum pedido entra na produção sem pagamento confirmado** (spec §5.6).
2. O tempo estimado mostrado antes do pagamento é coerente com a fila real da cozinha
   (spec §5.6).
3. As quatro etapas refletem **eventos reais do KDS**, não temporizadores fixos (spec §5.6).
4. O código de retirada é único por pedido e por dia; a baixa só ocorre com leitura ou
   confirmação do código (spec §5.6).
5. O desconto do combo é aplicado e **demonstrado explicitamente** no carrinho (spec §5.6).
6. O selo é creditado uma única vez por pedido concluído (spec §5.6), na retirada (ADR-005).
7. Cliente não retira: após o tempo limite, pedido marcado como não retirado, com política de
   descarte e reembolso da unidade (spec §5.5).
8. Item indisponível após o pagamento oferece substituição ou estorno parcial imediato, com
   aprovação registrada (spec §5.5).
9. Erro na conferência devolve **o item** à estação, sem reiniciar o pedido inteiro (spec §5.5).
10. Estouro de SLA no pico atualiza a estimativa e comunica o atraso **proativamente** (spec §5.5).
11. A retirada só conclui com o código do cliente (QR lido ou digitado); o painel nunca reenvia o
    código armazenado (ADR-013 §2.7).
12. Aceite manual sem resposta no prazo cancela o pedido e estorna o valor integral, com `audit_log`
    de ator `system` (ADR-013 §2.4).
13. Cancelamento pelo restaurante exige motivo e estorna integralmente; o cliente só cancela até o
    início do preparo (ADR-013 §2.5).
14. Pedido igual e ainda ativo no mesmo restaurante é recusado e devolve o pedido existente
    (ADR-013 §2.6).
15. A tela do restaurante Quick Service mostra "Fazer pedido" por capability, nunca por
    `service_model`.
16. Item com grupo obrigatório não entra no pedido sem a escolha, e o valor dos extras é calculado
    pelo servidor; o preço enviado pelo app é ignorado (ADR-013 §2.9).

## Fora de escopo

Reserva, fila de mesa, check-in, sessão de grupo, split, chamados — nada disso existe aqui
(spec §5.1).
