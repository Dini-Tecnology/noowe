# T1 — Núcleo (N1, N2, N3, N4)

**Fatias:** [N1](../fatias/N1-cardapio-estacoes.md) · [N2](../fatias/N2-pedido-maquina-de-estado.md) · [N3](../fatias/N3-kds-tempo-real.md) · [N4](../fatias/N4-pagamento-fiscal.md)
**Spec:** §2.2, §2.3, §2.5, §3.4, §7.3, §7.4

> Este é o motor compartilhado pelos três modelos. N2 e N4 estão **DIVERGENTES** — a derivação de
> status está invertida e a tela de sucesso do app é, na prática, a fonte da verdade do pagamento.

---

## N1 — Cardápio, estações e disponibilidade

### T-N1-01 · AJUSTE — `stations` como tabela e FK obrigatória em `menu_items`
**Tipo** banco **Tamanho** M **Bloqueia** T-F1-03, T-N2-04
**Spec** §2.3 ("itens de bar e cozinha são roteados em paralelo"), §3.4 ("o roteamento distribui cada item para cozinha ou bar conforme a estação da ficha técnica")
**Gap** `menu_items.station_id` é `uuid` solto, **sem FK** (`20260429120000_menu_categories_and_menu_items.sql:40`).
Existe `cook_stations` (`20260430180000_...:762`), mas nada liga as duas. `station_id` é nullable e
sem check — nada impede publicar item sem estação.
**Aceite** Item publicado sem estação é rejeitado pelo banco.

### T-N1-02 · NOVO — `menu_item_options` com preço calculado no servidor
**Tipo** banco/servidor **Tamanho** M
**Spec** §5.4 ("extras pagos e remoção de ingredientes são configurados por categoria de item; cada extra afeta preço e, quando aplicável, tempo de preparo") **Invariante** 2
**Gap** Não existe. Há `menu_item_customization_groups` (`20260430180000_...:878`) **sem RLS e sem uso
em `place_order`**. `place_order` (`20260710130000_place_order_rpc.sql:84`) usa `v_menu_item.price`
puro e grava `customizations` como jsonb opaco — **o preço com extras exibido no app não é o preço
que o servidor calcula.**
**Aceite** Preço de item com extras vem do servidor e confere com o exibido, incluindo o efeito no tempo de preparo.

### T-N1-03 · NOVO — `menu_items` no Realtime
**Tipo** banco **Tamanho** P
**Spec** §3.2 etapa 4 ("cardápio filtrado por disponibilidade real — estoque e bloqueios do chef")
**Gap** `menu_items` não está na publicação Realtime. Item bloqueado pelo chef não some da tela aberta.
**Aceite** Chef bloqueia item e ele desaparece do cardápio aberto no app sem recarregar.

### T-N1-04 · NOVO — Alérgeno do item propaga para o ticket
**Tipo** servidor **Tamanho** P **Relacionado** T-C1-01
**Spec** §4.4 ("alergias registradas viram alerta obrigatório no ticket do KDS")
**Gap** `menu_items.allergens` existe (`20260429120000_...:35`) e não chega ao ticket.
**Aceite** Ticket do KDS mostra o alérgeno do item em destaque.

---

## N2 — Pedido, itens e máquina de estado

### T-N2-01 · AJUSTE — Inverter a derivação de status (a mais grave depois de F2)
**Tipo** banco **Tamanho** M **Invariante** 5
**Spec** §2.3 ("o status do pedido é derivado do status dos itens. Um pedido só entra em `ready` quando todos os itens de todas as estações estão prontos")
**Gap** **A derivação está invertida.** `private.sync_order_item_status_from_order()`
(`20260815170000_order_tracking_realtime_consistency.sql:4-40`) é um trigger
`after update of status on public.orders` que **escreve o status nos itens a partir do pedido** — o
contrário exato da invariante.
**Fazer** Remover esse trigger; criar trigger em `order_items` que recalcula `orders.status` por
convergência (`bool_and(...)`), como única origem do status do pedido.
**Aceite** Marcar o último item pronto move o pedido para `ready` sozinho; escrever `orders.status` à mão não muda item nenhum.

### T-N2-02 · AJUSTE — Unificar as duas implementações de convergência
**Tipo** banco **Tamanho** P **Depende de** T-N2-01
**Gap** A convergência real existe como efeito colateral dentro de RPC, **duplicada**:
`20260624207000_kds_operations_rpc.sql:84-97` e `20260713161000_cook_role_permissions.sql:180-190`
são a mesma regra escrita duas vezes.
**Aceite** Uma única implementação da convergência, no trigger de T-N2-01.

### T-N2-03 · AJUSTE — Fechar as escritas diretas de `orders.status`
**Tipo** banco/app **Tamanho** M **Depende de** T-N2-01 **Invariante** 5
**Gap** `orders.status` é escrito diretamente em **10 lugares** no SQL —
`20260624130000_...:245`, `20260815170000_...:109`, `20260624207000_...:94`, `20260713161000_...:187`,
`20260624211000_...:90`, `20260710131000_...:94`, `20260624213000_...:83`, `20260816010000_...:252`,
`20260803170000_...:180`, `20260721193000_...:209` — e **também a partir do app, por PostgREST, sem RPC**:
`shared/services/supabase-api.ts:482-491` faz `.from('orders').update({ status: 'cancelled' })`.
As migrations revogam `insert` em `orders` (`20260710130000_place_order_rpc.sql:124`) mas **não revogam `update`**.
**Fazer** Revogar `update` de `authenticated` em `orders`; trocar `cancelOrder` do app por RPC; transições
de estado só por RPC que valide a máquina (`20260815170000_...:45-62` já tem a tabela de transições válidas).
**Aceite** `update` direto em `orders` por PostgREST é negado.

### T-N2-04 · AJUSTE — `place_order` roteia por estação
**Tipo** servidor **Tamanho** P **Depende de** T-N1-01
**Spec** §3.6 ("um pedido confirmado no app aparece no KDS correto — cozinha ou bar — sem intervenção manual")
**Gap** O `insert` em `order_items` (`20260710130000_place_order_rpc.sql:76-88`) **não popula `station_id`**.
O critério não tem implementação no caminho de criação.
**Aceite** Pedido com item de bar e item de cozinha gera dois tickets, cada um na sua estação, sem toque humano.

### T-N2-05 · NOVO — Constraint de coerência pedido × modelo
**Tipo** banco **Tamanho** P
**Spec** ADR-003
**Gap** Não existe. Nada impede um pedido de Quick Service nascer vinculado a uma sessão de mesa, ou um
pedido de Fine Dining sem sessão.
**Aceite** Pedido incoerente com o modelo é rejeitado pelo banco.

### T-N2-06 · NOVO — Alteração pós-confirmação exige aprovação com motivo
**Tipo** servidor **Tamanho** M **Depende de** T-F2-04
**Spec** §3.4 ("alterações após a confirmação exigem aprovação: cancelamento e devolução seguem para a fila de aprovações do gerente com motivo obrigatório") **Invariante** 8
**Gap** Sem implementação. `public.approvals` existe (`20260721193000_...`) mas não é acionada por alteração de pedido, e nada grava auditoria.
**Aceite** Cancelar item confirmado abre aprovação pendente e grava `audit_log` com autor, motivo e horário.

### T-N2-07 · NOVO — Item indisponível depois do pedido
**Tipo** servidor/app **Tamanho** M
**Spec** §3.5 ("o chef marca indisponível; o cliente recebe aviso com sugestão de substituição e o item sai da comanda mediante confirmação")
**Gap** Sem implementação.
**Aceite** Chef marca indisponível → cliente recebe aviso com sugestão → item só sai da comanda após confirmação do cliente.

---

## N3 — KDS e tempo real

### T-N3-01 · NOVO — Fila de mutações offline com replay idempotente
**Tipo** app **Tamanho** G **Depende de** T-F2-05, T-F2-07
**Spec** §3.5 ("o app mantém a comanda localmente e sincroniza ao reconectar"), §7.3 ("modo degradado")
**Gap** `useOffline` trata conectividade, não replay de mutação. Sem idempotência, o replay duplicaria
o pedido — por isso depende de F2.
**Aceite** Pedido criado sem rede entra uma única vez ao reconectar, com o app em modo avião simulado.

### T-N3-02 · NOVO — Lançamento manual pelo painel em modo degradado
**Tipo** app **Tamanho** M
**Spec** §3.5 ("o garçom pode lançar o pedido pelo painel"), §7.3
**Gap** Sem implementação.
**Aceite** Com o app do cliente offline, o garçom lança o mesmo pedido pelo painel e ele não duplica quando o cliente reconecta.

### T-N3-03 · NOVO — Tela de expedição que libera por convergência
**Tipo** app **Tamanho** M **Depende de** T-N2-01
**Spec** §2.3 ("itens de bar e cozinha … reconvergem na expedição")
**Gap** Não existe tela de expedição.
**Aceite** Expedição só libera o pedido quando todos os itens de todas as estações estão prontos.

### T-N3-04 · NOVO — Reroteamento de carga entre estações
**Tipo** app/servidor **Tamanho** M
**Spec** §5.3 ("controla o SLA por etapa e redistribui carga entre estações")
**Gap** Ausente.
**Aceite** Chef move um ticket de estação e o item reaparece na fila de destino sem perder histórico.

### T-N3-05 · NOVO — Contrato dos oito eventos de §2.5
**Tipo** servidor/teste **Tamanho** M **Depende de** T-N2-01
**Spec** §2.5 (tabela de eventos), §4.6 ("dispara push quando a mesa fica pronta")
**Gap** Só os eventos de §2.6 têm tarefa (T-G2-10). Os oito de §2.5 estão descritos em
`docs/arquitetura/02-realtime-e-rls.md`, sem tarefa nem teste. Dois carregam regra de negócio, não só aviso:
`table.status_changed` libera a próxima chamada da fila, e `payment.completed` leva a mesa a `available` e dispara
fiscal e fidelidade.
**Fazer** Um emissor por evento, com payload versionado; teste que verifica origem, destino e efeito de cada linha da tabela.
**Aceite** Os oito eventos de §2.5 são emitidos e produzem o efeito descrito, verificados um a um.

### T-N3-06 · NOVO — Progresso por item em tempo real no app
**Tipo** app/teste **Tamanho** P **Depende de** T-N2-01, T-F1-03
**Spec** §3.6 ("o status por item no app reflete a mudança feita na estação em tempo real"), §3.2 etapa 6
**Gap** `order_items.prepared_by` e `customer_get_order_item_preparers` existem, mas hoje o status do item é escrito a
partir do pedido (trigger invertido, T-N2-01): a tela mostra o estado do pedido, não o da estação.
**Aceite** Mudar um item na estação muda aquele item no app, sem recarregar, e só ele.

---

## N4 — Pagamento e fiscal

### T-N4-01 · NOVO — Webhook do provedor como fonte da verdade
**Tipo** servidor **Tamanho** G **Invariante** 6 **Bloqueia** T-Q1-06
**Spec** §7.4, §5.4 ("o pedido só entra na fila de produção após a confirmação do pagamento")
**Gap** **Não existe webhook de pagamento.** `grep` por webhook ligado a pagamento nas migrations
retorna zero. `restaurant_record_payment` (`20260624211000_payment_rpc.sql:43-95`) recebe
`p_amount numeric` **do cliente**, insere `gateway_transactions` com `status = 'completed'` na mesma
chamada e marca `orders.status = 'completed'` (`:90`). O mesmo padrão em
`20260816010000_...:239-254`. **A tela de sucesso do app é, na prática, a fonte da verdade.**
(`webhook_subscriptions`/`webhook_deliveries` existem mas são de integração externa e estão sem RLS.)
**Fazer** Edge Function de webhook por provedor, com verificação de assinatura, idempotente por
`provider_event_id`; a transação só vira `completed` por essa via.
**Aceite** Marcar pago no app sem o webhook correspondente não confirma o pagamento nem libera produção.

### T-N4-02 · AJUSTE — Servidor reconfere o valor cobrado
**Tipo** servidor **Tamanho** M **Invariante** 2 **Depende de** T-F2-01
**Spec** §7.2 · regra de `CLAUDE.md` ("um total vindo do cliente é sempre recalculado e conferido")
**Gap** `p_amount` não é reconferido contra o total do pedido em lugar nenhum. Toda a aritmética de
cobrança acontece no React Native (lista completa em T-G3-01).
**Aceite** RPC de pagamento rejeita valor que não bata com o total recalculado no servidor.

### T-N4-03 · NOVO — Emissão fiscal vinculada ao encerramento
**Tipo** servidor **Tamanho** G
**Spec** §7.4 ("emissão fiscal vinculada ao encerramento da conta, com recibo digital disponível no app e exportável")
**Gap** `fiscal_documents` e `fiscal_configs` existem como tabelas (`20260430180000_...`), **ambas sem RLS**,
e não há RPC de emissão NFC-e nem vínculo com o fechamento. O recibo digital existe
(`DigitalReceiptScreen.tsx`, `casual_dining_receipts`) mas sem documento fiscal por trás.
**Aceite** Fechar a conta emite o documento fiscal e o recibo do app referencia o número emitido.

### T-N4-04 · NOVO — Estorno e cancelamento fiscal com aprovação
**Tipo** servidor **Tamanho** M **Depende de** T-F2-04
**Spec** §7.4 ("estorno e cancelamento fiscal precisam de fluxo próprio com aprovação e registro")
**Gap** Sem implementação. `gateway_transactions.refunded_amount_cents` existe e **nunca é escrito**.
**Aceite** Estorno exige aprovação, grava `audit_log`, escreve `refunded_amount_cents` e dispara o cancelamento fiscal.

### T-N4-05 · NOVO — Gate de pagamento antes da produção
**Tipo** servidor **Tamanho** M **Invariante** 6 **Depende de** T-N4-01
**Spec** §5.4, §5.6 ("nenhum pedido entra na produção sem pagamento confirmado")
**Gap** Nenhum gate existe.
**Aceite** Com `prepaid_required`, pedido sem transação confirmada por webhook não aparece no KDS.
