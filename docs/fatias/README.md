# Fatias de implementação

## Por que o backlog não segue a ordem do documento

A spec está organizada para leitura humana: introdução → arquitetura → Fine Dining → Casual
Dining → Quick Service → comparativo. Nessa ordem, **os capítulos 3, 4 e 5 descrevem a mesma
funcionalidade três vezes** — split de conta aparece em §3.4 e §4.4, QR de mesa em §3.4 e
§4.1, fidelidade em três lugares.

Implementar capítulo a capítulo constrói o mesmo motor três vezes, com três divergências
sutis. As fatias abaixo reorganizam o mesmo conteúdo por **unidade de trabalho**: cada
funcionalidade aparece uma vez só, com as variações por modelo tratadas como configuração.

## Grafo de dependências

```
F1 Tenancy, papéis e RLS
 └─ F2 Dinheiro, auditoria, idempotência
     └─ F3 Configuração e capabilities
         ├─ N1 Cardápio, estações, disponibilidade
         │   └─ N2 Pedido, itens, máquina de estado
         │       ├─ N3 KDS e tempo real
         │       └─ N4 Pagamento e fiscal
         │           └─ Q1 Quick Service ────────────── (independe do motor de grupo)
         ├─ E1 Reservas ─────────┐
         ├─ E2 Fila virtual ─────┴─ G1 Sessão de mesa, QR e check-in
         │                            ├─ G2 Convite por link e capacidade
         │                            │   └─ G3 Divisão de conta e pagamento parcial
         │                            ├─ G2b Convite por @username com aceite
         │                            ├─ S1 Chamados e ações do garçom
         │                            ├─ C1 Casual: família, aniversário, festas
         │                            └─ D1 Fine: harmonização, sommelier, níveis
         └─ P1 Fidelidade
             └─ P2 Avaliação, CRM e relatórios
```

**A dependência menos óbvia, e a mais importante:** `G1` depende de `E1` **ou** `E2`. Uma
sessão de mesa só pode abrir com origem de entrada rastreável — reserva ou posição de fila
(ADR-008, invariante 2 do modelo de dados). Implementar o QR de mesa antes de existir qualquer
porta de entrada produz um check-in que a constraint do banco vai rejeitar.

## Índice

| # | Fatia | Modelos | Depende de |
|---|---|---|---|
| [F1](F1-tenancy-papeis-rls.md) | Tenancy, papéis e RLS | Todos | — |
| [F2](F2-dinheiro-auditoria-idempotencia.md) | Dinheiro, auditoria e idempotência | Todos | F1 |
| [F3](F3-config-capabilities.md) | Configuração e capability flags | Todos | F1, F2 |
| [N1](N1-cardapio-estacoes.md) | Cardápio, estações e disponibilidade | Todos | F3 |
| [N2](N2-pedido-maquina-de-estado.md) | Pedido, itens e máquina de estado | Todos | N1 |
| [N3](N3-kds-tempo-real.md) | KDS e tempo real | Todos | N2 |
| [N4](N4-pagamento-fiscal.md) | Pagamento e fiscal | Todos | N2, F2 |
| [E1](E1-reservas.md) | Reservas | Fine, Casual | F3 |
| [E2](E2-fila-virtual.md) | Fila virtual e consumo na espera | Fine, Casual | F3, N2 |
| [G1](G1-sessao-qr-checkin.md) | Sessão de mesa, QR e check-in | Fine, Casual | E1 ou E2 |
| [G2](G2-convite-capacidade.md) | Convite por link e capacidade | Fine, Casual | G1 |
| [G2b](G2b-convite-por-username.md) | Convite por @username com aceite (ADR-011) | Fine, Casual | G1 |
| [G3](G3-split-pagamento-parcial.md) | Divisão de conta e pagamento parcial | Fine, Casual | G2, N4 |
| [G4](G4-comanda-casa.md) | Comanda como casa do cliente (ADR-021) | Fine, Casual | G1, G2, G3, E1, E2, S1 |
| [S1](S1-chamados-acoes-garcom.md) | Chamados e ações do garçom na mesa | Fine, Casual | G1 |
| [Q1](Q1-quick-service.md) | Quick Service completo | Quick | N4 |
| [C1](C1-casual-familia-festas.md) | Modo família, aniversário e festas | Casual | G1 |
| [D1](D1-fine-harmonizacao-sommelier.md) | Harmonização, sommelier e níveis | Fine | G1, S1 |
| [P1](P1-fidelidade.md) | Fidelidade (pontos, níveis, selos) | Todos | N4 |
| [P2](P2-avaliacao-crm-relatorios.md) | Avaliação, CRM e relatórios | Todos | P1 |

## Série O — orquestração da operação (aditivo de 28/10/2026)

Origem: [`docs/spec/aditivo-perfis-e-workflows.md`](../spec/aditivo-perfis-e-workflows.md). Ordem: O0 → O1 → O2 → {O3, O7} → O4, O5 → O6, O8, O9 → O10.
Pendências do autor em [`PENDENCIAS-perfis-workflows`](../decisoes/PENDENCIAS-perfis-workflows.md); **O8 só começa depois das respostas 19, 20 e 27**.

| # | Fatia | Depende de |
|---|---|---|
| [O0](O0-correcoes-e-hold.md) | Correções imediatas e hold | — |
| [O1](O1-estados-unicos.md) | Estados únicos | O0 |
| [O2](O2-motor-de-eventos.md) | Motor de eventos e tarefas | O1 |
| [O3](O3-funcoes-e-escala.md) | Várias funções e escala | O2 |
| [O4](O4-paineis-ao-vivo.md) | Painéis ao vivo | O2, O3 |
| [O5](O5-atribuicao-automatica.md) | Atribuição automática de mesa e garçom | O3 |
| [O6](O6-portas-de-entrada.md) | Portas de entrada por serviço | O2, O5 |
| [O7](O7-cozinha-e-balcao.md) | Cozinha, Expedição e Balcão | O1, O2 |
| [O8](O8-caixa-e-gorjeta.md) | Caixa e gorjeta | O2, O3, G5 |
| [O9](O9-central-de-configuracao.md) | Central de Configuração | O5–O8 |
| [O10](O10-inteligencia-operacional.md) | Inteligência operacional | O5–O7 |

## Série M — modelo comercial e pagamentos (aditivo de 03/11/2026)

Origem: [`docs/spec/aditivo-comercial-e-pagamentos.md`](../spec/aditivo-comercial-e-pagamentos.md). Valores provisórios; o formato está decidido.

| # | Fatia | Depende de |
|---|---|---|
| [M1](M1-parametros-noowe.md) | Parâmetros NOOWE | — |
| [G5](G5-saldo-unico.md) | Saldo único e taxa ou gorjeta opcional | G3, G4 |
| [M2](M2-taxa-noowe-pay.md) | Taxa NOOWE Pay, split e extrato | M1, N4, spike |
| [M3](M3-taxa-de-conveniencia.md) | Taxa de conveniência | M1, M2, Q1 (ligar: contador) |
| [M4](M4-assinatura.md) | Assinatura e Módulos e plano | M1, O3 + resposta 35 |
| [M5](M5-creditos-noowe-pay.md) | Créditos NOOWE Pay | M2, M4 |
| [M6](M6-codigos-promocionais.md) | Códigos promocionais NOOWE | M4, M5 |
| [P3](P3-cupons-do-restaurante.md) | Cupons do restaurante | G5, P2, O3 |
| [V1](V1-vale-refeicao.md) | Vale-refeição | G5, M2 |
| [T1](T1-tap-to-pay.md) | Tap to Pay pronto para ativar | G5, M2, O8 (critério 1: nada) |

## Andamento (04/11/2026)

| Fatia | Situação |
|---|---|
| O0, O1, O2, M1 | Feitas, no GitHub e no banco Noowe |
| T1 (critério 1) | Tap oculto nos dois apps e recusado no servidor. O restante da T1 espera o fornecedor |
| Respostas 31 e 32 | QR com a comanda aberta e Dono sem aprovação, no banco e no código |
| M1, segunda carga | Business 8.000, conveniência desligada, teste, plano sugerido, empresa e Tap em parâmetro |
| O3 | Feita, no GitHub e no banco Noowe. Falta conferir as telas no simulador |
| G5 | Feita, no GitHub e no banco Noowe. Falta conferir as telas no simulador |
| N4, estorno real | Estorno com aprovação chega ao Asaas por uma fila, e o cancelamento fiscal acompanha. No banco e nas funções. Sem teste contra o sandbox do Asaas e a homologação da Focus |
| O8 | Feita, no GitHub e no banco Noowe. Falta conferir as telas no simulador |
| M2 | Feita, no GitHub e no banco Noowe. Spike no sandbox registrado no ADR-031. Estorno de Pix com split sem observação |
| M3 | Feita e desligada: a taxa fica em R$ 0 até o contador confirmar (pendência 38) |
| V1 | Maquininha da casa: feita. Online e por aproximação dependem do provedor; o Asaas não aceita vale online (ADR-031) |
| T1 | Pronto e desligado: fornecedor entra por parâmetro e pela camada em `functions/_shared/tap`. Falta o contrato e o SDK |
| M4 | Assinatura, teste de 30 dias, troca de plano, uso e faturas, no banco e na tela. Falta a chave raiz do Asaas e o token do webhook nas funções, e os dados da empresa para a nota (pendência 34) |
| M5, M6 | Créditos e códigos, no banco e na tela |
| P3 | Cupons no banco e nas telas: 3 passos, painel com status e relatório, link e QR, visíveis na página, aplicar no app e na comanda, com o mínimo da P2 (grupos da ficha). O link depende de `/c/*` no arquivo de universal links do site noowebr.com |

## Correspondência com o faseamento da spec (§8)

| Fase da spec | Fatias |
|---|---|
| Fase 1 — Base | F1, F2, F3, N1, N2, N3, N4, e o mínimo de G1 |
| Fase 2 — Diferenciação | E1, E2, G1, G2, G3, Q1, S1 |
| Fase 3 — Inteligência | C1, D1, P1, e a capacidade por janela de Q1 |
| Fase 4 — Gestão | P2 |

## O backlog executável

Estas fatias definem **escopo e critério de aceite**. O que efetivamente falta implementar, medido
contra o repositório em `bbd69c5`, está quebrado em tarefas em **[`docs/tarefas/`](../tarefas/README.md)** —
161 itens, cada um ligado a uma fatia, a uma seção da spec e à evidência do gap em `arquivo:linha`.
A leitura útil é: fatia para saber o que a spec exige, tarefa para saber o que fazer a seguir.

## Como cada fatia está escrita

- **Objetivo** — o que passa a existir ao final, em uma frase.
- **Spec** — as seções da spec que a fatia cobre. Ler antes de começar.
- **Entregáveis** — separados em banco, servidor e app, porque em Supabase a ordem importa.
- **Critérios de aceite** — copiados da spec quando existem, cada um vira um teste.
- **Fora de escopo** — o que *não* fazer aqui, para a fatia não crescer.

Fatia sem teste para cada critério de aceite listado não está pronta.
