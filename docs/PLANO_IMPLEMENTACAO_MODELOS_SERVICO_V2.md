# Plano de implementação dos modelos de serviço v2

## Objetivo

Levar a NOOWE à aderência funcional completa da especificação v2 para Fine Dining, Casual Dining e Quick Service. O produto final terá um único núcleo de cardápio, pedidos, KDS, pagamento, fiscal e fidelidade; o ponto de entrada e a configuração da unidade determinarão os módulos e as políticas que ficam ativos.

Este plano usa o documento `NOOWE_Modelos_de_Servico_Fine_Casual_Quick_v2.docx` como fonte de requisitos. Os nomes atuais do banco (`restaurants`, `table_session_participants` e `waitlist_entries`) são preservados quando forem equivalentes aos termos da especificação; a adaptação de vocabulário está registrada em `docs/arquitetura/05-glossario-spec-banco.md`.

## Andamento

- **Em implementação — Onda 1 / T-F3-01 e T-F3-03:** a migration `20260914130000_restaurant_model_config_foundation.sql` introduz `restaurant_model_configs`, faz o backfill dos três modelos, valida combinações incoerentes e publica a RPC canônica de capabilities. O app já possui o contrato tipado e validado em `shared/config/capabilities.ts`; a próxima etapa é conectar os consumidores do registry legado a essa RPC.
- **Em implementação — Onda 1 / T-F2-03:** a migration `20260914131000_audit_log_foundation.sql` estende o log de autenticação existente para registrar ações operacionais por unidade, com autor, motivo e snapshots antes/depois na mesma transação da RPC chamadora.

## Diagnóstico de partida

Há uma superfície de produto importante já pronta: apps cliente e restaurante, telas de produção para os três modelos, menu, QR de mesa, reservas, fila, KDS, carteira, comanda em grupo e várias RPCs do Supabase. Em particular, já existem os caminhos de `customer_open_table_session`, convite de mesa, `customer_place_order`, telas de combo, fechamento de conta, modo família e acompanhamento de pedido.

Isso ainda não significa aderência de produção. As regras críticas estão distribuídas entre UI, RPCs e configurações hardcoded, e algumas contradizem a especificação. Os principais gaps confirmados são:

| Prioridade | Gap | Consequência se não for corrigido |
|---|---|---|
| P0 | Valores monetários ainda usam `numeric`/`number`, em vez de `bigint` em centavos. | Split, desconto, taxa, gorjeta e fiscal podem divergir por arredondamento. |
| P0 | A configuração é fragmentada e o registry de service type é hardcoded. | Não há fonte única de capabilities nem coexistência segura de modelos. |
| P0 | Status de pedido ainda pode ser escrito diretamente e não é derivado de todos os itens. | Bar e cozinha não convergem de forma confiável em expedição. |
| P0 | Não há webhook de provedor como fonte de verdade nem gate persistente de pagamento para Quick. | Um pedido Quick pode chegar ao KDS sem confirmação real de pagamento. |
| P0 | `bill_shares`, pedido de exceção de capacidade e código de retirada persistente ainda não existem. | Os critérios de split, lotação e retirada não podem ser garantidos pelo banco. |
| P0 | Convite atual usa token em claro e TTL fixo; sessão não exige origem de reserva/fila. | Há risco de acesso indevido e Fine Dining pode abrir consumo sem entrada controlada. |
| P1 | RLS e Realtime não têm recorte completo por garçom e estação; auditoria não registra ações sensíveis. | Vazamento operacional, falhas de autorização e ausência de rastreabilidade. |
| P1 | Fila, consumo na espera, família, festas, chamados, fidelidade e CRM estão apenas parciais. | Casual e Fine não cumprem suas jornadas ponta a ponta. |

Os arquivos em `docs/fatias/` descrevem o alvo por domínio e `docs/tarefas/` já detalha 161 tarefas executáveis. Este plano não duplica esse backlog: organiza a sequência segura para executá-lo.

## Princípios de implementação

1. Não criar três produtos. Somente a função de capabilities conhece os nomes `fine_dining`, `casual_dining` e `quick_service`; telas e regras consultam flags.
2. O banco é a autoridade para dinheiro, estado, idempotência, capacidade, pagamento e fechamento. O app propõe ações e exibe a resposta do servidor.
3. Migrar com compatibilidade progressiva. Toda alteração estrutural deve ter: coluna/tabela nova, backfill, leitura dupla quando necessário, troca de escrita, telemetria, remoção posterior.
4. Transformar cada critério de aceite da especificação em teste automatizado antes de considerar a fatia concluída.
5. Não mesclar mudanças de UX que dependam de uma invariante ainda ausente. Por exemplo, não liberar split visual antes de `split_commit` validar a soma no servidor.

## Arquitetura alvo

```text
Configuração da unidade
  -> capabilities e políticas
      -> entrada (reserva/fila/QR de mesa/QR de balcão)
          -> sessão de mesa ou pedido Quick
              -> pedido e itens por estação
                  -> KDS e eventos em tempo real
                      -> pagamento confirmado
                          -> fiscal, fidelidade, mesa/retirada e CRM
```

As duas trilhas físicas devem permanecer separadas no banco:

| Entrada | Modelo resultante | Unidade de consumo | Fechamento |
|---|---|---|---|
| Reserva, chamada de fila ou QR de mesa | Fine Dining ou Casual Dining | `table_session` com participantes | Depois do consumo; pode ter split e parcelas. |
| App sem mesa ou QR de balcão | Quick Service | Pedido individual de retirada | Pagamento confirmado antes de entrar no KDS. |

Uma constraint deve impedir pedido Quick associado a mesa e pedido de salão sem sessão. Assim, uma unidade pode operar Casual + balcão express sem oferecer ao cliente uma tela artificial para escolher o modelo.

## Ondas de entrega

### Onda 0 — congelar o contrato e preparar a entrega

**Objetivo:** eliminar ambiguidade antes de alterar dados financeiros ou fluxos em produção.

- Tratar `docs/spec/NOOWE-spec-v2.md`, `docs/arquitetura/` e `docs/decisoes/` como contrato canônico; manter o DOCX como a referência original.
- Confirmar em ambiente local e staging que as migrations versionadas reproduzem o banco usado pelos apps; não editar migrations já aplicadas.
- Versionar e colocar no CI a suíte pgTAP, testes de app e um smoke test de Realtime.
- Criar feature flags de rollout por unidade e métricas de erro para QR, pedido, KDS, pagamento e retirada.
- Resolver o único bloqueador de produto ainda provisório: ADR-004, sobre reabertura depois de pagamento parcial e política de estorno/fiscal.

**Saída:** contrato de schema, ADRs aceitos, ambiente reproduzível, testes executando no CI e um plano de rollback para cada migration expansiva.

### Onda 1 — fundações compartilhadas e segurança

**Objetivo:** tornar possíveis os três modelos sem duplicar regras.

1. Criar `establishment_config` como fonte única tipada para todos os parâmetros da seção 7.1 da especificação: modelos ativos, taxas, gorjetas, split, reserva/fila, família, combo, pré-pagamento, capacidade de retirada, convite, capacidade de mesa e fidelidade.
2. Implementar `capabilitiesFor(config, model)` no pacote compartilhado e migrar consumidores do registry hardcoded. A UI só deve perguntar, por exemplo, `capabilities.guestLink` ou `capabilities.prepaidRequired`.
3. Migrar dinheiro para `bigint` em centavos em etapas, começando por `orders`, `order_items`, pagamentos e configurações. Criar tipo `Cents` no app e centralizar formatação em uma função de borda.
4. Criar `audit_log` de domínio com unidade, autor, ação, motivo, antes/depois; chamá-lo na mesma transação de cancelamento, cortesia, estorno, desconto, reabertura e exceção de lotação.
5. Tornar criação de pedido e pagamento idempotentes por intenção. O app guarda a chave ao abrir a intenção e a reutiliza em retries.
6. Ajustar RLS para os recortes exigidos: garçom vê somente suas mesas, cozinheiro/barman somente sua estação, gerente a unidade, dono o grupo; testar também o payload de Realtime.

**Dependências:** nenhuma funcionalidade de split, combo, taxa ou pagamento novo deve ser liberada antes desta onda.

**Saída:** a alteração de configuração de uma unidade ativa/desativa módulos sem deploy, nenhum cálculo financeiro depende de `number` em reais e todas as ações sensíveis deixam auditoria consultável.

### Onda 2 — motor de pedido, KDS e pagamento confiável

**Objetivo:** corrigir o caminho transacional comum que sustenta todos os modelos.

1. Normalizar estação no cardápio: FK de item para estação, disponibilidade real, opções de personalização e cálculo server-side de extras/descontos.
2. Fazer `place_order` criar itens já roteados para suas estações e exigir a chave de idempotência.
3. Substituir escrita direta de `orders.status` por derivação a partir de `order_items.item_status`; cozinha e bar evoluem em paralelo e só convergem em `ready` quando todos os itens estiverem prontos.
4. Criar canais por unidade, estação, sessão e usuário; adicionar expedição e notificações a partir dos eventos canônicos.
5. Integrar o provedor de pagamento por intenção + webhook assinado. A tela de sucesso passa a ser uma representação do estado, nunca a confirmação de pagamento.
6. Associar emissão fiscal, recibo digital, estorno aprovado e fidelidade ao evento de pagamento/fechamento correto.
7. Adicionar fila de mutações offline idempotente para comanda e um backlog de injeção ordenada quando o KDS estiver indisponível.

**Saída:** um pedido só é produzido no KDS correto; os três clientes de estado veem o mesmo progresso; reenvio de pedido/pagamento não cria duplicatas.

### Onda 3 — Quick Service como primeira trilha vertical completa

**Objetivo:** lançar a jornada mais curta de ponta a ponta para validar o núcleo transacional.

1. Modelar ponto/QR de balcão, janela de retirada, capacidade por slot, previsão de fila e alternativa para o próximo horário quando a janela estiver lotada.
2. Persistir `pickup_code`, balcão e horário; garantir unicidade por estabelecimento e dia; não usar `order_number` genérico como substituto do código de retirada.
3. Reescrever o combo builder para que preço, desconto, extras, remoções, tamanho e tempo sejam calculados no servidor a partir da configuração da unidade.
4. Aplicar cupom e pontos antes de taxa conforme regra do contrato. Nunca aceitar total enviado pelo dispositivo.
5. Garantir as quatro etapas reais: Recebido, Preparando, Conferência e Pronto. Conferência reabre somente o item com erro, preservando o restante do pedido.
6. Entregar push com código e balcão; registrar retirada, não retirada, atraso de SLA, substituição/estorno parcial e tempo pagamento→retirada.
7. Creditar selo exatamente uma vez no pedido concluído e habilitar recompra em um toque somente sobre pedidos elegíveis.

**Critérios de saída Quick:** pagamento confirmado é pré-condição de KDS; previsão reflete a fila; código é único e obrigatório na baixa; desconto de combo é visível; selo não duplica.

### Onda 4 — motor comum de entrada e jornada em grupo para Fine e Casual

**Objetivo:** implementar uma única sessão de mesa robusta antes de especializar cada formato.

1. Expandir `table_sessions` com estado `open/billing/closed`, origem obrigatória (`reservation_id` ou `waitlist_entry_id`), capacidade herdada da mesa, anfitrião, reabertura e fechamento; manter o índice único de sessão aberta por mesa.
2. Padronizar participantes: nome, papel, estado, `seat_count`, itens atribuídos e suporte a convidado sem conta. Aplicar a regra aceita de que o anfitrião responde pelo saldo do visitante não quitado.
3. Substituir convite atual por `guest_links` com hashes de token/código curto, TTL configurável, revogação, máximo de usos, rate limit e tela explícita para link expirado.
4. Implementar entrada por QR/link na mesma sessão e registrar `participant.joined` em tempo real.
5. Criar `capacity_requests`: qualquer excedente gera pendência; maitre/gerente decidem por motivo tipado, com auditoria. Criança de colo pode ter `seat_count = 0`, mas a aprovação continua explícita.
6. Ligar a origem de entrada ao modelo: Fine exige reserva ou fila controlada; Casual aceita fila como entrada principal e reserva opcional; ambos validam alocação contra assentos e junção de mesas.
7. Trocar consumo na espera de JSON por pedidos reais vinculados à entrada da fila e migrá-los à sessão quando a mesa for atribuída.

**Saída:** QR e convite jamais criam uma segunda comanda; toda entrada acima da capacidade aparece como pendência; Fine não inicia consumo sem origem controlada; pedidos de espera migram sem relançamento.

### Onda 5 — fechamento compartilhado e operações de salão

**Objetivo:** concluir a parte mais sensível de Fine e Casual: divisão, cobrança e serviço.

1. Criar `bill_shares` ancorado na sessão e as RPCs `split_preview`, `split_commit` e `pay_share`.
2. Unificar os quatro modos canônicos: por responsável, igual, por item e valor fixo. O cálculo será em centavos no servidor, com teste de propriedade para soma exata e política determinística de resíduo por `joined_at`.
3. Manter sessão/mesa em `billing` até saldo zero; pagos parciais continuam visíveis para convidados e garçom. Aplicar a decisão de ADR-004 para reabertura e estorno.
4. Calcular taxa de serviço, gorjeta e política de alocação por configuração da unidade, não por literal de tela.
5. Conectar TAP to Pay, pagamento remoto, fiscal, recibo, fidelidade e liberação da mesa ao pagamento de parcela/fechamento.
6. Completar chamados de garçom, sommelier e ajuda com ETA, fila do atendente e escopo por mesa.
7. Implementar aprovações de cancelamento, cortesia, desconto, devolução e item indisponível, todas com motivo, autor e horário.

**Saída:** os quatro splits fecham sem centavo residual; uma mesa só fica disponível depois do saldo zero; reabertura e fiscal não alteram pagamentos já liquidados silenciosamente.

### Onda 6 — especialização do Fine Dining

**Objetivo:** aplicar as políticas mais rigorosas e os módulos de experiência sem bifurcar o motor.

- Política de reserva por janela e fallback de fila para Fine; reserva, fila, no-show, alocação e check-in em uma mesma agenda do maitre.
- Convite desde a reserva, QR apenas como confirmação de chegada e associação à sessão; bloquear consumo fora de reserva/fila.
- Acompanhamento por item e responsável no preparo, com expedição, chamados de sommelier e suporte a pagamento individual no final.
- Harmonização, disponibilidade de menu e fidelidade por pontos/níveis como capabilities da unidade.
- Walk-out, cancelamento/devolução pós-confirmação, indisponibilidade e falha de rede com tratativas operacionais e auditoria.

**Critérios de saída Fine:** QR abre a sessão certa em até três segundos; KDS recebe automaticamente por estação; o cliente vê progresso por item; o maitre recebe exceções; o fluxo não permite entrada anônima.

### Onda 7 — especialização do Casual Dining

**Objetivo:** concluir giro de salão e jornada de família/grupo usando o mesmo motor de mesa.

- Fila virtual como entrada preferencial, posição recalculada, push de chamada, tolerância, no-show e disputa configurável entre reserva e fila.
- Comanda por pessoa como padrão, consumo no bar durante espera, cobrança de balcão se o grupo desistir e união de mesas refletida no mapa e na conta.
- Modo família: cardápio infantil, cadeirão, atividades, alergias e pedido de apoio. Alergia crítica aparece em destaque no KDS e exige confirmação do chef antes da expedição.
- Aniversário/festas: ocasião, grupo, mimos, política de conta e cortesia aprovada pelo gerente.
- Avaliação separada para comida, serviço e ambiente; dados enviados ao CRM com preferências e ocasião.

**Critérios de saída Casual:** posição muda sem recarregar; consumo da espera migra à mesa; cada item tem responsável; alergia bloqueia expedição; junção de mesas gera uma conta coerente.

### Onda 8 — fidelidade, gestão, acessibilidade e lançamento

**Objetivo:** completar a fase de inteligência/gestão do documento e reduzir o risco de rollout.

- Configurar `loyalty_mode`: pontos/níveis para Fine, pontos + CRM para Casual e selos como incentivo principal do Quick, podendo coexistir com carteira/cashback sem crédito duplicado.
- Criar indicadores por modelo: custo/margem e serviço no Fine; giro, gorjeta e campanhas no Casual; throughput, desperdício e SLA por estação no Quick.
- Auditar i18n PT-BR/EN-US/ES-ES, tradução de cardápio, contraste, tamanho de alvos e leitor de tela em pedido e pagamento.
- Fazer pilotos por unidade com shadow metrics, alertas de webhook/KDS, treinamento de maitre/garçom/expedição e rollout gradual por capability.
- Rodar regressão de todos os critérios de aceite e cenários de exceção antes de liberar cada modelo para novas unidades.

## Mapa de dependências

```text
Onda 0
  -> Onda 1: configuração, dinheiro, RLS, auditoria, idempotência
      -> Onda 2: pedido, KDS, pagamento/fiscal, realtime
          -> Onda 3: Quick Service completo
          -> Onda 4: entrada, sessão, convite, capacidade
              -> Onda 5: split, pagamentos parciais e operações de salão
                  -> Onda 6: Fine Dining
                  -> Onda 7: Casual Dining
                      -> Onda 8: fidelidade, gestão e rollout
```

Quick pode ser desenvolvido como a primeira trilha vertical após a Onda 2. Fine e Casual só devem divergir na Onda 6/7; até a Onda 5, compartilham entrada, sessão, participantes, capacidade, pedidos, KDS e fechamento.

## Estratégia de dados e rollout

1. Todas as migrations novas recebem testes pgTAP de constraint, RLS, RPC e evento Realtime. Migrações destrutivas só entram após backfill validado e período de leitura dupla.
2. Nenhuma migration aplicada é reescrita. Correções entram em migrations novas, com marcação de versão da API/RPC quando a assinatura mudar.
3. Configurações novas nascem desligadas para unidades existentes; cada unidade é migrada, validada em staging e ligada gradualmente.
4. Eventos carregam `event_id`, `aggregate_id`, versão e idempotency key para que consumidor e notificação possam deduplicar.
5. Dashboards de rollout acompanham: pedidos duplicados, divergência de parcelas, tentativas de acesso negadas, backlog de KDS, atraso de webhook, capacidade excedida, retirada vencida e erro de QR.

## Definição de pronto por fatia

Uma fatia não está pronta apenas porque a tela existe. Ela exige:

- migration e backfill validados;
- RPC/Edge Function com autorização, validação e idempotência quando aplicável;
- UI ligada à fonte de verdade, sem total ou regra calculada localmente;
- eventos Realtime restritos por RLS e testados;
- testes de unidade, integração e critério de aceite correspondente;
- observabilidade, mensagem de erro acionável e plano de rollback;
- documentação de configuração e treinamento do papel operacional afetado.

## Backlog de referência

| Domínio | Backlog detalhado |
|---|---|
| Fundação, dinheiro, auditoria, idempotência e capabilities | `docs/tarefas/T0-fundacoes.md` |
| Cardápio, pedido, KDS e pagamento/fiscal | `docs/tarefas/T1-nucleo.md` |
| Reserva, fila, QR, grupo, convite, capacidade e split | `docs/tarefas/T2-entrada-e-grupo.md` |
| Quick, Casual, Fine e chamados | `docs/tarefas/T3-modelos-de-servico.md` |
| Fidelidade, CRM, relatórios e operação | `docs/tarefas/T4-fidelidade-gestao.md` |
| Decisões transversais, migração e limpeza | `docs/tarefas/T5-decisoes-transversais.md` |

O dono do produto deve aprovar ADR-004 antes de iniciar a Onda 5. As demais decisões que a especificação deixava em aberto já possuem direção registrada nos ADRs 001, 003 e 006 a 009.
