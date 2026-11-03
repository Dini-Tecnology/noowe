# ADR-031 — Modelo comercial: parâmetros NOOWE, taxa única e assinatura

**Status:** ACEITO no formato (2026-11-03); **valores provisórios**, em negociação com o Asaas.
**Origem:** [`aditivo-comercial-e-pagamentos`](../spec/aditivo-comercial-e-pagamentos.md), itens 5–8, B–E, G e H.
**Ajusta:** ADR-020 (`platform_fee_bps` deixa de ser uma comissão única).
**Impacta:** fatias M1–M6, N4, Q1, O9; `payments-create`; capabilities.
**Regras isoladas em função nomeada (a criar):** `private.noowe_pay_rate_bps`, `private.noowe_pay_split_cents`, `private.convenience_fee_cents`, `private.plan_allows`, `private.noowe_pay_index`, `private.credit_tier_for`.

## Decisão

1. **Parâmetros comerciais ficam em tabelas no schema `private`**, alteradas direto pela equipe NOOWE, sem tela. Isso
   é diferente de `restaurant_model_configs`: lá o restaurante configura a própria operação; aqui o valor é da NOOWE e
   fica fora do alcance do restaurante. Toda alteração grava autor e horário, e o valor aplicado fica congelado na
   transação, para mudar a tabela nunca reescrever o passado.
2. **Taxa única por meio de pagamento**, com padrão geral e valor específico por restaurante. Fica em basis points
   (`bigint`/`integer`), nunca em float. A linha do vale tem `CHECK` no teto do parâmetro legal.
3. **Split por valor fixo em cada cobrança:** `split = max(0, taxa × valor pago − tarifa do Asaas)`. O restaurante vê
   só valor pago, taxa e líquido. Gateway e margem ficam em consultas internas, fora de RLS de qualquer perfil.
4. **Diferença negativa** (tarifa acima da taxa) vira lançamento em um razão próprio de compensação. **Não** se mistura
   com os Créditos NOOWE Pay, que têm limite de 30%, liberação e validade (pendência 22).
5. **Taxa de conveniência** é linha própria em `orders`, fora da base de taxa, gorjeta, cupom e fidelidade, e vai
   100% no split. Vale por capability do fluxo, nunca por nome de modelo.
6. **Recursos por plano** entram como mais uma camada ao derivar capabilities (`private.plan_allows`). O código segue
   lendo capability; ninguém testa nome de plano.
7. **Assinatura e créditos** usam o mesmo princípio de razão: fatura, crédito gerado, usado e expirado são linhas
   imutáveis, em centavos.

## O que o código de hoje muda

- `private.payment_platform_config` (branch `claude/angry-bardeen-0c0c36`, ainda fora da `main`) guarda um percentual
  único e `restaurant_payment_accounts.platform_fee_bps` copia esse valor. Precisa virar a tabela por meio de pagamento
  **antes** de cadastrar a primeira subconta em produção.
- `bill_shares` e `payments-create` calculam `platform_fee_cents` por percentual sobre o valor. Passam a descontar a
  tarifa do Asaas.

## Spike obrigatório antes de M2 (sandbox e contrato)

Item 2 do spike do ADR-020 confirmou: a tarifa sai da subconta, a NOOWE recebe o `fixedValue` inteiro e um `fixedValue`
acima do líquido é recusado na criação. Falta confirmar:

1. **Como saber a tarifa antes de cobrar**, já que o split vai na criação: tabela de tarifas contratadas nos parâmetros,
   ou criar e reler `netValue`, atualizando o split?
2. **Crédito × débito na página hospedada:** o meio final só é conhecido depois do pagamento, e as taxas diferem
   (3,49% × 1,49%). O split decidido na criação pode ficar errado.
3. **Estorno:** o split volta? A tarifa do Asaas é devolvida? Quem arca (pendência 21).
4. O Asaas aceita vale-refeição online? Assinatura recorrente na conta raiz da NOOWE?

## Consequências

- Com a tarifa pública de Pix (R$ 0,99 fixos, observados no sandbox) e taxa de 0,99%, **todo Pix abaixo de R$ 100 fica
  negativo para a NOOWE** e gera compensação. Isso é a maioria das parcelas de uma conta dividida, então a tarifa
  negociada decide o modelo.
- Documento `docs/PARAMETROS-NOOWE.md` ("Como ajustar os parâmetros") é entregável de M1.
