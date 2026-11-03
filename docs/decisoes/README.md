# Decisões de arquitetura (ADRs)

As oito decisões que a spec (§8.1) deixou em aberto, mais duas que o plano de aderência precisou
registrar (009 e 010) e uma adição de produto à spec (011).

> **Estado em 14/09/2026: nove aceitas, uma provisória.** O ADR-006 e o ADR-010 foram escolhidos
> explicitamente pelo responsável do produto. Os ADRs 001, 002, 003, 005, 007 e 008 foram aceitos
> com o default proposto, por delegação à recomendação técnica. O ADR-009 registra a escolha já
> aplicada na migration de congelamento. **O ADR-004 continua `PROVISÓRIO`** e precisa de revisão
> humana antes da Onda 3. Cada regra segue isolada numa função nomeada, para que uma revisão
> posterior seja pontual.

| ADR | Decisão | Status | Risco se ignorada |
|---|---|---|---|
| [001](ADR-001-arredondamento-split-igual.md) | Centavos residuais distribuídos por `joined_at` | Aceito | Conta que não fecha; centavo criado ou perdido |
| [002](ADR-002-tolerancias-fila-e-no-show.md) | 8 min fila / 15 min no-show, separados | Aceito, recalibrar em operação | Cada tela com seu próprio timer |
| [003](ADR-003-coexistencia-de-modelos.md) | Ponto de entrada determina o modelo | Aceito | Pedido quick com sessão de mesa aberta |
| [004](ADR-004-reversao-de-pagamento-parcial.md) | Sem estorno automático na reabertura | Aceito (03/11) | **Vetor de fraude e descasamento fiscal** |
| [005](ADR-005-credito-de-fidelidade.md) | Pontos por parcela paga, selo na retirada | Aceito | Pontos sem dono no split |
| [006](ADR-006-convidado-sem-conta.md) | Anônimo consome; anfitrião responde | Aceito | **Saldo sem responsável** |
| [007](ADR-007-excecao-de-lotacao.md) | `seat_count` por participante, aprovação sempre | Aceito | Mesa lotada em silêncio |
| [008](ADR-008-fine-dining-sem-reserva.md) | Política com janela; origem da sessão é a trava | Aceito | Consumo sem registro de entrada |
| [009](ADR-009-fila-virtual-waitlist-entries.md) | `waitlist_entries` é a fila; `queue_entries` fica congelada | Aceito | Duas filas divergindo |
| [010](ADR-010-regras-de-fechamento-por-unidade.md) | Valor fixo e destino da gorjeta viram política da unidade | Aceito | Fine ou Casual fora da spec |
| [011](ADR-011-convite-por-username.md) | Convite por @username com aceite, convivendo com link e QR | Aceito | Convidado entra sem consentir; mesa lota em silêncio |
| [012](ADR-012-preco-medio-e-horario-com-turnos.md) | Horário com turnos em `opening_hours`; check-in exige restaurante aberto (§1, preço médio calculado, substituída pelo ADR-014) | Aceito | Cliente vê "Fechado" com o restaurante aberto; mesa aberta fora do horário |
| [013](ADR-013-jornada-quick-service-retirada.md) | Quick Service como totem no app: pedido antecipado, aceite, tolerância a partir de "pronto", Não retirado, estornos | **Provisório** | QS sem ações na tela; retirada sem validar o código; estorno sem rastro |
| [014](ADR-014-preco-medio-cadastrado-pelo-restaurante.md) | Preço médio por pessoa cadastrado pelo restaurante (R$, centavos); sem cadastro, sem preço no app | Aceito | Cliente vê preço que o restaurante não declarou |
| [016](ADR-016-casual-walk-in-por-qr.md) | Casual abre a mesa pelo QR sem reserva; fila ativa e grupo acima de `seats` viram solicitação ao maître | **Provisório** | Walk-in barrado no Casual; mesa aberta por cima de quem espera |
| [017](ADR-017-descoberta-multi-modelo.md) | `restaurants.service_models`; categoria escolhida (ou seletor) define a experiência | **Provisório** | Restaurante multi-modelo invisível numa categoria |
| [018](ADR-018-troca-e-juncao-de-mesas.md) | Junção de um nível (`merged_into_id`), capacidade efetiva única, troca de mesa e erros P0013/P0014/P0015 | **Provisório** | Grupo maior que a mesa sem saída; capacidade lida em lugares diferentes |
| [019](ADR-019-codigo-de-convite-e-forca-bruta.md) | Código de convite de 6 dígitos guardado como HMAC, com limite de tentativas por usuário e IP | **Provisório** | Convite adivinhado por força bruta |
| [021](ADR-021-comanda-como-casa.md) | A comanda é a casa do cliente: uma ativa por cliente, nunca encerra por tempo, encerramento manual com motivo | **Provisório** | App volta ao restaurante, cliente em duas mesas, comanda encerrada sem rastro |

| [022](ADR-022-motor-de-eventos-e-tarefas.md) | Motor de eventos e tarefas: uma linha por tarefa, Gerente junto, sem subida por tempo | **Provisório** | Tarefa duplicada; ninguém avisado |
| [023](ADR-023-pg-cron.md) | `pg_cron` com um tick por minuto (substitui "não há pg_cron" dos ADR-011, 013, 021) | Aceito | Expiração só quando alguém abre a tela |
| [024](ADR-024-estados-unicos.md) | Estados únicos de item, pedido, comanda e mesa | **Provisório** | Cada perfil com um nome para a mesma coisa |
| [025](ADR-025-varias-funcoes-e-permissoes-reduzidas.md) | Várias funções por pessoa e permissões reduzidas | **Provisório** | Permissão só na tela, sem RLS |
| [026](ADR-026-atribuicao-de-mesa-e-garcom.md) | Atribuição automática de mesa e garçom | **Provisório** | Mesa sem garçom; conflito com reserva |
| [027](ADR-027-servicos-multiplos-e-fine-por-reserva.md) | Vários serviços sem "primário"; Fine só por reserva (substitui parte do ADR-008) | **Provisório** | Fine sem trava de entrada |
| [028](ADR-028-expedicao-e-conferencia-do-quick.md) | Expedição opcional; conferência do Quick vira a Expedição ligada (ajusta o ADR-013) | **Provisório** | Quick sem conferência por engano |
| [029](ADR-029-taxa-gorjeta-rateio-e-caixa.md) | Retenção, rateio e caixa; no-show, Tap e limite de quebra seguem em aberto | Aceito em parte | Rateio fora da convenção; caixa sem controle |
| [031](ADR-031-modelo-comercial-noowe-pay.md) | Parâmetros NOOWE em tabela, taxa única por meio de pagamento, split em valor fixo, assinatura e créditos | Aceito no formato | Taxa no código; restaurante pagando mais que a taxa |
| [032](ADR-032-saldo-unico-e-taxa-opcional.md) | Saldo único de consumo; taxa ou gorjeta por pagamento e opcional (substitui parte do ADR-010) | Aceito na regra | Centavo perdido ao combinar divisões |

**Série O (022–029):** originada na avaliação de 28/10; perguntas ao autor em [`PENDENCIAS-perfis-workflows`](PENDENCIAS-perfis-workflows.md).
**031 e 032** vêm do [`aditivo comercial`](../spec/aditivo-comercial-e-pagamentos.md) de 03/11. O ADR-030 (fiscal) está em branch, fora desta árvore.

**Vocabulário:** os ADRs usam os nomes da spec. A tradução para o banco está em
[`docs/arquitetura/05-glossario-spec-banco.md`](../arquitetura/05-glossario-spec-banco.md).

**Pendente de revisão humana:** ADR-016 (fila ativa e walk-in no Casual), ADR-017 (seletor de experiência), ADR-018 (troca e junção de mesas), ADR-019 (código de convite), ADR-021 (comanda como casa) e ADR-013 (valores de timeout, Pix e distância do Quick Service, a confirmar com
o cliente).
