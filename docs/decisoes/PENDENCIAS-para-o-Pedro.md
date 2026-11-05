# Pendências para o Pedro

Pedro, estas são as decisões que o aditivo comercial não fechou. O sistema já funciona com a coluna "Como está hoje", e cada regra pode ser trocada sem nova versão grande. Basta responder **ok** ou dizer o que muda em cada número.

## 1. Estas travam a cobrança real

| # | Ponto | Como está hoje | O que precisamos |
|---|---|---|---|
| 34 | Dados da empresa NOOWE | Só temos o CNPJ. Nenhuma nota sai sem o restante | Razão social, endereço, inscrição municipal e regime tributário |
| 91 | Dados fiscais da nota da NOOWE | Campos vazios. A nota espera por eles e depois sai para as faturas pagas | Do contador: código e nome do serviço, descrição, alíquotas e retenção de ISS |
| 38 | Nota da taxa de conveniência | Taxa em R$ 0 e desligada | Do contador: formato da nota, emissor e passagem do valor pela conta do restaurante |
| 35 | Restaurante ativo que não escolhe plano | Os 30 dias contam do próximo acesso do Dono. A operação segue, e ao fim valem os prazos de atraso, sem bloquear comanda aberta | Confirmar |
| 81 | Plano sem NFC-e | A nota fica bloqueada, com o motivo | Do contador: pode, sendo a nota obrigação do restaurante? |
| 62 | Nota de comanda reaberta | A nota emitida continua, e o acréscimo não gera outra | Orientação do contador |
| 63 | Estorno parcial e nota | Não cancela: registra e avisa gerente e Dono | Orientação do contador |
| 64 | Tarifa no estorno total no mesmo dia | A tarifa inteira vira crédito na fatura do restaurante. Se o Asaas devolver, o crédito sobra | Confirmar no contrato com o Asaas |

## 2. Caixa, gorjeta e permissões da equipe

| # | Ponto | Como está hoje |
|---|---|---|
| 36 | "Dinheiro" como forma da maquininha | Entra como dinheiro no caixa. Crédito, débito, Pix e vale entram como externo |
| 40 | Recepcionista recusa reserva? | Não. Só Maître completo, Gerente e Dono |
| 41 | "Isentar no-show" sem taxa | Significa reverter o no-show |
| 42 | Gerente altera outro Gerente? | Não. Só o Dono |
| 43 | Validade do convite de equipe | 7 dias, em parâmetro |
| 44 | Convite sem e-mail | Permitido. Quem convida escolhe |
| 45 | Quem vê a escala | Só Dono e Gerente, por enquanto |
| 58 | Dinheiro sem caixa aberto | O pagamento vale e abate o saldo. Fica registrado como fora do caixa, para o gerente |
| 59 | Quem aparece no rateio | Quem está na escala do dia, sem turno cancelado. Por horas, usa entrada e saída quando houver |
| 60 | Ninguém na escala | Fica sem rateio, à vista no relatório, e gerente e Dono são avisados |
| 61 | Gorjeta e taxa de quem pagou no dia | Pelo dia do pagamento. Estorno total sai da apuração só antes do fechamento do dia |
| 76 | Maître cobra sem ver valores detalhados | Vê o saldo e o valor que cobra. Não vê cada pagamento já feito nem o total de cada mesa na lista |
| 77 | Barman nas bebidas do Quick | Cobra pedido de balcão (sem mesa), inteiro |
| 78 | % das mesas pagas pelo app | Consumo pago pelo app sobre o consumo pago nas mesas do garçom, no dia aberto. Vale fica fora |
| 82 | Caixa do Gerente e fechamento cego | Com o caixa aberto, a linha de dinheiro aparece sem valor. As outras formas sempre aparecem |
| 83 | "Turno" do caixa do Gerente | O resumo cobre o dia operacional aberto |
| 84 | Dinheiro em mãos | Dinheiro lançado pela própria pessoa no caixa aberto, menos estorno e acerto dela. Vale para Garçom, Maître e Barman |
| 85 | Comanda por pessoa | Maître abre qualquer comanda, sem o total pago. Garçom só abre as dele |
| 86 | "Conta" no mapa de mesas | Mostra o consumo lançado, sem descontar o que já foi pago |
| 87 | Receita com comanda aberta | No painel, soma só o consumo já pago, sem taxa nem gorjeta. Ao encerrar, entra o pedido. Financeiro e relatórios seguem por pedido quitado |
| 88 | Acerto do garçom é cego? | O Gerente vê quem tem acerto a fazer e digita quanto recebeu, sem ver o devido. O Dono vê o valor |
| 89 | Diferença no acerto | Exige motivo, fica registrada e sai do esperado da gaveta. Acima do limite de quebra, avisa o Dono. Não desconta de ninguém |
| 90 | Estorno feito no painel do Asaas | Vale o que o Asaas informar: entra no app sem aprovação, com rastro, e avisa gerente e Dono. Parcial não devolve a taxa |

## 3. Conta, comanda e pagamento

| # | Ponto | Como está hoje |
|---|---|---|
| 33 | QR com comanda aberta e saldo zero | Vale a sessão ativa, com qualquer saldo. O amigo entra mesmo antes do primeiro pedido |
| 46 | Prazo da reserva do Pix | 10 minutos no salão e 15 no Quick |
| 47 | Fechar a conta manualmente | Continua, como exceção auditada, com motivo |
| 48 | Quem sai sem pagar | Convidado sai confirmando, e a parte fica com o titular, que é avisado |
| 49 | O próprio titular sai? | Não com saldo. Walk-out mantém o saldo e alerta o gerente |
| 50 | Restaurantes que já usam taxa | Ficam com taxa. Só restaurante novo nasce com o padrão |
| 51 | Reserva do cartão | 15 minutos |
| 52 | Retirada da taxa e nova divisão | A retirada acompanha a pessoa até ela pagar |
| 53 | Motivo da retirada | Cliente: "A pedido do cliente". Garçom pode escrever |
| 54 | Partes iguais com número ajustado | Quem confirma paga a própria parte, e o resto segue no saldo |
| 55 | Teto da gorjeta | 100% do valor, como já existia |
| 56 | Pagamento presencial sem participante | Aparece como "Pago no salão" |
| 57 | Divisa entre saldo e caixa | O saldo abate e desmarca a taxa. Gaveta, fechamento e rateio ficam no caixa |

## 4. Plano e fatura

| # | Ponto | Como está hoje |
|---|---|---|
| 37 | Credenciais do Tap | Fornecedor ativo na tabela. Credenciais em segredo, fora da tabela, por segurança |
| 39 | Restaurante novo com perfil incompleto | O cadastro exige os campos. Os dois de teste ficam como estão |
| 65 | Piso de fatura com crédito | R$ 0, em parâmetro |
| 66 | Vencimento da fatura | 3 dias depois de gerada |
| 67 | Restaurante sem CNPJ na fatura | Fica em aberto, com o motivo, sem chamar o Asaas |
| 68 | Cadeado no recurso fora do plano | Lista em Módulos e plano. Nas telas do dia a dia, o recurso some |
| 69 | Reembolso ao cancelar o anual | Sem reembolso, e a tela avisa antes |
| 80 | Restaurante com plano cancelado | Fica sem divisão, reservas, fila, fidelidade, NFC-e e app do garçom. Cardápio e pedido seguem |

## 5. Cupons

| # | Ponto | Como está hoje |
|---|---|---|
| 70 | Garçom em mesa sem responsável | Pode aplicar. Mesa de outro garçom é recusada |
| 71 | Faturamento das contas com cupom | Consumo pago da conta inteira, sem o desconto, sem taxa nem gorjeta |
| 72 | Cliente novo trazido | Quem usou o cupom sem pedido anterior nesta casa |
| 73 | Horário que passa da meia-noite | Recusado na criação: o fim precisa ser depois do início |
| 74 | Cupom por item na conta dividida | Vale só o que é da pessoa. Em partes iguais e valor fixo, a parte proporcional dela |
| 75 | Cupom sem cliente identificado | Só cupom para "todos" |
| 79 | Cupom de 100% | O desconto para no mínimo de cobrança (hoje R$ 5). Conta menor que o mínimo não recebe desconto |
