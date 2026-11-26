# Decisões pendentes do QA de 25/11 — para o Pedro

Cada item trava uma correção. Responda com a letra escolhida (ou outra resposta).

1. **PAG-07 — Pix de valor baixo.** Num Pix de R$ 35,20 a taxa NOOWE (0,99%) é R$ 0,35 e a tarifa do Asaas é R$ 0,99 fixa; o restaurante paga 2,8%.
   (a) a NOOWE absorve a diferença; (b) o restaurante paga a tarifa real; (c) valor mínimo para Pix.
   Em qualquer caso o extrato do Dono passa a mostrar o líquido real.
2. **RV-05 — Quick abaixo do valor mínimo online.** Hoje o app só avisa. Criar o pedido como "Pague no balcão" (aguardando confirmação do caixa)? (sim/não)
3. **RV-01 / RV-18 — provedor e ambiente do Pix.** Pix fica só no Asaas por ora, ou já parametrizar outro provedor? A trava "restaurante real nunca em sandbox" bloqueia a cobrança ou só avisa?
4. **RV-04, RV-06, RV-08** — confirmar as respostas de 07/11: tarefa para devolver Pix sem saldo; excedente na fatura do mês; cupom FUNDADOR com validade e limite (quais valores?).
5. **CPFs salvos sem consentimento antes de 26/11.** Hoje estão guardados e escondidos do cliente. (a) apagar; (b) manter só para a nota da conveniência; (c) pedir consentimento no próximo pagamento.
6. **SG-04 — cupom oculto ou direcionado.** Pode ser listado por outra conta? (esperado: não)
7. **Projeto de produção.** Só existe o projeto Supabase `eplivpvqemowmbivhfpx`, que o QA usa com os atalhos de teste ligados. (a) criar um projeto separado de produção; (b) desligar os atalhos neste projeto no go-live.
8. **Apple Pay / Google Pay (PAG-03).** O Asaas não documenta carteira digital. (a) perguntar ao suporte do Asaas; (b) usar outro provedor só para carteiras (ex.: Mercado Pago); (c) adiar.
9. **Cartão salvo por restaurante.** O Asaas guarda o cartão na subconta de cada restaurante: o cartão salvo no restaurante A não serve no B. Aceitar assim, ou centralizar a tokenização na conta da NOOWE?
10. **Liberação de tokenização no Asaas.** Precisa ser pedida ao Asaas para cada subconta. Quem pede?
11. **Cortesia pelo app.** Nenhuma tela pede cortesia hoje (o servidor já aceita). Quem pede — garçom, gerente? Quem aprova?
12. **LGPD** (docs/LGPD-REVALIDACAO-2026-11-26.md): plano de resposta a incidentes não existe; rotina de exclusão após 30 dias não existe; aceite dos Termos não é registrado com versão e data. Priorizar antes da release?
13. **Bloqueios externos:** credenciais de homologação da NotaAS, iPhone real para push/câmera, build Android.
