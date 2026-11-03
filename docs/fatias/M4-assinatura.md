# M4 — Assinatura e área Módulos e plano

**Objetivo:** o Dono vê plano, uso e faturas e troca de plano sozinho; recursos vêm do plano.
**Depende de:** M1, O3, resposta 35 · **Emissão depende de:** resposta 34 · **Spec:** aditivo item C · **ADRs:** 031

## Critérios de aceite
1. Telas: Meu plano, Uso do mês, Comparar e trocar, Cobrança, Módulos extras e Cancelar. Só o Dono altera.
2. Recurso fora do plano some para os perfis operacionais e aparece com cadeado só para o Dono; a regra vale no servidor.
3. Upgrade vale na hora, com diferença proporcional; downgrade só no ciclo seguinte (no anual, na renovação).
4. Anual equivale a 10 meses, sem reembolso no cancelamento; excedente e módulos seguem mensais.
5. Excedente de pedidos calculado no servidor e previsto na tela.
6. Aviso 30 dias antes da renovação, no preço vigente.
7. Inadimplência: aviso, tolerância, saída da busca e suspensão de pedidos, com prazos da tabela.
8. **Nunca** bloqueia comanda aberta; dados e exportação seguem acessíveis.
9. Pedido na franquia é cada envio à cozinha ou ao bar; espera da fila e Quick contam 1 cada; cancelado não conta.
10. Enterprise aparece como "Sob consulta", com o botão "Falar com a NOOWE", e o preço de contrato vem dos parâmetros do restaurante.
11. Todo restaurante passa pela etapa "Escolha seu plano": no cadastro, ou no próximo acesso do Dono se já estiver ativo. A sugestão por tipo de serviço vem de parâmetro.
12. Sem código, são 30 dias de teste (parâmetro) no plano escolhido, sem cartão, e o Dono é avisado antes do fim para escolher a forma de pagamento.
13. A fatura sai pela conta Asaas da NOOWE, com NFS-e automática vinculada à cobrança.
