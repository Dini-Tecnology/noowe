# ADR-005 — Momento do crédito de fidelidade

**Status:** ACEITO (2026-09-14) — default mantido; escolha delegada pelo responsável do produto à recomendação técnica do plano de aderência
**Origem:** spec §8.1, quinta decisão em aberto ("unificar se pontos são creditados no
pagamento ou na conclusão do serviço")
**Impacta:** Fatia P1 (fidelidade), Fatia G3 (split)

## Questão

Numa conta dividida entre 4 pessoas, quem ganha os pontos e quando?

## Decisão proposta

**Crédito por parcela paga, no evento `payment.completed`, proporcional ao valor que aquele
participante efetivamente pagou.** Não no fechamento da sessão.

- Base de cálculo: valor da parcela **sem** taxa de serviço e **sem** gorjeta. Fidelidade
  premia consumo, não remuneração de equipe.
- Participante sem conta (visitante por link) não acumula; os pontos daquela parcela não são
  gerados nem redistribuídos.
- Em Quick Service, o selo é creditado uma única vez por pedido concluído (spec §5.6), no
  evento de **retirada**, não no pagamento — o pagamento acontece antes do serviço existir.

## Por quê

Creditar no fechamento da sessão não sabe a quem creditar: a sessão tem N participantes com
valores diferentes, e o "titular" pagou apenas a parte dele. Pior, o convidado que paga sua
parte e vai embora antes do fim da mesa ficaria sem pontos por um evento que não depende dele.

A assimetria de Quick Service é intencional e vem da própria spec: lá o pagamento é antecipado,
e creditar o selo no pagamento premiaria um pedido que pode nunca ser retirado (spec §5.5).

## Consequências

- `loyalty_transactions` referencia `bill_share_id` (sala) ou `order_id` (quick), nunca a sessão.
- Estorno de parcela precisa estornar os pontos correspondentes na mesma transação.
- Um mesmo `bill_share` não pode gerar dois créditos: chave única em `loyalty_transactions`.
