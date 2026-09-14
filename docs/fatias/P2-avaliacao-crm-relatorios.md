# P2 — Avaliação, CRM e relatórios de gestão

**Objetivo:** fechar o ciclo — o que aconteceu no turno vira informação para o próximo.
**Depende de:** P1
**Spec:** §4.4 ("avaliação e relacionamento"), §5.2 (etapa 10), §3.3, §8 (Fase 4)

## Entregáveis

**Avaliação**
- Solicitada logo após o pagamento, separada por comida, serviço e ambiente; pode citar o nome
  do atendente (spec §4.4)
- Moderação pelo gerente antes de publicar

**CRM**
- Preferências, ocasiões (aniversário) e histórico de visitas disponíveis no próximo
  atendimento (spec §4.4)

**Relatórios por modelo** (spec §8, Fase 4)
- Fine: custo e margem, aprovações, financeiro consolidado
- Casual: giro de mesas, gorjetas por equipe, promoções e campanhas
- Quick: throughput por estação, desperdício, SLA por etapa

**Administração**
- UI da configuração de estabelecimento (adiada de F3)
- Tela de auditoria sobre `audit_log` (adiada de F2)

## Critérios de aceite

1. A avaliação é solicitada após o pagamento e alimenta o CRM do cliente.
2. Uma avaliação que cita atendente chega ao relatório de gorjetas e desempenho da equipe.
3. Os relatórios usam os mesmos dados do operacional — não existe pipeline paralelo que possa
   divergir.
4. A tela de auditoria mostra autor, motivo e horário de toda ação sensível dos últimos 90 dias.

## Fora de escopo

Marketplaces e integrações externas de delivery.
