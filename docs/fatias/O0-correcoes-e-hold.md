# O0 — Correções imediatas e hold

**Objetivo:** os números do app do restaurante passam a bater entre si, e o que está fora do escopo some das telas.
**Depende de:** — (primeira fatia da série O)
**Spec:** `docs/spec/aditivo-perfis-e-workflows.md` §1.5, §7.2, §8. Invariantes 1, 8 e 9
**ADRs:** 024 (rótulos), 027 (sem "primário")

## Entregáveis

**Banco** (`platform/supabase/migrations/20261101*`)
- `private.revenue_cents(restaurant, from, to)`: `bigint`, fuso do restaurante, considera pagamento confirmado (inclui
  comanda paga por `bill_shares`); usada por snapshot, relatórios e financeiro.
- `restaurant_get_customers` passa a ler comandas pagas e reservas; `restaurant_get_kds_queue` aceita garçom e maître.
- Capacidade do restaurante calculada por `private.table_effective_seats`.
- Turno do dia no fuso do restaurante.

**App do restaurante**
- `formatTableLabel`, `cashRegisterStatus`, contagem de mesas do garçom, filtro de chamados (`pending`), campos da fila
  do bar, "Marcar pronto" por item com erro visível, `is_paid` pelo estado de pagamento, cardápio do Chef.
- `ShiftsScreen` envia `user_id`; `ConfigUserCard` sai do "Carregando…".
- Hold em lista única reversível: Estoque, CMV/margem/custo, Receitas, Chef's Table, Reserva de Eventos, 8 serviços
  "Em breve", "Definir como primário", Marketplace; progresso da Central recalculado.
- Banner de confirmação de bar e abas do topo do garçom removidos; Maître abre a Fila.

## Critérios de aceite

1. Dashboard, Relatórios e Financeiro mostram a mesma receita para o mesmo dia, inclusive virada de dia e comanda paga por parcela.
2. Caixa e Relatório mostram o mesmo status do caixa, também sem sessão aberta.
3. O garçom vê chamados novos e a contagem de mesas inclui mesa em cobrança.
4. Nenhum rótulo mostra "Mesa Mesa N".
5. O card de perfil nunca fica em "Carregando…".
6. Clientes lista quem pagou comanda ou reservou.
7. Criar turno funciona e a Equipe mostra o turno do dia.
8. A capacidade do perfil é a soma das mesas.
9. Chef e Cozinheiro marcam item pronto, ou veem o erro.
10. Itens em hold não aparecem em nenhum perfil nem na Central, e o progresso não os conta.

## Fora de escopo

Remover "Iniciar" (O1), Caixa completo (O8), 9 blocos (O9), novas abas por perfil (O4), pastas mortas em `screens/`.
