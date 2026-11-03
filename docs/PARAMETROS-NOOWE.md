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
| `tap_card` | sem linha | Taxa do fornecedor do Tap, ainda sem contrato |
| `cash`, `house_terminal` | não têm taxa | O banco recusa linha para eles |

**Linha sem `restaurant_id` é o padrão.** Linha com `restaurant_id` vale só para aquele restaurante e prevalece:

```sql
insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps, note)
values ('pix', '<id do restaurante>', 79, 'Negociação de 03/11');
```

Meio sem taxa definida não tem cobrança: o sistema trata como indisponível, nunca como zero.

## Taxa de conveniência

Tabela `noowe_convenience_fees`. Campos: `flow`, `restaurant_id`, `fee_cents`, `enabled`, `note`.

| Fluxo (`flow`) | Valor atual |
|---|---|
| `pickup` (retirada sem fila) | 0 (R$ 0), desligada (`enabled = false`) |
| `scheduled` (pedido agendado) | 0 (R$ 0), desligada (`enabled = false`) |

**Desligada até o contador confirmar** o formato da nota e a passagem pela conta do restaurante (pendência 38). O fluxo fica
pronto: para ligar, troque `fee_cents` (o provisório era 99) e `enabled`. Fluxo fora da tabela não cobra. O padrão e o valor por restaurante seguem a mesma regra da taxa NOOWE Pay.

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

Tabela `noowe_company`, uma linha só. Hoje só o CNPJ (`64159447000190`) está preenchido. Razão social, endereço, inscrição
municipal e regime tributário esperam o Pedro (pendência 34), e nenhuma nota é emitida sem eles.

## Fornecedor de Tap to Pay

Tabela `noowe_tap_settings`, uma linha só: `provider` e `active` (hoje vazio e falso). O banco recusa `active = true` sem
fornecedor. **As credenciais não ficam aqui:** vão em segredo, porque o histórico copiaria o valor. Para ligar quando houver
contrato, altere esta linha e ligue `tap_to_pay` em `noowe_plan_features`.

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

Outros campos: `valid_from`, `plan_codes` (vazio vale para todos), `allow_monthly`, `allow_annual`, `is_active`.

## Consultas internas

Margem por pagamento, sem pagamentos simulados. `noowe_split_cents` é o que a NOOWE recebeu:

```sql
select restaurant_id, payment_method, count(*), sum(amount_cents) as pago_cents, sum(noowe_split_cents) as split_cents
from private.noowe_report_payment_margin
where paid_at >= date_trunc('month', now())
group by 1, 2;
```

Diferenças a compensar, receita de conveniência e créditos gerados, usados, expirados e a liberar ainda não têm consulta:
dependem dos registros criados nas fatias M2, M3 e M5.
