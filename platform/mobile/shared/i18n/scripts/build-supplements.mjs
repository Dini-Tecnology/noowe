/**
 * Gera arquivos *-supplement.ts com chaves estáticas t('...') usadas no código
 * mas ausentes no locale base. Rode: node shared/i18n/scripts/build-supplements.mjs
 * (a partir de platform/mobile)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, '../../..');
const I18N_DIR = path.resolve(__dirname, '..');

const re = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'build' || ent.name === 'dist') continue;
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      if (/\.test\.(ts|tsx)$/.test(ent.name)) continue;
      if (fp.includes(`${path.sep}__tests__${path.sep}`)) continue;
      acc.push(fp);
    }
  }
  return acc;
}

function hasStringLeaf(obj, keyPath) {
  let cur = obj;
  for (const seg of keyPath.split('.')) {
    if (!cur || typeof cur !== 'object' || !(seg in cur)) return false;
    cur = cur[seg];
  }
  return typeof cur === 'string';
}

function setNested(root, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (!cur[seg] || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg];
  }
  cur[parts[parts.length - 1]] = value;
}

function mergeNested(into, from) {
  for (const [k, v] of Object.entries(from)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!into[k] || typeof into[k] !== 'object') into[k] = {};
      mergeNested(into[k], v);
    } else {
      into[k] = v;
    }
  }
}

function formatTsObject(obj, indent = 2) {
  const pad = (n) => ' '.repeat(n);
  const fmt = (val, level) => {
    if (typeof val === 'string') return JSON.stringify(val);
    const keys = Object.keys(val).sort();
    if (keys.length === 0) return '{}';
    const inner = keys
      .map((k) => `${pad(level + indent)}${k}: ${fmt(val[k], level + indent)}`)
      .join(',\n');
    return `{\n${inner}\n${pad(level)}}`;
  };
  return fmt(obj, 0);
}

// Carrega pt-BR como JS (sem export type final)
const ptPath = path.join(I18N_DIR, 'pt-BR.ts');
let ptRaw = fs.readFileSync(ptPath, 'utf8');
ptRaw = ptRaw.slice(0, ptRaw.indexOf('export type TranslationKeys'));
ptRaw = ptRaw.replace('export const ptBR =', 'globalThis.__ptBR = ');
eval(ptRaw);

const usedKeys = new Set();
for (const f of walk(MOBILE_ROOT)) {
  const text = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(text))) usedKeys.add(m[1]);
}

const missing = [...usedKeys].filter((k) => !hasStringLeaf(globalThis.__ptBR, k)).sort();

function humanizeLast(keyPath) {
  const last = keyPath.split('.').pop();
  return last
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mapas EN/ES por chave — fallback é humanize para EN; ES recebe o mesmo humanize se omitido */
const translations = { pt: {}, en: {}, es: {} };

for (const key of missing) {
  translations.pt[key] = humanizeLast(key);
  translations.en[key] = humanizeLast(key);
  translations.es[key] = humanizeLast(key);
}

// Português (revisão manual rápida das chaves mais usadas)
const ptFix = {
  'calls.title': 'Chamados',
  'calls.pendingTab': 'Pendentes',
  'calls.resolvedTab': 'Resolvidos',
  'calls.acknowledge': 'Atender',
  'calls.resolve': 'Resolver',
  'calls.tableNumber': 'Mesa',
  'calls.timeAgo': 'Há {{time}}',
  'calls.avgResponseTime': 'Tempo médio de resposta',
  'calls.errorLoading': 'Erro ao carregar chamados',
  'calls.errorUpdating': 'Erro ao atualizar chamado',
  'calls.callWaiter.acknowledged': 'Chamado reconhecido',
  'calls.callWaiter.acknowledgedMsg': 'O chamado foi reconhecido.',
  'calls.callWaiter.resolved': 'Chamado resolvido',
  'calls.callWaiter.resolvedMsg': 'O chamado foi encerrado.',
  'calls.callWaiter.errorMsg': 'Não foi possível processar o chamado.',
  'calls.empty.pending': 'Nenhum chamado pendente',
  'calls.empty.resolved': 'Nenhum chamado resolvido',
  'calls.status.resolved': 'Resolvido',
  'cart.viewCart': 'Ver carrinho',
  'common.confirmDelete': 'Confirmar exclusão?',
  'common.description': 'Descrição',
  'common.orders': 'Pedidos',
  'common.permissionRequired': 'Permissão necessária',
  'common.tables': 'Mesas',
  'common.total': 'Total',
  'financial.today': 'Hoje',
  'financial.thisWeek': 'Esta semana',
  'financial.thisMonth': 'Este mês',
  'financial.revenue': 'Receita',
  'financial.expenses': 'Despesas',
  'financial.total': 'Total',
  'financial.week': 'Semana',
  'financial.month': 'Mês',
  'financial.year': 'Ano',
  'financial.netProfit': 'Lucro líquido',
  'financial.exportPdf': 'Exportar PDF',
  'financial.dailyAverage': 'Média diária',
  'financial.weeklyRevenue': 'Receita semanal',
  'financial.expenseExceedRevenue': 'Despesas superaram a receita',
  'financial.reportPeriod': 'Período do relatório',
  'financial.averageTicket': 'Ticket médio',
  'financial.todayOrders': 'Pedidos hoje',
  'financial.todayRevenue': 'Receita hoje',
  'financial.totalOrders': 'Total de pedidos',
  'financial.topSellingItems': 'Mais vendidos',
  'restaurant.minOrder': 'Pedido mínimo',
  'restaurants.minOrder': 'Pedido mínimo',
  'location.permissionMessage': 'Ative a localização nas configurações para continuar.',
  'maintenance.title': 'Manutenção',
  'maintenance.message': 'Estamos temporariamente indisponíveis.',
  'maintenance.retry': 'Tentar novamente',
  'maintenance.estimatedEnd': 'Retorno estimado',
  'waiter.loading': 'Carregando...',
  'waiter.error.load_tables': 'Erro ao carregar mesas',
  'menu.each': 'cada',
  'menu.readyIn': 'Pronto em ~{{min}} min',
  'menu.searchMenu': 'Buscar no cardápio',
  'scanner.orderFound': 'Pedido encontrado',
  'scanner.tableFound': 'Mesa encontrada',
  'service.callWaiter': 'Chamar garçom',
  'staff.notFound': 'Funcionário não encontrado',
  'staff.removeStaffConfirm': 'Remover este membro da equipe?',
  'staff.staffRemoved': 'Membro removido',
  'payment.pending': 'Pagamento pendente',
  'payment.splitPayment': 'Dividir pagamento',
  'profile.dietaryPreferences': 'Preferências alimentares',
  'reservations.createReservation': 'Criar reserva',
  'errors.photoPermissionDenied': 'Permissão de fotos negada',
  'errors.photoPickFailed': 'Não foi possível escolher a foto',
  'empty.menuItems': 'Nenhum item no cardápio',
  'config.profile.openTime': 'Horário de abertura',
  'config.profile.closeTime': 'Horário de fechamento',
  'config.payments.removeTipOption': 'Remover opção de gorjeta',
  'loyalty.home.programRulesDescription': 'Veja como ganhar e resgatar benefícios.',
  'notifications.settings.orderUpdates': 'Atualizações de pedidos',
  'notifications.settings.promotions': 'Promoções',
  'notifications.settings.reservationReminders': 'Lembretes de reserva',
  'notifications.settings.reviewsResponses': 'Respostas a avaliações',
  'reports.title': 'Relatórios',
  'reports.export': 'Exportar',
  'reports.exporting': 'Exportando...',
  'reports.revenue': 'Receita',
  'reports.totalRevenue': 'Receita total',
  'reports.orders': 'Pedidos',
  'reports.ordersHandled': 'Pedidos atendidos',
  'reports.menu': 'Cardápio',
  'reports.staff': 'Equipe',
  'reports.tips': 'Gorjetas',
  'reports.rating': 'Avaliação',
  'reports.peakHour': 'Horário de pico',
  'reports.topItems': 'Itens em destaque',
  'reports.avgTicket': 'Ticket médio',
  'reports.byQuantity': 'Por quantidade',
  'reports.byRevenue': 'Por receita',
  'reports.byServiceType': 'Por tipo de serviço',
  'reports.byStatus': 'Por status',
  'reports.paymentCash': 'Dinheiro',
  'reports.paymentCredit': 'Crédito',
  'reports.paymentDebit': 'Débito',
  'reviews.total': 'Total de avaliações',
  'reviews.respond': 'Responder',
  'reviews.response': 'Resposta',
  'reviews.sendResponse': 'Enviar resposta',
  'reviews.responsePlaceholder': 'Escreva uma resposta...',
  'reviews.filter.all': 'Todas',
  'reviews.filter.unresponded': 'Sem resposta',
  'reviews.distributionTitle': 'Distribuição de estrelas',
  'reviews.fiveStarPercent': '5 estrelas',
  'reviews.oneStarPercent': '1 estrela',
  'reviews.newReviewReceived': 'Nova avaliação recebida',
  'roleDashboard.title': 'Painel',
  'orders.summary': 'Resumo',
  'orders.guests': 'Convidados',
  'orders.guestName': 'Nome do convidado',
  'orders.guestNameRequired': 'Informe o nome do convidado',
  'orders.addGuest': 'Adicionar convidado',
  'orders.removeGuest': 'Remover convidado',
  'orders.removeGuestConfirm': 'Remover este convidado do pedido?',
  'orders.addItems': 'Adicionar itens',
  'orders.callWaiter': 'Chamar garçom',
  'orders.notFound': 'Pedido não encontrado',
  'orders.viewReceipt': 'Ver recibo',
  'orders.unassigned': 'Não atribuído',
  'orders.itemsStatus': 'Status dos itens',
  'orders.estimatedReady': 'Previsão de pronto',
  'orders.realtimeEnabled': 'Atualização em tempo real ativada',
  'orders.realtimeDisabled': 'Atualização em tempo real desativada',
  'orders.card.items': 'Itens',
  'orders.card.table': 'Mesa',
  'orders.card.total': 'Total',
  'orders.card.timeAgo': 'Há {{time}}',
  'partialOrder.title': 'Pedido parcial',
  'partialOrder.confirmedItems': 'Itens confirmados',
  'partialOrder.newItems': 'Novos itens',
  'partialOrder.newItemsNotSent': 'Novos itens não enviados',
  'partialOrder.runningTotal': 'Subtotal',
  'partialOrder.sendItems': 'Enviar itens',
  'partialOrder.addMore': 'Adicionar mais',
  'partialOrder.addToOrder': 'Adicionar ao pedido',
  'partialOrder.confirmed': 'Confirmado',
  'partialOrder.openForAdditions': 'Aberto para adições',
  'partialOrder.viewFullOrder': 'Ver pedido completo',
  'groupBooking.title': 'Reserva em grupo',
  'groupBooking.badge': 'Grupo',
  'groupBooking.submitted': 'Solicitação enviada',
  'groupBooking.awaitingConfirmation': 'Aguardando confirmação',
  'groupBooking.stepContactInfo': 'Contato',
  'groupBooking.stepGroupDetails': 'Detalhes do grupo',
  'groupBooking.stepMenuPreferences': 'Preferências de menu',
  'groupBooking.coordinator': 'Coordenador',
  'groupBooking.coordinatorName': 'Nome do coordenador',
  'groupBooking.coordinatorPhone': 'Telefone do coordenador',
  'groupBooking.coordinatorRequired': 'Coordenador obrigatório',
  'groupBooking.partySize': 'Tamanho do grupo',
  'groupBooking.occasion': 'Ocasião',
  'groupBooking.dietaryRestrictions': 'Restrições alimentares',
  'groupBooking.preFixedMenu': 'Menu pré-fixado',
  'groupBooking.deposit': 'Sinal / depósito',
  'groupBooking.priceEstimate': 'Estimativa de valor',
  'groupBooking.additionalNotes': 'Observações adicionais',
  'loyaltyMgmt.title': 'Fidelidade',
  'loyaltyMgmt.members': 'Membros',
  'loyaltyMgmt.reward': 'Recompensa',
  'loyaltyMgmt.searchPlaceholder': 'Buscar cliente...',
  'loyaltyMgmt.selectCustomer': 'Selecione o cliente',
  'loyaltyMgmt.serviceType': 'Tipo de serviço',
  'loyaltyMgmt.pointsConfig': 'Configuração de pontos',
  'loyaltyMgmt.pointsPerReal': 'Pontos por real',
  'loyaltyMgmt.stampCards': 'Cartões de carimbo',
  'loyaltyMgmt.stampsRequired': 'Carimbos necessários',
  'loyaltyMgmt.giveStamp': 'Dar carimbo',
  'loyaltyMgmt.stampAdded': 'Carimbo adicionado',
  'loyaltyMgmt.activeCount': 'Ativos',
  'loyaltyMgmt.activeThisMonth': 'Ativos este mês',
  'loyaltyMgmt.pointsIssuedToday': 'Pontos emitidos hoje',
  'loyaltyMgmt.redemptionsToday': 'Resgates hoje',
  'loyaltyMgmt.completedToday': 'Concluídos hoje',
  'loyaltyScreen.emptyTitle': 'Sem programas de fidelidade',
  'loyaltyScreen.emptyMessage': 'Os programas aparecerão aqui quando disponíveis.',
  'loyaltyScreen.errorLoad': 'Erro ao carregar fidelidade',
  'loyaltyScreen.loadingPrograms': 'Carregando programas...',
  'loyaltyScreen.restaurantFallback': 'Restaurante',
  'loyaltyScreen.statistics': 'Estatísticas',
  'loyaltyScreen.tierLabel': 'Nível',
  'loyaltyScreen.tierBenefits': 'Benefícios do nível',
  'loyaltyScreen.pointsAvailable': 'Pontos disponíveis',
  'loyaltyScreen.pointsRequired': 'Pontos necessários',
  'loyaltyScreen.progressTo': 'Progresso para',
  'loyaltyScreen.totalEarned': 'Total ganho',
  'loyaltyScreen.totalRedeemed': 'Total resgatado',
  'loyaltyScreen.availableRewards': 'Recompensas disponíveis',
  'loyaltyScreen.exclusiveRewards': 'Recompensas exclusivas',
  'loyaltyScreen.available': 'Disponível',
  'loyaltyScreen.earnPoints': 'Ganhe pontos',
  'loyaltyScreen.priorityBooking': 'Reserva prioritária',
  'loyaltyScreen.recentActivity': 'Atividade recente',
  'loyaltyScreen.redeemTitle': 'Resgatar recompensa',
  'loyaltyScreen.redeemAction': 'Resgatar',
  'loyaltyScreen.redeemConfirm': 'Confirmar resgate?',
  'loyaltyScreen.redeemSuccess': 'Resgate realizado!',
  'loyaltyScreen.insufficientPoints': 'Pontos insuficientes',
  'loyaltyScreen.insufficientPointsMessage': 'Você não tem pontos suficientes.',
  'loyaltyScreen.lockedAction': 'Indisponível',
  'roleDashboard.activeOrders': 'Pedidos ativos',
  'roleDashboard.totalOrders': 'Total de pedidos',
  'roleDashboard.revenueToday': 'Receita hoje',
  'roleDashboard.avgTicket': 'Ticket médio',
  'roleDashboard.avgPrepTime': 'Tempo médio de preparo',
  'roleDashboard.occupancy': 'Ocupação',
  'roleDashboard.pendingApprovals': 'Aprovações pendentes',
  'roleDashboard.openCalls': 'Chamados abertos',
  'roleDashboard.staffOnDuty': 'Em serviço',
  'roleDashboard.staffActive': 'Equipe ativa',
  'roleDashboard.ordersInKds': 'Pedidos na cozinha',
  'roleDashboard.overdueItems': 'Itens atrasados',
  'roleDashboard.barOrdersPending': 'Pedidos de bar pendentes',
  'roleDashboard.stockAlerts': 'Alertas de estoque',
  'roleDashboard.stockAlertsBeverages': 'Alertas (bebidas)',
  'roleDashboard.stationStatus': 'Status da estação',
  'roleDashboard.recipesServed': 'Receitas servidas',
  'roleDashboard.bestSelling': 'Mais vendidos',
  'roleDashboard.myTables': 'Minhas mesas',
  'roleDashboard.myTips': 'Minhas gorjetas',
  'roleDashboard.myAvgRating': 'Minha avaliação média',
  'roleDashboard.reviewsAvg': 'Média de avaliações',
  'club.title': 'Club',
  'club.available': 'Disponível',
  'club.soldOut': 'Esgotado',
  'club.buyTicket': 'Comprar ingresso',
  'club.coverCharge': 'Couvert',
  'club.events': 'Eventos',
  'club.noEvents': 'Sem eventos',
  'club.queue': 'Fila',
  'club.viewLineup': 'Ver programação',
  'club.lineup': 'Programação',
  'club.vipTable': 'Mesas VIP',
  'club.lineupSection.stage': 'Palco',
  'club.lineupSection.nowPlaying': 'No palco',
  'club.lineupSection.noLineup': 'Programação em breve',
  'club.lineupSection.addToCalendar': 'Adicionar ao calendário',
  'club.queueSection.admitted': 'Admitidos',
  'club.queueSection.avgWait': 'Espera média',
  'club.queueSection.callNext': 'Chamar próximo',
  'club.queueSection.called': 'Chamado',
  'club.queueSection.noShow': 'Não compareceu',
  'club.queueSection.partySize': 'Tamanho do grupo',
  'club.queueSection.total': 'Total na fila',
  'club.door.admit': 'Admitir',
  'club.door.deny': 'Negar entrada',
  'club.door.denyConfirm': 'Negar entrada a este convidado?',
  'club.door.waiting': 'Aguardando',
  'club.door.noQueue': 'Ninguém na fila',
  'club.door.scanSimulation': 'Simulação de leitura',
  'club.door.deniedStatus': 'Negado',
  'club.ticket.normal': 'Normal',
  'club.ticket.vip': 'VIP',
  'club.ticket.birthday': 'Aniversário',
  'club.ticket.price': 'Preço',
  'club.ticket.total': 'Total',
  'club.ticket.purchase': 'Comprar',
  'club.ticket.purchaseSuccess': 'Compra realizada!',
  'club.ticket.purchaseError': 'Não foi possível concluir a compra.',
  'club.ticket.showQr': 'Mostrar QR',
  'club.vip.table': 'Mesa',
  'club.vip.capacity': 'Capacidade',
  'club.vip.minConsumption': 'Consumação mínima',
  'club.vip.elapsed': 'Tempo decorrido',
  'club.vip.noTables': 'Nenhuma mesa VIP',
  'club.vip.openTab': 'Abrir comanda',
  'club.vip.closeTab': 'Fechar comanda',
  'club.vip.tabSummary': 'Resumo da comanda',
  'club.vip.reserve': 'Reservar VIP',
  'club.vip.selectTable': 'Selecionar mesa',
  'club.vip.status.available': 'Disponível',
  'club.vip.status.occupied': 'Ocupada',
  'club.vip.status.reserved': 'Reservada',
  'club.vip.status.closed': 'Fechada',
  'club.vip.reservationForm.contact': 'Contato',
  'club.vip.reservationForm.partySize': 'Quantidade de pessoas',
  'club.vip.reservationForm.specialRequests': 'Observações',
  'club.vip.reservationForm.success': 'Reserva VIP enviada!',
  'club.birthday.subtitle': 'Reserve sua celebração',
  'club.birthday.name': 'Nome',
  'club.birthday.personName': 'Nome do aniversariante',
  'club.birthday.dateOfBirth': 'Data de nascimento',
  'club.birthday.date': 'Data',
  'club.birthday.contact': 'Contato',
  'club.birthday.message': 'Mensagem',
  'club.birthday.partySize': 'Tamanho do grupo',
  'club.birthday.package': 'Pacote',
  'club.birthday.noPackages': 'Nenhum pacote disponível',
  'club.birthday.selectPackage': 'Selecione o pacote',
  'club.birthday.selectDate': 'Selecione a data',
  'club.birthday.celebrationType': 'Tipo de celebração',
  'club.birthday.standard': 'Padrão',
  'club.birthday.vip': 'VIP',
  'club.birthday.perPerson': 'Por pessoa',
  'club.birthday.specialRequests': 'Pedidos especiais',
  'club.birthday.submit': 'Enviar reserva',
  'club.birthday.bookingError': 'Não foi possível reservar.',
  'club.birthday.confirmed': 'Reserva confirmada',
  'club.birthday.confirmation': 'Confirmação',
  'club.birthday.summary': 'Resumo',
  'club.birthday.total': 'Total',
  'club.birthday.reference': 'Referência',
  'club.birthday.referenceNumber': 'Número de referência',
  'club.birthday.selected': 'Selecionado',
};

const enFix = {
  'calls.title': 'Calls',
  'financial.today': 'Today',
  'financial.thisWeek': 'This week',
  'financial.thisMonth': 'This month',
  'financial.revenue': 'Revenue',
  'financial.expenses': 'Expenses',
  'financial.total': 'Total',
  'financial.week': 'Week',
  'financial.month': 'Month',
  'financial.year': 'Year',
  'financial.netProfit': 'Net profit',
  'financial.exportPdf': 'Export PDF',
  'financial.dailyAverage': 'Daily average',
  'financial.weeklyRevenue': 'Weekly revenue',
  'financial.expenseExceedRevenue': 'Expenses exceeded revenue',
  'financial.reportPeriod': 'Report period',
  'financial.averageTicket': 'Average ticket',
  'financial.todayOrders': "Today's orders",
  'financial.todayRevenue': "Today's revenue",
  'financial.totalOrders': 'Total orders',
  'financial.topSellingItems': 'Top selling items',
  'cart.viewCart': 'View cart',
  'restaurant.minOrder': 'Minimum order',
  'restaurants.minOrder': 'Minimum order',
  'location.permissionMessage': 'Enable location in settings to continue.',
  'maintenance.title': 'Maintenance',
  'maintenance.message': 'We are temporarily unavailable.',
  'maintenance.retry': 'Try again',
  'maintenance.estimatedEnd': 'Estimated return',
  'waiter.loading': 'Loading...',
  'waiter.error.load_tables': 'Failed to load tables',
  'menu.each': 'each',
  'menu.readyIn': 'Ready in ~{{min}} min',
  'menu.searchMenu': 'Search menu',
  'scanner.orderFound': 'Order found',
  'scanner.tableFound': 'Table found',
  'service.callWaiter': 'Call waiter',
  'staff.notFound': 'Staff not found',
  'staff.removeStaffConfirm': 'Remove this team member?',
  'staff.staffRemoved': 'Member removed',
  'payment.pending': 'Payment pending',
  'payment.splitPayment': 'Split payment',
  'profile.dietaryPreferences': 'Dietary preferences',
  'reservations.createReservation': 'Create reservation',
  'errors.photoPermissionDenied': 'Photo permission denied',
  'errors.photoPickFailed': 'Could not pick photo',
  'empty.menuItems': 'No menu items',
  'common.confirmDelete': 'Confirm delete?',
  'common.description': 'Description',
  'common.orders': 'Orders',
  'common.permissionRequired': 'Permission required',
  'common.tables': 'Tables',
  'common.total': 'Total',
};

const esFix = {
  'calls.title': 'Llamadas',
  'financial.today': 'Hoy',
  'financial.thisWeek': 'Esta semana',
  'financial.thisMonth': 'Este mes',
  'financial.revenue': 'Ingresos',
  'financial.expenses': 'Gastos',
  'financial.total': 'Total',
  'financial.week': 'Semana',
  'financial.month': 'Mes',
  'financial.year': 'Año',
  'financial.netProfit': 'Beneficio neto',
  'financial.exportPdf': 'Exportar PDF',
  'financial.dailyAverage': 'Promedio diario',
  'financial.weeklyRevenue': 'Ingresos semanales',
  'financial.expenseExceedRevenue': 'Los gastos superaron los ingresos',
  'financial.reportPeriod': 'Periodo del informe',
  'financial.averageTicket': 'Ticket promedio',
  'financial.todayOrders': 'Pedidos de hoy',
  'financial.todayRevenue': 'Ingresos de hoy',
  'financial.totalOrders': 'Total de pedidos',
  'financial.topSellingItems': 'Mas vendidos',
  'cart.viewCart': 'Ver carrito',
  'restaurant.minOrder': 'Pedido minimo',
  'restaurants.minOrder': 'Pedido minimo',
  'location.permissionMessage': 'Activa la ubicacion en ajustes para continuar.',
  'maintenance.title': 'Mantenimiento',
  'maintenance.message': 'No estamos disponibles temporalmente.',
  'maintenance.retry': 'Reintentar',
  'maintenance.estimatedEnd': 'Retorno estimado',
  'waiter.loading': 'Cargando...',
  'waiter.error.load_tables': 'Error al cargar mesas',
  'menu.each': 'cada uno',
  'menu.readyIn': 'Listo en ~{{min}} min',
  'menu.searchMenu': 'Buscar en el menu',
  'scanner.orderFound': 'Pedido encontrado',
  'scanner.tableFound': 'Mesa encontrada',
  'service.callWaiter': 'Llamar al mesero',
  'staff.notFound': 'Personal no encontrado',
  'staff.removeStaffConfirm': '¿Eliminar a este miembro?',
  'staff.staffRemoved': 'Miembro eliminado',
  'payment.pending': 'Pago pendiente',
  'payment.splitPayment': 'Dividir pago',
  'profile.dietaryPreferences': 'Preferencias alimentarias',
  'reservations.createReservation': 'Crear reserva',
  'errors.photoPermissionDenied': 'Permiso de fotos denegado',
  'errors.photoPickFailed': 'No se pudo elegir la foto',
  'empty.menuItems': 'No hay platos en el menu',
  'common.confirmDelete': '¿Confirmar eliminacion?',
  'common.description': 'Descripcion',
  'common.orders': 'Pedidos',
  'common.permissionRequired': 'Permiso necesario',
  'common.tables': 'Mesas',
  'common.total': 'Total',
};

for (const key of missing) {
  translations.pt[key] = ptFix[key] ?? translations.pt[key];
  translations.en[key] = enFix[key] ?? translations.en[key];
  translations.es[key] = esFix[key] ?? translations.es[key];
}

const nestPt = {};
const nestEn = {};
const nestEs = {};
for (const key of missing) {
  setNested(nestPt, key, translations.pt[key]);
  setNested(nestEn, key, translations.en[key]);
  setNested(nestEs, key, translations.es[key]);
}

const header = `/* Autogerado por scripts/build-supplements.mjs — não edite à mão salvo exceções puntuales */\n\n`;

fs.writeFileSync(
  path.join(I18N_DIR, 'pt-BR-supplement.ts'),
  header + `export const ptBRSupplement = ${formatTsObject(nestPt)} as const;\n`,
);
fs.writeFileSync(
  path.join(I18N_DIR, 'en-US-supplement.ts'),
  header + `export const enUSSupplement = ${formatTsObject(nestEn)} as const;\n`,
);
fs.writeFileSync(
  path.join(I18N_DIR, 'es-ES-supplement.ts'),
  header + `export const esESSupplement = ${formatTsObject(nestEs)} as const;\n`,
);

console.log('Wrote supplements for', missing.length, 'missing keys');
