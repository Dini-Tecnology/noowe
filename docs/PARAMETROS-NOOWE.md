# Como ajustar os parâmetros NOOWE

Taxas, planos, créditos e prazos ficam em tabelas no schema `private` do Supabase. Mudar um valor não exige nova
versão do app. Só a equipe NOOWE altera, direto no banco: o app não lê nem escreve nessas tabelas (ADR-031).

**Os valores atuais são provisórios.** As taxas estão em negociação com o Asaas.

## Como alterar

Rode no SQL Editor do Supabase, sempre com o seu nome como autor. Sem autor, o banco recusa a alteração.

```sql
begin;
select set_config('noowe.param_author', 'Seu nome', true);
update private.noowe_pay_rates set rate_bps = 299
  where payment_method = 'credit_card' and restaurant_id is null;
commit;
```

Para conferir quem mudou o quê:

```sql
select changed_at, author, table_name, action, "before", "after"
from private.noowe_param_history order by changed_at desc limit 20;
```

O histórico não pode ser apagado nem editado.

Cobrança, fatura e crédito já gerados não mudam: o novo valor só vale para o que nascer depois.

## Unidades

- **Percentual em basis points (bps):** 1% = 100 bps. Portanto 3,49% = `349`.
- **Dinheiro em centavos:** R$ 0,99 = `99`.

## Taxa NOOWE Pay

Tabela `noowe_pay_rates`. Campos: `payment_method`, `restaurant_id`, `rate_bps`, `note`.

| Meio (`payment_method`) | Valor atual | Observação |
|---|---|---|
| `credit_card` | 349 (3,49%) | |
| `debit_card` | 149 (1,49%) | |
| `pix` | 99 (0,99%) | |
| `voucher` | sem linha | A spec não define o valor. Teto de 360 (3,6%) em `noowe_pay_methods.max_rate_bps` |
| `tap_card` | sem linha | Taxa do fornecedor do Tap, ainda sem contrato. **Sem esta linha, ligar o fornecedor não mostra o botão** |
| `cash`, `house_terminal` | não têm taxa | O banco recusa linha para eles |

**Linha sem `restaurant_id` é o padrão.** Linha com `restaurant_id` vale só para aquele restaurante e prevalece:

```sql
insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps, note)
values ('pix', '<id do restaurante>', 79, 'Negociação de 03/11');
```

Meio sem taxa definida não tem cobrança: o sistema trata como indisponível, nunca como zero.

## Mínimo por cobrança

`noowe_billing_settings.min_online_charge_cents`: hoje 500, o mínimo do Asaas para cartão. `min_pix_charge_cents`: hoje 500, o mínimo do Asaas
para Pix. Abaixo do mínimo de um meio, ele some da tela de pagamento; abaixo dos dois, o cliente paga no salão (pendência 79).

## Gorjeta

`noowe_billing_settings.tip_confirm_above_bps`: hoje 3000. Gorjeta acima de 30% do consumo pede confirmação ("Confirma gorjeta de R$ X?"),
no app do cliente e na cobrança da equipe. O teto continua 100% do valor (pendência 55).

## Taxa de conveniência

Tabela `noowe_convenience_fees`. Campos: `flow`, `restaurant_id`, `fee_cents`, `enabled`, `note`.

| Fluxo (`flow`) | Valor atual |
|---|---|
| `pickup` (retirada sem fila) | 0 (R$ 0), desligada (`enabled = false`) |
| `scheduled` (pedido agendado) | 0 (R$ 0), desligada (`enabled = false`) |

**Desligada até a nota tipo 3 estar configurada** (pendência 38: uma NFS-e por pedido para o cliente final). Para ligar, troque
`fee_cents` para 99 e `enabled`. Fluxo fora da tabela não cobra. O padrão e o valor por restaurante seguem a mesma regra da taxa NOOWE Pay.

## Planos

Tabela `noowe_plans`. O preço anual é `monthly_price_cents × annual_months_charged`.

| `code` | `monthly_price_cents` | `annual_months_charged` | `order_allowance` | `overage_order_cents` |
|---|---|---|---|---|
| `essencial` | 19900 | 10 | 1000 | 15 |
| `profissional` | 34900 | 10 | 3000 | 15 |
| `business` | 64900 | 10 | sem número (pendência 24) | 15 |
| `enterprise` | por contrato | | | |

Recursos ficam em `noowe_plan_features` (`plan_code`, `feature_key`, `enabled`):

```sql
update private.noowe_plan_features set enabled = true
  where plan_code = 'profissional' and feature_key = 'tap_to_pay';
```

`tap_to_pay` está desligado em todos os planos até haver contrato com o fornecedor (pendência 23). Enterprise não tem
linhas, porque o que entra depende do contrato.

## Créditos NOOWE Pay

| Tabela | Campos | Valor atual |
|---|---|---|
| `noowe_credit_tiers` | `min_index_bps`, `credit_bps` | Prata 4000 → 500; Ouro 6000 → 1000; Platina 8000 → 2000 |
| `noowe_credit_plan_minimums` | `plan_code`, `min_volume_cents` | Essencial 800000; Profissional 1500000; Business 3000000 |
| `noowe_credit_settings` | `invoice_cap_bps` | 3000 (30% da fatura) |
| | `invoice_floor_bps` | 7000: os créditos nunca levam a fatura abaixo de 70% do preço de tabela |
| | `release_after_invoices` | 2 faturas |
| | `expiry_months_monthly`, `expiry_months_annual` | 6 e 12 meses |
| | `tap_counts_for_index` | `false` |

## Inadimplência e renovação

Tabela `noowe_billing_settings`.

| Campo | Valor atual |
|---|---|
| `grace_days` (tolerância, depois sai da busca) | 7 |
| `suspend_orders_after_days` (suspende pedidos pelo app) | 30 |
| `renewal_notice_days` (aviso antes da renovação) | 30 |
| `trial_days` (teste sem cartão para quem não usa código) | 30 |
| `staff_invite_days` (validade do convite de equipe) | 7 |

Também em `noowe_billing_settings`:

| Campo | Valor atual |
|---|---|
| `invoice_lead_days` (a fatura do próximo período sai antes, e vence no aniversário da assinatura) | 7 |
| `invoice_due_days` (prazo quando a fatura só sai depois do aniversário) | 3 |
| `canceled_data_days` (plano encerrado: dados e exportação disponíveis para o Dono) | 90 |
| `refund_tariff_returned_bps` (parte da tarifa que o Asaas devolve no estorno; o crédito "Ajuste de estorno" é o resto) | 0 |
| `refund_balance_retry_minutes` (Pix sem saldo: intervalo entre as tentativas do estorno) | 60 |
| `card_refund_notice_business_days` (aviso ao cliente sobre o estorno no cartão) | 10 |
| `nfce_cancel_window_minutes` (estorno total dentro deste prazo cancela a NFC-e) | 30 |

**Plano encerrado (pendência 80):** sai da busca, pedidos e pagamentos pelo app ficam suspensos e as comandas abertas fecham com as
ferramentas do último plano. Reativar devolve tudo.

**Depois que a fatura do próximo período sai:** upgrade passa a valer já, e a diferença do próximo período vem em fatura própria. Plano
menor vale a partir do período seguinte. Cancelar anula a fatura e a cobrança no Asaas. Em `noowe_credit_settings`: `expiry_notice_days`, aviso antes de o crédito expirar.

## Plano sugerido por tipo de serviço

Tabela `noowe_plan_suggestions`. O app só sugere; o restaurante escolhe.

| `service_model` | `plan_code` |
|---|---|
| `quick_service` | `essencial` |
| `casual_dining` | `profissional` |
| `fine_dining` | `business` |

## Contrato por restaurante

Tabela `noowe_restaurant_contracts`. Serve ao Enterprise, que aparece como "Sob consulta": o preço vem daqui, e campo vazio
herda o do plano.

```sql
insert into private.noowe_restaurant_contracts(restaurant_id, plan_code, monthly_price_cents, order_allowance, note)
values ('<id do restaurante>', 'enterprise', 1200000, 20000, 'Contrato de 03/11');
```

## Dados da empresa NOOWE

Tabela `noowe_company`, uma linha só, preenchida em 05/11 (pendência 34): DINI & CIA. TECNOLOGIA LTDA, CNPJ `64159447000190`, CCM 0.112.566-4,
Simples Nacional. `nfse_notes` é o texto das informações complementares de toda nota. `nfse_max_attempts` limita as tentativas (padrão 5).

## Tipos de nota da NOOWE

Tabela `noowe_nfse_types`, uma linha por tipo (pendência 91):

| `kind` | Nota |
|---|---|
| `subscription` | Uma por fatura paga, para o CNPJ do restaurante |
| `noowe_pay` | Uma por semana (segunda a domingo) e por restaurante, com a soma dos splits da NOOWE. Sai na segunda depois do meio-dia |
| `convenience` | Uma por pedido com taxa de conveniência, para o cliente final |

Campos a preencher pelo contador: `municipal_service_id` ou `municipal_service_code`, `municipal_service_name`, `service_description` e `iss_bps`.
As retenções (`pis_bps`, `cofins_bps`, `csll_bps`, `inss_bps`, `ir_bps`, `retain_iss`) estão zeradas. Sem código e alíquota, a nota daquele tipo espera, e a
varredura `nfse-sweep` emite quando entrarem:

```sql
begin;
select set_config('noowe.param_author', 'Seu nome', true);
update private.noowe_nfse_types set municipal_service_code = '01.03', municipal_service_name = 'Licenciamento de software',
  service_description = 'Assinatura NOOWE', iss_bps = 200 where kind = 'subscription';
commit;
```

O tomador da nota da conveniência é quem pagou, com o CPF que ele informou para gerar a cobrança online (o Asaas exige esse CPF).
O CPF fica em `private.customer_tax_documents`, fora do alcance da API; quem já tinha cadastro no Asaas tem o CPF lido de lá no
próximo pagamento. Uma nota sem CPF registrado espera, com o motivo, em `private.noowe_report_fee_notes`, e é completada assim que
o CPF aparece.

"CPF na nota" (cupom fiscal do restaurante, pela Focus NFe) é opcional e por pagamento, em `private.payment_receipt_documents`.
Sem ele, a NFC-e sai como consumidor não identificado. Com a conta dividida e mais de uma pessoa pedindo, vale o primeiro
pagamento da nota (regra provisória, em `private.fiscal_consumer_document`).

## Fornecedor de Tap to Pay

Tabela `noowe_tap_settings`, uma linha só: `provider` e `active` (hoje vazio e falso). O banco recusa `active = true` sem
fornecedor. **As credenciais não ficam aqui:** vão em segredo, porque o histórico copiaria o valor. Para ligar quando houver
contrato, altere esta linha e ligue `tap_to_pay` em `noowe_plan_features`.

## Teto de retenção da gorjeta

Tabela `noowe_tip_retention_caps`: `regime` e `cap_bps` (Simples Nacional, 20%; demais, 33%). O restaurante escolhe a retenção de 0% até o teto do
próprio regime. Sem regime informado no Perfil, vale o teto menor.

## Códigos promocionais

Tabela `noowe_promo_codes`, um registro por código, sempre em maiúsculas. Começa vazia.

| `kind` | Campo do benefício |
|---|---|
| `free_months` | só `duration_months` |
| `percent_off` | `percent_off_bps` e `duration_months` |
| `fixed_off` | `amount_off_cents` e `duration_months` |

```sql
insert into private.noowe_promo_codes(code, kind, duration_months, valid_until, max_uses, new_restaurants_only)
values ('FUNDADORES', 'free_months', 6, '2027-06-30', 20, true);
```

Outros campos: `valid_from`, `plan_codes` (vazio vale para todos), `allow_monthly`, `allow_annual`, `is_active`, `skips_trial` (dispensa o teste) e
`grants_category` (marca o restaurante, como "Parceiro Fundador", e a marca fica depois que o benefício acaba).

Código com fases usa `noowe_promo_code_phases`. Fase com `duration_months` vazio é vitalícia e só faz sentido como a última.
O código **FUNDADOR** já existe, desligado (resposta 26): 12 meses grátis e depois 50% vitalício. Para ligar, defina validade e limite de usos:

```sql
update private.noowe_promo_codes set is_active = true, valid_until = '2027-06-30', max_uses = 50 where code = 'FUNDADOR';
```

O desconto vale enquanto o restaurante está em dia: fatura com atraso sai sem desconto, e o benefício continua. Com código ativo no mês, o restaurante
não gera Créditos NOOWE Pay; eles voltam no mês seguinte ao fim do código.

**Benefício de fundador ativo: sim/não.** Tabela `noowe_founder_benefit`. Para desligar (contrapartidas descumpridas), a próxima fatura já sai sem o desconto:

```sql
insert into private.noowe_founder_benefit(restaurant_id, active, note) values ('<id do restaurante>', false, 'Contrapartidas de out e nov');
```

O piso absoluto da fatura depois dos créditos fica em `noowe_credit_settings.min_invoice_cents`; o piso sobre a tabela, em `invoice_floor_bps`.

## Consultas internas

Margem por pagamento, sem pagamentos simulados. `noowe_split_cents` é o que a NOOWE recebeu de taxa, sem a conveniência, que tem consulta própria:

```sql
select restaurant_id, payment_method, count(*), sum(amount_cents) as pago_cents, sum(noowe_split_cents) as split_cents
from private.noowe_report_payment_margin
where paid_at >= date_trunc('month', now())
group by 1, 2;
```

Diferenças a compensar, por restaurante, tipo e situação:

```sql
select * from private.noowe_report_compensations where status = 'open';
```

Receita de conveniência, por restaurante e mês:

```sql
select * from private.noowe_report_convenience order by month desc;
```

Notas avulsas (taxa NOOWE Pay semanal e conveniência), por situação:

```sql
select * from private.noowe_report_fee_notes;
```

Créditos gerados, usados, expirados e a liberar:

```sql
select * from private.noowe_report_credits order by month desc;
```
