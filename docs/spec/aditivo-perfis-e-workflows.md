# Aditivo à spec v2 — Perfis, telas e workflows do App Restaurante

**Origem:** avaliação de @Pedro de 28/10/2026 (mensagem abaixo) e documento
[`NOOWE-Restaurant-Perfis-Telas-e-Workflows.pdf`](NOOWE-Restaurant-Perfis-Telas-e-Workflows.pdf) (37 páginas, íntegro).
**Status:** aditivo à `NOOWE-spec-v2.md`. Onde contradiz um ADR, vale o ADR **PROVISÓRIO** correspondente (022–029)
até o autor responder [`PENDENCIAS-perfis-workflows`](../decisoes/PENDENCIAS-perfis-workflows.md).
**Backlog:** fatias [O0–O10](../fatias/README.md).

## Ideia central

O app é o orquestrador: **evento → regra → tarefa → responsável**. A pessoa só toca no app para ação física
(cozinhar, servir, limpar, receber dinheiro), julgamento (aprovar exceção) ou correção de fluxo. Toda tarefa vai ao
mesmo tempo para o responsável e para o Gerente; quem agir primeiro conclui, e ela some da tela dos dois. Não há
subida de nível por tempo. Aprovações vão ao Gerente e ao Dono ao mesmo tempo. Tudo em log com horário e autor.

## Mensagem do autor (resumo fiel por seção)

1. **Base** — status únicos entre perfis (item, pedido derivado dos itens, comanda, mesa, reserva, fila, caixa);
   eventos geram status + tarefa + aviso ao cliente; primeira aba de cada perfil é lista de tarefas; um toque, sem
   formulário, ação na notificação; remover toques que o sistema resolve (confirmação de bar, "Iniciar", confirmar que o
   grupo sentou, no-show manual, capacidade digitada); corrigir inconsistências (receita, caixa, "0 Mesas", "Mesa Mesa 6",
   "Carregando...", CRM vazio, "Sem turno", capacidade 30 × 26); Operação ao vivo para Dono (leitura) e Gerente (age).
2. **Atribuição automática** de mesa (área, menor mesa que comporta, acessibilidade, mesa provisória, junção de grupo
   grande, desempate pelo garçom com menos pessoas) e de garçom (seções fixas ou rodízio por área; só escalados;
   limite de mesas; preferido do cliente; transferência no fim do turno).
3. **Fluxos de entrada** por serviço (Fine, Casual, Quick) e vários serviços por restaurante.
4. **Inteligência operacional** (ritmo da cozinha, previsão de liberação, espera que aprende, meta de giro, etiquetas
   de cliente, disparo por tempo de preparo, total do dia, revisão de fim de turno, fechamento do dia).
5. **Ajustes por perfil** (Dono, Gerente, Maître, Garçom, Chef, Cozinheiro, Barman).
6. **Uma pessoa, várias funções** com função principal, painel unificado e regras anti-conflito.
7. **Central de Configuração** em 9 blocos e opções válidas por serviço.
8. **Hold** (ocultar sem "em breve"): Estoque, CMV/margem/custo, fichas técnicas de drinks, aprovações de Chef's Table,
   Reserva de Eventos, os 8 serviços "Em breve".

O detalhe de cada ponto está no PDF; a tabela "Catálogo de eventos" (p. 14–16) é a referência do motor (ADR-022).

## Correções factuais (o código contradiz a avaliação)

Verificadas no código em 01/11/2026 (HEAD `7f68edd7`):

| Afirmação do documento | O que o código mostra |
|---|---|
| Mapa do Maître é "somente leitura" | `TablesScreen` já permite sentar e mudar status ao Maître; falta trocar/juntar pela tela |
| "Confirmação manual de pedido de bar antes do KDS" | É só um texto de banner (`OwnerHubScreen.tsx`); não há etapa de confirmação |
| Prévia de Pagamentos "soma 10% + 15%" | `ConfigPaymentsScreen.tsx` mostra taxa e gorjeta em linhas separadas, sem somar |
| Fila "não existe em nenhum perfil" | `WaitlistScreen` e as RPCs existem; falta entrada na navegação |
| Garçom sem vínculo mesa → garçom | Correto: nada grava `tables.assigned_waiter_id` |
| Tap to Pay | `WaiterTapToPayScreen` apenas registra o pagamento (`recordPayment`); não há cobrança por NFC/terminal |

## Divergências com ADRs e invariantes

Listadas em [`PENDENCIAS-perfis-workflows`](../decisoes/PENDENCIAS-perfis-workflows.md). Regra do repositório:
divergência é decisão, não improviso — cada uma vira ADR provisório com default isolado em função nomeada.
**Nada que mexa em dinheiro (itens 8–11) entra antes da resposta do autor.**

## O que não muda

Os sete perfis continuam; recepção é o Maître com permissões reduzidas. Capacidades continuam lidas de configuração,
nunca de `service_model` no código (CLAUDE.md). Valores como tolerâncias, limites e percentuais vivem em
`restaurant_model_configs`/`restaurant_model_policies`.
