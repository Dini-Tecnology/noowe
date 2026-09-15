# NOOWE — contexto permanente do projeto

> Este arquivo entra em contexto em **toda** sessão do Claude Code. Ele contém apenas o que
> não pode ser esquecido em nenhum arquivo do repositório. O detalhe está em `docs/`.

## O produto em uma frase

Plataforma de restaurantes com três camadas conectadas em tempo real — **app do cliente**
(React Native), **painel de operação** e **KDS** — sobre um núcleo único no Supabase.

## A regra estrutural que governa todo o código

**Não existem três produtos. Existe um núcleo com três configurações.**

Fine Dining, Casual Dining e Quick Service compartilham cardápio, pedido, KDS, pagamento,
fiscal e fidelidade. O que muda é **quais módulos ficam ativos** e **quais regras de
fechamento se aplicam**. Fine Dining é o superconjunto; Quick Service é o subconjunto
transacional.

Consequência prática, e isto é obrigatório:

```ts
// ERRADO — proíbe reuso e espalha o modelo de serviço por toda a UI
if (restaurant.serviceModel === 'fine_dining') { ... }

// CERTO — a capacidade é lida de configuração
if (capabilities.guestLinkEnabled) { ... }
```

Nenhum componente, hook ou função de domínio pode ramificar por `service_model`. Ramifica-se
por **capability flag** derivada de `establishment_config`. Ver `docs/arquitetura/03-config-service-model.md`.

## Invariantes inegociáveis

Estas regras não são preferências de estilo. Violá-las é um bug, mesmo que os testes passem.

1. **Dinheiro é `bigint` em centavos.** Nunca `float`, nunca `numeric` com casas decimais,
   nunca `Number` de JS carregando reais. Formatação para exibição acontece só na borda da UI.

2. **O servidor calcula todo valor cobrado.** O app React Native exibe valores, nunca os
   determina. Preço, taxa de serviço, desconto de combo e divisão de conta são calculados em
   RPC/Edge Function do Supabase. Um total vindo do cliente é sempre recalculado e conferido.

3. **Uma mesa tem no máximo uma sessão aberta.** Garantido por índice único parcial no
   Postgres, não por `if` na aplicação. QR físico e link de convite **entram na sessão
   existente** — nunca criam uma segunda comanda para a mesma mesa.

4. **A soma das parcelas é exatamente igual ao total.** Em qualquer um dos 4 modos de divisão,
   sem centavo perdido nem criado. Existe teste de propriedade para isto (ver ADR-001).

5. **O status do pedido é derivado dos itens, nunca escrito à mão.** Um pedido só é `ready`
   quando todos os itens de todas as estações estão prontos. Cozinha e bar são roteados em
   paralelo e reconvergem na expedição.

6. **Nenhum pedido entra em produção sem pagamento confirmado, em Quick Service.** O gatilho é
   o webhook do provedor, não a tela de sucesso do app.

7. **Estouro de capacidade nunca é silencioso.** Entrada acima de `tables.seats` vira
   solicitação pendente para o maitre — jamais recusa muda nem aprovação automática.

8. **Toda ação sensível deixa rastro.** Cancelamento, cortesia, estorno, desconto, reabertura
   de conta e exceção de lotação gravam autor, motivo e horário em `audit_log`, na mesma
   transação da ação.

9. **RLS ligado em toda tabela de negócio.** Garçom vê as próprias mesas, gerente vê a unidade,
   dono vê todas as unidades. O Realtime do Supabase respeita RLS: política errada vaza dado
   entre estabelecimentos. Não existe tabela de negócio com `RLS disabled`.

10. **Criação de pedido e pagamento são idempotentes.** Chave de idempotência obrigatória; o
    reenvio de requisição não pode gerar segundo pedido nem segunda cobrança.

## Onde está o quê

| Preciso de… | Leia |
|---|---|
| A especificação original, íntegra | `docs/spec/NOOWE-spec-v2.md` |
| Os fluxogramas em texto (Mermaid) | `docs/spec/fluxos.md` |
| Esquema de dados e constraints | `docs/arquitetura/01-modelo-de-dados.md` |
| Realtime, canais e políticas RLS | `docs/arquitetura/02-realtime-e-rls.md` |
| Flags por estabelecimento | `docs/arquitetura/03-config-service-model.md` |
| Regras de dinheiro e arredondamento | `docs/arquitetura/04-calculo-financeiro.md` |
| Decisões de produto já tomadas | `docs/decisoes/ADR-*.md` |
| O que implementar e em que ordem | `docs/fatias/README.md` |

## Como trabalhar neste repositório

- **Uma fatia por vez.** Cada arquivo em `docs/fatias/` é uma unidade fechada com escopo,
  dependências e critérios de aceite. Não comece uma fatia bloqueada.
- **Reconciliar antes de escrever.** Este repositório já tem um MVP parcial. Antes de
  implementar qualquer fatia, verifique o que já existe — o procedimento está em
  `docs/01-RECONCILIACAO.md`. Nunca reescreva o que já funciona e atende à spec.
- **Critério de aceite vira teste.** Cada critério listado numa fatia precisa de um teste
  correspondente. Fatia sem teste do critério não está pronta.
- **Divergência da spec é decisão, não improviso.** Se o código existente contradiz a spec,
  pare e registre a divergência para decisão humana; não escolha em silêncio.
- **`ADR PROVISÓRIO` significa revisão pendente.** Os ADRs 001–008 têm defaults propostos que
  ainda não foram aprovados pelo time. Implemente o default, mas isole a regra numa função
  única e nomeada, para que trocá-la depois seja uma mudança de uma linha.

## Convenção de valores

Todo número citado na spec (10% de taxa de serviço, 20% de desconto de combo, 10 selos, tempos
de tolerância) é **parametrização atual**, não constante de código. Todos vivem em
`establishment_config`. Um literal numérico de regra de negócio no código-fonte é bug.
