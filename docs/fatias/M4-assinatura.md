# M4 — Assinatura e área Módulos e plano

**Objetivo:** o Dono vê plano, uso e faturas e troca de plano sozinho; recursos vêm do plano.
**Depende de:** M1, O3, respostas 23–26 e 28 · **Spec:** aditivo item C · **ADRs:** 031

## Critérios de aceite
1. Telas: Meu plano, Uso do mês, Comparar e trocar, Cobrança, Módulos extras e Cancelar. Só o Dono altera.
2. Recurso fora do plano some para os perfis operacionais e aparece com cadeado só para o Dono; a regra vale no servidor.
3. Upgrade vale na hora, com diferença proporcional; downgrade só no ciclo seguinte (no anual, na renovação).
4. Anual equivale a 10 meses, sem reembolso no cancelamento; excedente e módulos seguem mensais.
5. Excedente de pedidos calculado no servidor e previsto na tela.
6. Aviso 30 dias antes da renovação, no preço vigente.
7. Inadimplência: aviso, tolerância, saída da busca e suspensão de pedidos, com prazos da tabela.
8. **Nunca** bloqueia comanda aberta; dados e exportação seguem acessíveis.
