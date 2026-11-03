# O1 — Estados únicos

**Objetivo:** item, pedido, comanda e mesa têm um só conjunto de estados em todos os perfis e nos dois apps.
**Depende de:** O0 · **Spec:** aditivo §1.1 · **ADRs:** 024 · **Invariante:** 5

## Entregáveis
- **Banco:** enums novos de item; trigger `private.derive_order_status` (fecha T-N2-01); `CHECK` em `tables.status`; fim das escritas diretas em `orders.status`; mesa vai a Limpeza ao pagar.
- **Apps:** módulo único `statusLabel` nos dois apps; "Em preparo" automático; fora o botão "Iniciar".
- **Ficou fora:** mesa ir sozinha a Conta pedida e Pagamento parcial (pendência 31). Telas antigas fora de `screens/v2` e `screens/production` não foram migradas: não são usadas.

## Critérios de aceite
1. Pedido só fica `ready` quando todos os itens de todas as estações estão prontos.
2. Nenhuma função escreve `orders.status` à mão (varredura 03 atualizada).
3. Todos os perfis exibem os mesmos rótulos para o mesmo estado.
4. Pagar 100% da comanda leva a mesa a Limpeza, e liberar é ação do garçom.
5. Item entra em preparo sozinho ao aparecer na estação.
