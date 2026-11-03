# Aditivo à spec v2 — Modelo comercial, taxas e pagamentos

**Origem:** resposta às pendências de perfis e workflows, recebida em 03/11/2026. Texto íntegro abaixo.
**Status:** decisão de produto. **Os valores são provisórios** (em negociação com o Asaas); o formato está definido.
**Decisões técnicas derivadas:** [ADR-031](../decisoes/ADR-031-modelo-comercial-noowe-pay.md),
[ADR-032](../decisoes/ADR-032-saldo-unico-e-taxa-opcional.md),
[ADR-029](../decisoes/ADR-029-taxa-gorjeta-rateio-e-caixa.md), [ADR-004](../decisoes/ADR-004-reversao-de-pagamento-parcial.md).
**Perguntas em aberto:** [`PENDENCIAS-perfis-workflows`](../decisoes/PENDENCIAS-perfis-workflows.md), itens 17 em diante.
**Backlog:** fatias G5, M1–M6, P3 e V1 em [`docs/fatias`](../fatias/README.md).

---

Importante: ainda estamos negociando as taxas com o Asaas. O FORMATO abaixo está definido, mas os percentuais e valores podem mudar. Por isso, toda taxa, faixa, preço e prazo precisa vir de uma tabela de parâmetros no banco, e não ficar fixo no código (detalhe no item H). Não é tela nova: é só ler os valores da tabela, para cada ajuste nosso virar troca de valor, sem nova versão do app.

## 1) Taxa de serviço ou gorjeta: a taxa deixa de ser automática?

Sim, confirmado.

- O restaurante escolhe, por tipo de serviço, se usa taxa de serviço OU gorjeta. Nunca as duas na mesma conta.
- Taxa de serviço: percentual fixo do restaurante (ex.: 10%). Vem marcada no total, como linha separada "Taxa de serviço (opcional) – 10%", e o cliente retira com um toque. Padrão sugerido para o Fine.
- Gorjeta: o cliente escolhe entre os percentuais sugeridos (10%, 15%, 20%) ou digita um valor livre. Vem pré-selecionada no padrão do restaurante e pode ser alterada ou zerada. Padrão sugerido para o Casual.
- Quick Service: gorjeta opcional, sem pré-seleção.
- O valor aparece sempre separado do consumo (resumo, recibo e relatórios).
- Na divisão de conta, cada pessoa paga a taxa ou a gorjeta sobre a própria parte. Quem retira a taxa, retira só da parte dele.
- Na cobrança presencial (Tap to Pay ou dinheiro), o garçom pode desmarcar a taxa a pedido do cliente, sem aprovação, e fica registrado.
- Taxa de serviço e gorjeta entram juntas na apuração de gorjetas da equipe.
- Quem configura: Dono e Gerente (Central → Pagamentos e caixa).

## 2) Retenção e rateio da gorjeta: precisa do contador? Quem escolhe?

O app só oferece a configuração. Quem escolhe são o Dono e o Gerente, e quem valida é o contador do restaurante (a regra vem da convenção coletiva de cada um). A tela mostra o aviso: "Confirme estes valores com seu contador e com a convenção coletiva da categoria".

- Regime tributário: acrescentar este campo no Perfil do Restaurante (Simples Nacional ou outros).
- Percentual retido: de 0% até o teto do regime, com o app limitando o teto (20% no Simples, 33% nos demais). Padrão: 0%.
- Modo de rateio:
  - Igualitário (entre todos do turno). É o padrão.
  - Por pontos (peso por função, configurado na mesma tela).
  - Por horas (pela escala ou pelo registro de entrada e saída).
- Pessoa com mais de uma função entra no rateio pela função em que está escalada no turno.
- Toda alteração fica registrada e vale a partir do próximo dia operacional, nunca retroativa.
- O app calcula no fechamento do dia, mostra o extrato a cada funcionário e gera o relatório para a folha. O app NÃO paga a gorjeta: o repasse continua na folha do restaurante.

## 3) Reabrir comanda paga sem estorno automático: pode manter?

Pode, sem estorno automático.

- Reabrir exige motivo e aprovação.
- Os pagamentos feitos continuam valendo. Se for para acrescentar itens, só a diferença fica em aberto.
- Se for para corrigir ou remover item já pago, o estorno é uma ação separada ("Estornar valor"), parcial ou total, também com aprovação. Nunca automático.
- Só no mesmo dia operacional, antes do fechamento do caixa.
- Se a mesa já estiver ocupada, a comanda reabre sem mesa (comanda avulsa).
- Tudo fica no log.
- Quem pede: Garçom (mesas dele), Maître e Gerente.
- Quem aprova: Gerente e Dono recebem ao mesmo tempo, e quem decidir primeiro conclui. Ninguém aprova o próprio pedido (se o Gerente pediu, só o Dono ou outro Gerente aprova).

## 4) Divisão por item seguida de valor fixo: manter a recusa?

Sim, quando a conta está 100% paga. Mas vale a regra geral de divisão que vai nos acréscimos (item A), porque ela cobre todas as combinações.

## 5) Qual o percentual da NOOWE?

Mudamos o formato: em vez de "tarifa Asaas + comissão NOOWE", o restaurante vê UMA taxa só por meio de pagamento, tudo incluso, no nível da maquininha. A NOOWE paga o gateway e fica com a diferença.

Valores provisórios (em negociação):

- Crédito pelo app: 3,49%
- Débito pelo app: 1,49%
- Pix pelo app: 0,99%
- Vale-refeição pelo app ou por aproximação no Tap: taxa própria, nunca acima de 3,6% (teto legal; ver item I)
- Tap to Pay (cartão comum): taxa do fornecedor do Tap, sem acréscimo da NOOWE
- Dinheiro e maquininha da casa (inclusive vale passado nela): nada, só o registro na comanda

A Taxa NOOWE Pay NÃO aparece para o cliente em nenhuma tela. É custo do restaurante, como a taxa da maquininha, e só aparece no extrato do Dono. O cliente paga o preço do cardápio + taxa de serviço ou gorjeta (e a taxa de conveniência, só no Quick e no agendado; ver item B).

## 6) O percentual é o mesmo para todos?

Sim, a mesma tabela para todos os restaurantes e planos. O plano muda a mensalidade, não a taxa. Na tabela de parâmetros, a taxa fica por meio de pagamento, com um padrão geral e a possibilidade de valor específico por restaurante (para contratos negociados). Quem altera é a equipe NOOWE, direto na tabela. O Dono vê a taxa vigente no Financeiro.

## 7) Sobre qual valor incide?

Sobre o valor total de cada pagamento, igual à maquininha (consumo + taxa de serviço ou gorjeta). O relatório de gorjetas mostra separadamente a parte da taxa que corresponde à gorjeta, para o restaurante tratar com o contador.

## 8) Quem arca com a tarifa do Asaas?

Está dentro da taxa única.

- A cobrança é criada na subconta do restaurante (o dinheiro do restaurante nunca passa pela conta da NOOWE).
- O Asaas desconta a tarifa dele, e o backend manda o split para a NOOWE em VALOR FIXO calculado em cada cobrança: split NOOWE = (taxa NOOWE Pay × valor pago) − tarifa real cobrada pelo Asaas.
- Exemplo com a tarifa pública: crédito de R$ 110 → taxa NOOWE Pay 3,49% = R$ 3,84; tarifa Asaas R$ 3,78; split NOOWE R$ 0,06; o restaurante recebe R$ 106,16. Com a tarifa negociada, a diferença aumenta, e o restaurante continua pagando os mesmos 3,49%.
- Se a tarifa real passar da taxa NOOWE Pay (pagamentos muito pequenos, por causa da tarifa fixa do Asaas): split = 0, e a diferença fica registrada para a NOOWE compensar como crédito na mensalidade. O restaurante nunca paga mais que a taxa NOOWE Pay.
- Extrato do Dono: valor pago, taxa NOOWE Pay e líquido, por pagamento. A divisão interna (gateway e margem NOOWE) fica só nas consultas internas da NOOWE.
- Subconta, dados bancários e métodos de pagamento aceitos: só o Dono configura.

---

# Acréscimos

## A) Regra geral de divisão de conta

A comanda tem um saldo único. Qualquer forma de divisão só abate desse saldo, e dá para combinar as formas enquanto houver saldo.

As 4 formas:

- Meus itens: o que a pessoa pediu.
- Por item: quaisquer itens não pagos (um item pode ser dividido entre pessoas).
- Partes iguais: saldo restante ÷ pessoas que ainda não pagaram (o número pode ser ajustado).
- Valor fixo: qualquer valor até o saldo.

Regras:

1. Item pago em "Meus itens" ou "Por item" fica travado.
2. "Valor fixo" e "Partes iguais" abatem do saldo sem marcar itens. Depois deles, "Meus itens" e "Por item" continuam disponíveis, limitados ao saldo, com o aviso "Restam só R$ X nesta conta".
3. Valor acima do saldo é ajustado automaticamente para o saldo, e o app mostra o valor ajustado antes de confirmar.
4. Com saldo zero: "Esta conta já está quitada".
5. Dois pagamentos ao mesmo tempo: o valor fica reservado ao entrar no pagamento (no cartão, até aprovar ou falhar; no Pix, até expirar em 10 min). Falhou ou expirou, o valor volta ao saldo.
6. Taxa de serviço ou gorjeta é calculada sobre o consumo de cada pagamento, já com o desconto do cupom.
7. Cupom na conta dividida vale só para a parte de quem aplicou. Um cupom por pessoa por conta.
8. Pagamento misto (app, Tap, vale, dinheiro, maquininha) abate do mesmo saldo.
9. A comanda só encerra com saldo zero. Quem sai sem pagar deixa a parte dele para o titular, que é avisado ao abrir a comanda.

Quem configura quais das 4 formas ficam disponíveis: Dono e Gerente.

## B) Taxa de conveniência NOOWE (cobrada do cliente)

- Taxa explícita, cobrada pela NOOWE do cliente, com nota da NOOWE. Não faz parte do faturamento do restaurante.
- Vale só em fluxos de conveniência: pedido no Quick Service (retirada sem fila) e pedido agendado. NUNCA na conta do salão (Fine e Casual).
- Valor fixo por pedido, provisório R$ 0,99, definido na tabela de parâmetros (por fluxo, com possibilidade de valor por restaurante).
- O cliente vê uma linha separada, "Taxa de conveniência NOOWE – R$ 0,99", com um ícone de informação explicando o que é. Fica fora da base de taxa, gorjeta e cupom.
- Vai 100% para a NOOWE no split, somada ao split da taxa NOOWE Pay.
- O Dono pode ligar "Pagar a taxa de conveniência pelos meus clientes": o cliente não vê a taxa, e o valor é descontado do restaurante.
- Quem altera: valor e fluxos, a equipe NOOWE (parâmetros); assumir a taxa, só o Dono.

## C) Assinatura do restaurante (completar a área "Módulos e plano", onde já vai o Marketplace)

Hoje não existe tela de assinatura no app. O restaurante precisa ver o plano, o uso, os créditos e as faturas, e trocar de plano sozinho.

Planos (valores atuais, por unidade, todos vindos da tabela de parâmetros):

- Essencial: R$ 199/mês ou R$ 1.990/ano. 1.000 pedidos/mês; cardápio, pedido e pagamento no app; autoatendimento. Para cafés, food trucks e Quick.
- Profissional: R$ 349/mês ou R$ 3.490/ano. 3.000 pedidos/mês; tudo do Essencial + app do garçom com Tap to Pay, divisão de conta, reservas, fila e fidelidade; implantação assistida. Para Casual e bares.
- Business: R$ 649/mês ou R$ 6.490/ano. Franquia ampliada; tudo do Profissional + NFC-e, IA e integrações de delivery; suporte prioritário. Para Fine e redes.
- Enterprise: contrato, com gerente de conta.
- Pedido acima da franquia: R$ 0,15 cada.
- O que cada plano inclui também fica na tabela (recurso ligado ou desligado por plano), para os planos poderem mudar sem nova versão do app.

Mensal ou anual:

- Mensal: cobrança recorrente todo mês (cartão, Pix ou boleto).
- Anual: pagamento à vista (Pix, boleto ou cartão à vista), equivale a 10 meses (2 meses grátis). A tela mostra "Economize R$ X por ano" ao lado do valor.
- No anual, o excedente de pedidos e os módulos extras continuam cobrados mensalmente.
- Cancelamento do anual: sem reembolso; o serviço continua até o fim do período pago.
- Upgrade no meio do anual: cobra a diferença proporcional aos meses restantes. Downgrade só na renovação.
- Renovação automática, com aviso ao Dono 30 dias antes e no preço de tabela vigente.
- Passar de mensal para anual: a qualquer momento, valendo a partir da próxima fatura.
- Códigos promocionais valem só no mensal, a menos que o código diga que vale no anual.

Telas da área Módulos e plano:

- Meu plano: plano atual, mensal ou anual, valor, créditos que serão aplicados e data da próxima cobrança.
- Uso do mês: pedidos usados ÷ franquia (barra) e previsão de excedente.
- Créditos NOOWE Pay: acompanhamento completo (item D).
- Comparar e trocar de plano: planos lado a lado, com a chave Mensal / Anual. Upgrade vale na hora, cobrando a diferença proporcional; downgrade vale no próximo ciclo.
- Cobrança: forma de pagamento, faturas com nota da NOOWE para baixar e histórico.
- Código promocional: campo para aplicar um código NOOWE (item E).
- Módulos extras: os itens do atual Marketplace, com preço e ativação.
- Cancelar assinatura: com motivo, e exportação dos dados liberada.

Recurso fora do plano: fica oculto para os perfis operacionais. Só o Dono vê o recurso com um cadeado e o aviso "Disponível no plano Profissional", com o botão para trocar de plano.

Atraso no pagamento:

- aviso ao Dono no vencimento e durante uma tolerância (padrão 7 dias);
- depois disso, o restaurante sai da busca do app cliente;
- após 30 dias, os pedidos pelo app ficam suspensos, mantendo o acesso aos dados e à exportação;
- nunca bloquear operação em andamento (comandas abertas continuam até fechar);
- prazos vindos da tabela de parâmetros.

## D) Créditos NOOWE Pay (cashback em créditos na mensalidade)

Quanto mais o restaurante recebe pelo NOOWE Pay, mais crédito ele ganha para abater nas próximas mensalidades. A regra é conservadora porque o crédito sai da receita da NOOWE. Substitui o desconto direto na mensalidade que estava previsto antes.

Como o crédito é calculado:

- Índice NOOWE Pay do mês = valor pago pelo NOOWE Pay no app (cartão e Pix) ÷ faturamento registrado no app no mês. Vale-refeição fica fora dos dois lados da conta, seja pago pela NOOWE ou na maquininha (ver item I).
- O Tap to Pay só entra no índice quando estiver ligado o parâmetro "Tap conta para o índice" (padrão: desligado, até termos contrato com o fornecedor do Tap).
- Faixas (provisórias, na tabela de parâmetros):
  - Prata: índice a partir de 40% → crédito de 5% da mensalidade do plano.
  - Ouro: a partir de 60% → 10%.
  - Platina: a partir de 80% → 20%.
- Volume mínimo pago pelo NOOWE Pay no mês para ganhar crédito: Essencial R$ 8 mil, Profissional R$ 15 mil, Business R$ 30 mil.
- O percentual incide sobre o preço mensal de tabela do plano (no anual, sobre o equivalente mensal). Nunca sobre excedente ou módulos.
- O crédito é calculado no fechamento do mês, já descontados estornos e contestações.

Como o crédito é usado:

- Fica disponível para uso duas faturas depois de gerado (ex.: o crédito de novembro abate a fatura de janeiro). Nesse intervalo aparecem estornos e contestações.
- Abate no máximo 30% de cada fatura. O que sobra fica para as próximas.
- Vale só para a mensalidade do plano (não para excedente, módulos ou taxas).
- Expira em 6 meses.
- No plano anual, os créditos acumulam e abatem a renovação, com o mesmo limite de 30%, e expiram em 12 meses.
- Não vira dinheiro, não passa de uma unidade para outra e se perde se a assinatura for cancelada.
- Restaurante novo começa sem crédito: o primeiro é gerado no fechamento do primeiro mês completo.

Como o restaurante acompanha (tela "Créditos NOOWE Pay", dentro de Módulos e plano):

- Índice do mês em tempo real, numa barra com as marcas de 40%, 60% e 80%, e a faixa atual.
- Volume pago pelo NOOWE Pay no mês versus o mínimo do plano.
- Previsão de crédito do mês, caso o mês fechasse agora.
- Dica de quanto falta: "Se mais R$ 4.200 forem pagos pelo app este mês, você chega à faixa Ouro".
- Saldo de créditos disponíveis, créditos a liberar (com a data) e créditos a expirar nos próximos 30 dias.
- Extrato mês a mês: gerado, usado, expirado e em qual fatura foi aplicado.
- Notificações ao Dono: fechamento do mês (crédito gerado), crédito liberado, crédito perto de expirar e mudança de faixa.

## E) Códigos promocionais NOOWE (para a assinatura)

- Criados pela equipe NOOWE (um registro na tabela de códigos). Aplicados pelo Dono, no cadastro ou na tela Meu plano.
- Tipos: meses de isenção (ex.: 6 meses grátis para os parceiros fundadores), percentual de desconto por N meses (ex.: 50% por 6 meses) ou valor fixo por N meses.
- Regras de cada código: validade, limite total de usos, planos em que vale, mensal e/ou anual, só para restaurantes novos (sim ou não), um código por restaurante por vez.
- Com os créditos: durante a isenção total, o restaurante não gera crédito. Nos descontos parciais, gera normalmente, e os créditos entram depois do código, respeitando o limite de 30% e um piso mínimo de fatura.
- A tela mostra até quando o benefício vale e quanto o restaurante paga depois.

## F) Cupons do restaurante para os clientes (completar a tela "Promoções", que já existe no Gerente e hoje está vazia)

A ideia é o restaurante criar um cupom no dia a dia em menos de um minuto, sem precisar entender de regra.

Criação em 3 passos:

1. O que o cliente ganha: % de desconto, R$ de desconto ou item grátis (ex.: sobremesa grátis acima de R$ 100).
2. Onde e quando vale: serviços (Fine, Casual, Quick); conta inteira, categorias ou itens; dias da semana e horário (ex.: terça a quinta, 15h às 18h); pedido mínimo; data de início e de fim.
3. Para quem e quantas vezes: todos, só clientes novos, ou um grupo da ficha do cliente (VIP, aniversariantes do mês, sem visita há X dias); limite total de usos e limite por cliente; com código (gerado ou personalizado, ex.: TERCA10) ou automático (aplica sozinho quando a regra bate, sem código; resolve o happy hour simples).

Enquanto o restaurante preenche, a tela mostra a regra em uma frase, por exemplo: "10% de desconto em Bebidas, de terça a quinta, das 15h às 18h, no Casual, para clientes novos, 1 vez por cliente, até 30/11".

Modelos prontos para começar com um toque: Primeira visita, Happy hour, Aniversariante, Volte a nos visitar e Sobremesa grátis.

Divulgação:

- link e QR do cupom, para compartilhar em redes e WhatsApp e imprimir;
- cupons marcados como "visíveis" aparecem na página do restaurante no app;
- envio por notificação a um grupo da ficha, só para clientes que aceitaram receber ofertas.

Aplicação:

- O cliente aplica no resumo do pedido ou na hora de pagar; o cupom automático entra sozinho.
- Um cupom por pessoa por conta, sem somar com outro cupom (somar com outras promoções só se o restaurante marcar).
- O desconto entra antes da taxa de serviço ou gorjeta e aparece como desconto na nota fiscal do restaurante. O desconto é do restaurante: a taxa NOOWE Pay incide sobre o valor efetivamente pago.
- Cupom não precisa de aprovação, porque a regra já foi definida por quem criou. O desconto manual, fora de cupom, continua passando por aprovação.
- O garçom pode aplicar um cupom válido na comanda, a pedido do cliente sem app.
- Mensagem clara quando o cupom não vale: "Válido de terça a quinta, das 15h às 18h", "Pedido mínimo de R$ 80", "Você já usou este cupom".

Painel de cupons:

- Status: Ativo, Agendado, Pausado, Esgotado, Encerrado.
- Por cupom: usos, desconto concedido, faturamento das contas com cupom, ticket médio e clientes novos trazidos.
- Ações: pausar, duplicar e encerrar. Depois do primeiro uso, só dá para editar a validade e o limite de usos, para não mudar a regra de quem já recebeu.

Quem faz o quê:

- Criam, editam, pausam e encerram: Dono e Gerente.
- Veem os cupons ativos e aplicam na comanda: Garçom (mesas dele), Maître e Gerente.
- Chef, Cozinheiro e Barman não acessam (o KDS mostra só o item, sem o desconto).
- Relatório de cupons: Dono e Gerente.

## G) Quem configura, quem executa e o que cada perfil vê

Configurações:

- Equipe NOOWE (direto na tabela de parâmetros): planos e recursos por plano, preços mensal e anual, regras dos créditos, taxa NOOWE Pay, taxa de conveniência e códigos promocionais.
- Só o Dono: plano, mensal ou anual, troca de plano, forma de pagamento da assinatura, aplicar código promocional, métodos de pagamento aceitos (inclusive quais vales o restaurante aceita), subconta e dados bancários, assumir a taxa de conveniência pelos clientes.
- Dono e Gerente: taxa de serviço ou gorjeta por serviço, formas de divisão de conta, regime tributário, retenção e rateio da gorjeta, parâmetros do caixa e cupons.
- Toda alteração feita no app fica registrada (quem, quando, antes e depois).

Ações:

- Retirar a taxa ou ajustar a gorjeta: o cliente no app; o garçom na cobrança presencial, a pedido do cliente. Sem aprovação, com registro.
- Aplicar cupom: o cliente no app; Garçom, Maître e Gerente na comanda. Sem aprovação.
- Desconto ou cortesia manual, reabrir comanda paga e estornar: pedem Garçom, Maître, Gerente (e o Chef, no caso de item). Gerente e Dono recebem ao mesmo tempo, e ninguém aprova o próprio pedido.
- Cobrar no Tap (cartão ou vale por aproximação) ou receber dinheiro: Garçom (mesas dele), Maître e Gerente; Barman nas bebidas do Quick.
- Registrar pagamento na maquininha da casa (inclusive vale): mesmos perfis da linha acima.
- Sangria, reforço e fechamento do caixa e do dia: Gerente. Quebra acima do limite vai para o Dono.

O que cada perfil vê:

- Cliente: consumo, cupom, taxa ou gorjeta, taxa de conveniência (só no Quick e no agendado), total, a parte dele e o saldo. Não vê a taxa NOOWE Pay.
- Garçom: nas mesas dele, quem pagou, quanto e como; saldo; cupons ativos; dinheiro em mãos; Minha gorjeta; e o % das mesas dele pagas pelo app no turno (para incentivar o uso, sem valores da assinatura). Não vê taxas, caixa geral, gorjeta dos outros nem assinatura.
- Maître: status de pagamento das mesas e cupons ativos. Não vê valores detalhados, taxas nem assinatura.
- Chef, Cozinheiro e Barman: só Minha gorjeta (arrecadado, retido e a parte dele).
- Gerente: caixa do turno por forma de pagamento (valores líquidos), aprovações, gorjeta e rateio da equipe, cupons e relatório, plano atual, e o índice NOOWE Pay do mês com a faixa (para puxar o uso com a equipe). Não vê a taxa NOOWE Pay por pagamento, os valores em R$ dos créditos nem as faturas.
- Dono: tudo, em tempo real (caixa, aprovações, gorjeta, cupons, extrato com taxa NOOWE Pay e líquido, plano, uso, índice, créditos, faturas e códigos). Só não vê a divisão interna da taxa (gateway e margem NOOWE).
- Todo funcionário que entra no rateio vê o próprio extrato em "Minha gorjeta".
- Pessoa com mais de uma função vê a soma das permissões, e a regra de não aprovar o próprio pedido continua valendo.

## H) Parâmetros NOOWE (sem tela nova, só boa prática)

Não estamos pedindo painel administrativo agora. O pedido é só que os valores comerciais venham de uma tabela de parâmetros no banco (Supabase), e não fiquem como constantes no código. Assim, cada negociação com o Asaas ou mudança de plano vira troca de um valor na tabela: sem nova versão do app e sem nova demanda para você.

O que fica na tabela:

- Planos: preço mensal, desconto do anual, franquia, excedente e recursos de cada plano.
- Créditos NOOWE Pay: faixas, percentuais, volume mínimo por plano, limite de uso por fatura, prazo de liberação, validade e o parâmetro "Tap conta para o índice".
- Taxa NOOWE Pay por meio de pagamento (padrão e por restaurante), incluindo a linha do vale.
- Taxa de conveniência: valor e fluxos (padrão e por restaurante).
- Códigos promocionais (um registro por código, com as regras).
- Prazos de inadimplência.

Para fechar:

- Um documento curto "Como ajustar os parâmetros" (qual tabela, qual campo, exemplo), para nós alterarmos direto no banco com segurança.
- Os relatórios internos (margem por pagamento, diferenças a compensar, receita de conveniência, créditos gerados, usados, expirados e a liberar) podem ser consultas prontas no banco, sem tela.
- Uma tela de administração pode ficar como sugestão para uma fase futura, se fizer sentido.

## I) Vale-refeição

- Pago pelo app (quando o gateway aceitar vale online) ou por aproximação no Tap do garçom: segue o fluxo normal nos dois apps. Abate o saldo da comanda, aparece para o garçom e para o caixa, entra no extrato do Dono e paga a Taxa NOOWE Pay da linha "vale".
- Passado na maquininha da casa: vira pagamento externo. O garçom registra o valor na comanda, sem taxa NOOWE, e entra no caixa como "maquininha – vale".
- A taxa do vale tem linha própria na tabela de parâmetros e nunca pode passar de 3,6% (teto do Decreto 12.712/2025). O repasse ao restaurante precisa respeitar o prazo máximo de 15 dias do decreto.
- O vale fica fora da conta dos Créditos NOOWE Pay (numerador e denominador), seja pago pela NOOWE ou na maquininha.
- O Dono escolhe quais vales o restaurante aceita (em geral, só vale-refeição; vale-alimentação é para supermercado), em Central → Pagamentos e caixa.
- Na conta dividida e no pagamento misto, o vale abate do saldo como qualquer outro meio (ex.: vale no consumo e cartão na gorjeta).
- Disponibilidade: o vale online depende de o Asaas aceitar (a confirmar), e o vale por aproximação depende do fornecedor do Tap (em negociação). Enquanto não houver, o vale passa só pela maquininha da casa.
