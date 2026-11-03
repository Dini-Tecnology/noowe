# O4 — Painéis ao vivo

**Objetivo:** a primeira aba de cada perfil é a lista de tarefas; Dono e Gerente têm Operação ao vivo.
**Depende de:** O2, O3 · **Spec:** aditivo §1.3, §1.4, §1.6, §5 · **ADRs:** 022, 025

## Critérios de aceite
1. A primeira aba de cada perfil lista tarefas do momento, não contadores, e mostra só o que pede ação.
2. Ação em um toque, também pela notificação.
3. Dono vê qualquer tela em leitura; Gerente age conforme as permissões.
4. Gerente vê as tarefas paradas há mais tempo no topo, com assumir e redirecionar.
5. Cor indica estado e som ou vibração indica prioridade.
6. Barras inferiores conforme o aditivo (Garçom: Ao Vivo · Minhas Mesas · Cobrar · Mais).
7. O QR funciona com a comanda aberta, em qualquer estado da mesa; "Conta pedida" e "Pagamento parcial" são só informativos no mapa (resposta 31, pendência 33). Pode ser entregue antes do painel.
