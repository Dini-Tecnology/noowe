# ADR-031 — Modelo comercial: parâmetros NOOWE, taxa única e assinatura

**Status:** ACEITO no formato (2026-11-03); **valores provisórios**, em negociação com o Asaas. Pendências 21–26 e 28 respondidas.
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

- `private.payment_platform_config` guarda um percentual único e `restaurant_payment_accounts.platform_fee_bps` copia
  esse valor. A M1 criou `private.noowe_pay_rates`, mas a troca no fluxo de cobrança é da M2. Até lá a tabela antiga fica
  vazia e **não deve ser preenchida**: vazia, ela recusa o cadastro de subconta, e uma comissão única cobraria errado por
  meio de pagamento.
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

### Confirmado no sandbox em 04/11/2026

1. **A tarifa vem na própria cobrança.** `netValue` já volta no `POST /payments`, antes de pagar, e `PUT /payments/{id}` aceita definir, trocar ou remover o split em
   cobrança pendente, de Pix e de cartão. Por isso a cobrança nasce sem split, a tarifa é `value − netValue`, e o split é definido antes de o cliente receber o QR
   ou a página. A tabela de tarifas não é necessária. `fixedValue` acima do líquido é recusado também no `PUT`.
2. **Crédito × débito não é problema no nosso fluxo.** Criamos a cobrança já com `PIX` ou `CREDIT_CARD`, e a página não troca o meio. `DEBIT_CARD` é recusado na criação.
   `UNDEFINED` existe, mas não o usamos: o meio final só seria conhecido depois.
3. **Estorno total cancela o split** (`cancellationReason: PAYMENT_REFUNDED`) e fica `REFUNDED` na hora. Observado em cartão, com o split ainda aguardando crédito. **Pix não foi
   observado**: o sandbox pede chave Pix na subconta. Conferir no primeiro estorno real. Devolução da tarifa não foi observável: o saldo da subconta segue zero no sandbox.
4. **Estorno parcial de cartão no mesmo dia é recusado:** "só pode ser estornada parcialmente no próximo dia". A fila espera o dia seguinte, sem gastar tentativa.
5. **Mínimo de R$ 5,00** por cobrança, em Pix e cartão (`noowe_billing_settings.min_online_charge_cents`). Parcela menor é recusada antes de chegar ao Asaas.
6. **Vale online não existe** na API: nenhum `billingType` aceita. V1 fica em maquininha da casa e, depois, Tap.
7. **Assinatura na conta raiz funciona:** `POST /subscriptions` com Pix mensal, troca de valor e cancelamento.
8. As tarifas do sandbox variam por conta (a subconta nova vem com desconto: 1,99% + R$ 0,49 no crédito, R$ 0,99 no Pix). Ler o líquido de cada cobrança evita depender delas.

## Consequências

- Com a tarifa pública de Pix (R$ 0,99 fixos, observados no sandbox) e taxa de 0,99%, **todo Pix abaixo de R$ 100 fica
  negativo para a NOOWE** e gera compensação. Isso é a maioria das parcelas de uma conta dividida, então a tarifa
  negociada decide o modelo.
- Documento `docs/PARAMETROS-NOOWE.md` ("Como ajustar os parâmetros") é entregável de M1.

## Respostas às pendências 21–26 e 28

- **Estorno (21):** total no mesmo dia operacional devolve a taxa NOOWE Pay, e a NOOWE assume a tarifa do Asaas. Depois do
  dia ou parcial, a taxa não volta. Contestação não devolve a taxa, e a tarifa de contestação fica com o restaurante. O
  extrato do Dono mostra o estorno e o destino da taxa. Isolar em `private.refund_fee_policy`.
- **Compensação (22):** confirma o item 4. Linha "Ajuste de taxa NOOWE Pay" na fatura, sem limite nem validade, abate a
  mensalidade inteira, e o que sobrar segue para as próximas.
- **Planos (23, 24):** Business com 8.000 pedidos e NFC-e na mesma franquia. Enterprise "Sob consulta", com preço de contrato
  nos parâmetros do restaurante. `tap_to_pay` fica desligado até ativar o fornecedor.
- **Pedido (25):** cada envio à cozinha ou ao bar. Espera da fila e Quick contam 1 cada; cancelado não conta.
- **Adesão (26):** um fluxo só. Quem já está ativo escolhe o plano no próximo acesso do Dono. A sugestão por tipo de serviço
  vem de parâmetro, sem ramificar por modelo no código. Sem código, teste de 30 dias sem cartão. O código de fundador
  dispensa o teste, combina isenção com percentual e marca a categoria "Parceiro Fundador" no restaurante.
- **Empresa NOOWE (28):** dados em parâmetro, trocáveis sem nova versão. Fatura pela conta Asaas da NOOWE, com NFS-e
  automática. Conveniência em R$ 0 e desligada até o contador confirmar; a mecânica do split fica pronta.
- **Credenciais do Tap (pendência 37):** o fornecedor ativo fica na tabela, e as credenciais em segredo. Segredo em tabela
  iria parar no histórico de parâmetros (`noowe_param_history`) e nas cópias do banco.

## Spike de 04/11, no sandbox do Asaas

- **Cartão salvo:** cobrança criada sem token, split definido e depois `POST /payments/{id}/payWithCreditCard`. A cobrança sai com o split desde o início. É o caminho adotado: cobrar antes e definir o split depois só funcionou por tolerância do provedor.
- **Estornos da cobrança:** `GET /payments/{id}` traz `refunds`, com `status` e `value`. É o que permite repetir um estorno sem devolver duas vezes.
- **`PAYMENT_REFUND_DENIED`:** aceito no cadastro do webhook. O disparo em si não foi observado.
