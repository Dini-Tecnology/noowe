import { FC, useMemo, useState } from "react";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  Grid3X3,
  LayoutDashboard,
  LineChart,
  Settings,
  TrendingUp,
  Users,
  Bell,
} from "lucide-react";

interface OwnerPreviewScreenV2Props {
  onNavigate: (screen: string) => void;
}

type Role = "owner" | "manager" | "maitre" | "chef" | "barman" | "cook" | "waiter";
type OwnerTab = "dashboard" | "orders" | "tables" | "kds" | "analytics";

const roles: { id: Role; label: string; title: string; hint: string }[] = [
  { id: "owner", label: "Dono", title: "Dashboard Executivo", hint: "Visao completa do restaurante" },
  { id: "manager", label: "Gerente", title: "Operacao do Turno", hint: "Pedidos, equipe e sala" },
  { id: "maitre", label: "Maitre", title: "Sala e Reservas", hint: "Fila, reservas e mesas" },
  { id: "chef", label: "Chef", title: "Chef Executivo", hint: "KDS, tempos e qualidade" },
  { id: "barman", label: "Barman", title: "Bar KDS", hint: "Drinks e bebidas" },
  { id: "cook", label: "Cozinheiro", title: "Estacao de Preparo", hint: "Fila da sua praca" },
  { id: "waiter", label: "Garcom", title: "Atendimento", hint: "Mesas e chamados" },
];

const ownerTabs: { id: OwnerTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "tables", label: "Mesas", icon: Grid3X3 },
  { id: "kds", label: "KDS", icon: ChefHat },
  { id: "analytics", label: "Dados", icon: BarChart3 },
];

const orders = [
  { table: "7", name: "Ana Oliveira", items: "3 itens", value: "R$ 90", time: "3min atras", status: "Confirmado", action: "Preparar" },
  { table: "9", name: "Felipe Almeida", items: "1 item", value: "R$ 42", time: "11min atras", status: "Confirmado", action: "Preparar" },
  { table: "9", name: "Lucia Fernandes", items: "2 itens", value: "R$ 88", time: "16min atras", status: "Confirmado", action: "Preparar" },
  { table: "12", name: "Beatriz Lima", items: "1 item", value: "R$ 192", time: "1min atras", status: "Pendente", action: "Aceitar" },
];

const orderItems = [
  ["1x Ceviche Peruano", "1x Agua com Gas San Pellegrino"],
  ["1x Negroni Classico"],
  ["1x Ceviche Peruano", "1x Cheesecake de Frutas"],
  ["2x Salmao Grelhado"],
];

const tables = [
  { number: 1, status: "Ocupada", seats: "2 lugares", guest: "Maria S.", tone: "danger" },
  { number: 2, status: "Livre", seats: "2 lugares", guest: "", tone: "success" },
  { number: 3, status: "Ocupada", seats: "4 lugares", guest: "Joao & Ana", tone: "danger" },
  { number: 4, status: "Reserva", seats: "4 lugares", guest: "", tone: "warning" },
  { number: 5, status: "Ocupada", seats: "6 lugares", guest: "Grupo Pedro", tone: "danger" },
  { number: 6, status: "Conta", seats: "2 lugares", guest: "Lucia F.", tone: "info" },
  { number: 7, status: "Livre", seats: "4 lugares", guest: "", tone: "success" },
  { number: 8, status: "Ocupada", seats: "8 lugares", guest: "Aniversario", tone: "danger" },
  { number: 9, status: "Livre", seats: "2 lugares", guest: "", tone: "success" },
  { number: 10, status: "Ocupada", seats: "4 lugares", guest: "Carlos M.", tone: "danger" },
  { number: 11, status: "Reserva", seats: "6 lugares", guest: "", tone: "warning" },
  { number: 12, status: "Livre", seats: "2 lugares", guest: "", tone: "success" },
];

const kdsOrders = [
  { table: "Mesa 7", meta: "3 itens - 4min", items: [["1x Ceviche Peruano", "10min"], ["1x Agua com Gas San Pellegrino", "1min"], ["2x Agua com Gas San Pellegrino", "1min"]] },
  { table: "Mesa 9", meta: "2 itens - 17min", items: [["1x Ceviche Peruano", "10min"], ["1x Cheesecake de Frutas", "5min"]] },
  { table: "Mesa 9", meta: "3 itens - 18min", items: [["2x Salmao Grelhado", "18min"], ["1x File ao Molho de Vinho", "25min"], ["1x Tartare de Atum", "8min"]] },
  { table: "Mesa 12", meta: "1 item - 19min", items: [["1x Petit Gateau", "12min"]] },
];

const topItems = [
  ["File ao Molho de Vinho", "18 vendidos"],
  ["Tartare de Atum", "15 vendidos"],
  ["Risoto de Funghi", "14 vendidos"],
  ["Petit Gateau", "12 vendidos"],
  ["Gin Tonica Aurora", "22 vendidos"],
];

const toneClass = {
  success: "bg-emerald-50 text-emerald-600",
  danger: "bg-red-50 text-red-500",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-sky-50 text-sky-600",
};

const customerInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? ""}`.toUpperCase();
};

const OwnerPreviewScreenV2: FC<OwnerPreviewScreenV2Props> = () => {
  const [role, setRole] = useState<Role>("owner");
  const [tab, setTab] = useState<OwnerTab>("dashboard");

  const selectedRole = useMemo(() => roles.find((item) => item.id === role) ?? roles[0], [role]);
  const isOwner = role === "owner";

  return (
    <div className="h-full bg-white text-slate-900 overflow-hidden relative">
      <div className="h-full overflow-y-auto px-4 pt-4 pb-28">
        <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">Modo mobile</p>
              <h1 className="mt-1 text-[15px] font-bold leading-tight text-slate-900">{selectedRole.title}</h1>
              <p className="mt-1 text-[11px] text-slate-500">{selectedRole.hint}</p>
            </div>
            <label className="min-w-[118px]">
              <span className="sr-only">Selecionar visao</span>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as Role);
                  setTab("dashboard");
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none"
              >
                {roles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {isOwner ? <OwnerContent tab={tab} /> : <RolePlaceholder role={selectedRole} />}
      </div>

      {isOwner ? (
        <OwnerBottomNav activeTab={tab} onChange={setTab} />
      ) : (
        <RoleLockedNav role={selectedRole.label} />
      )}
    </div>
  );
};

const OwnerContent = ({ tab }: { tab: OwnerTab }) => {
  if (tab === "orders") return <OrdersView />;
  if (tab === "tables") return <TablesView />;
  if (tab === "kds") return <KdsView />;
  if (tab === "analytics") return <AnalyticsView />;
  return <DashboardView />;
};

const DashboardView = () => (
  <main className="mt-4 space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <Metric value="R$ 13.736" label="Receita Hoje" tone="success" />
      <Metric value="10" label="Pedidos Ativos" tone="danger" />
      <Metric value="72%" label="Ocupacao" tone="warning" />
      <Metric value="R$ 259" label="Ticket Medio" tone="info" />
    </div>

    <section>
      <SectionTitle title="Acoes rapidas" subtitle="Atalhos para o que importa agora" />
      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon={ClipboardList} title="Pedidos" detail="10 em andamento" tone="danger" />
        <QuickAction icon={Grid3X3} title="Mesas" detail="5 ocupadas" tone="info" />
        <QuickAction icon={ChefHat} title="KDS Cozinha" detail="0 prontos" tone="warning" />
        <QuickAction icon={LineChart} title="Analytics" detail="Top itens em pico" tone="success" />
      </div>
    </section>

    <section>
      <SectionTitle title="Pedidos recentes" />
      <div className="space-y-2.5">
        {orders.slice(0, 3).map((order) => (
          <CompactOrder key={`${order.table}-${order.name}`} order={order} />
        ))}
      </div>
    </section>
    <section>
      <SectionTitle title="Alertas" subtitle="Atualizacoes da operacao em tempo real" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {[
          ["Novo pedido na Mesa 2 — Rafael Souza", "agora"],
          ["Mesa 5 chamou o garcom", "1min atras"],
          ["Novo pedido na Mesa 12 — Camila Rodrigues", "3min atras"],
        ].map(([message, time], index) => (
          <div key={message} className={`flex items-center gap-3 px-3 py-3 ${index < 2 ? "border-b border-slate-100" : ""}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
              <Bell className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{message}</p>
            <span className="text-[10px] text-slate-400">{time}</span>
          </div>
        ))}
      </div>
    </section>
  </main>
);

const OrdersView = () => (
  <main className="mt-4 space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {["Todos", "Pendente", "Confirmado", "Preparando"].map((filter, index) => (
        <button
          key={filter}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
            index === 0 ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>

    <div className="space-y-3">
      {orders.map((order, index) => (
        <article key={`${order.name}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-base font-bold text-red-500">
              {order.table}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-sm font-bold">{order.name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  order.status === "Pendente" ? "bg-slate-100 text-slate-500" : "bg-sky-50 text-sky-600"
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {order.items} - {order.value} - {order.time}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {orderItems[index].map((item) => (
                  <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button className={`mt-4 w-full rounded-2xl py-3 text-sm font-bold ${
            order.status === "Pendente" ? "bg-red-500 text-white" : "bg-amber-500 text-slate-950"
          }`}>
            {order.action}
          </button>
        </article>
      ))}
    </div>
  </main>
);

const TablesView = () => (
  <main className="mt-4 space-y-4">
    <div className="rounded-2xl border border-red-100 bg-red-50 px-3.5 py-3 text-[11px] leading-relaxed text-red-500">
      Toque em uma mesa para selecao e acao.
    </div>

    <div className="grid grid-cols-3 gap-2">
      {tables.map((table) => (
        <button
          key={table.number}
          className={`min-h-[94px] rounded-2xl border bg-white p-3 text-left shadow-sm ${
            table.number === 1 ? "border-red-500" : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <span className="text-xl font-bold">{table.number}</span>
            <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${toneClass[table.tone as keyof typeof toneClass]}`}>
              {table.status}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">{table.seats}</p>
          {table.guest && <p className="mt-1 truncate text-[11px] font-semibold">{table.guest}</p>}
        </button>
      ))}
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">Mesa 1</h2>
          <p className="text-xs text-slate-500">Maria S.</p>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-bold text-red-500">Ocupada</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric value="2" label="Lugares" tone="info" />
        <Metric value="R$ 186" label="Conta" tone="danger" />
      </div>
      <button className="mt-4 rounded-2xl bg-sky-500 px-7 py-3 text-sm font-bold text-white">Fechar conta</button>
    </section>
  </main>
);

const KdsView = () => (
  <main className="mt-4 space-y-4">
    <div className="grid grid-cols-3 gap-3">
      <Metric value="6" label="Fila" tone="warning" />
      <Metric value="2" label="Preparando" tone="danger" />
      <Metric value="0" label="Prontos" tone="success" />
    </div>

    <div className="space-y-3">
      {kdsOrders.map((order) => (
        <article key={`${order.table}-${order.meta}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold">{order.table}</h2>
              <p className="text-xs text-slate-500">{order.meta}</p>
            </div>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-600">Confirmado</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {order.items.map(([name, time]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-xs">
                <span>{name}</span>
                <span className="text-slate-500">{time}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full rounded-2xl bg-amber-500 py-3 text-sm font-bold text-slate-950">Iniciar preparo</button>
        </article>
      ))}
    </div>
  </main>
);

const AnalyticsView = () => (
  <main className="mt-4 space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <Metric value="R$ 77.5k" label="Receita" tone="success" />
      <Metric value="312" label="Pedidos" tone="danger" />
      <Metric value="4.8" label="Satisfacao" tone="warning" />
      <Metric value="38%" label="Recorrencia" tone="info" />
    </div>

    <section>
      <SectionTitle title="Top vendidos" />
      <div className="space-y-2.5">
        {topItems.map(([item, sold], index) => (
          <article key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-sm font-bold text-red-500">
              #{index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold">{item}</h2>
              <p className="text-xs text-slate-500">{sold}</p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </article>
        ))}
      </div>
    </section>
  </main>
);

const RolePlaceholder = ({ role }: { role: { label: string; title: string; hint: string } }) => (
  <main className="mt-4 space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">Preview em etapas</p>
      <h2 className="mt-2 text-lg font-bold text-slate-900">{role.label}</h2>
      <p className="mt-1 text-sm text-slate-500">{role.hint}</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <QuickAction icon={ClipboardList} title="Acesso limitado" detail="Visao do cargo" tone="info" />
      <QuickAction icon={Settings} title="Permissoes" detail="Sem painel executivo" tone="warning" />
      <QuickAction icon={Users} title="Operacao" detail="Somente tarefas" tone="success" />
      <QuickAction icon={BarChart3} title="Relatorios" detail="Restrito" tone="danger" />
    </div>
  </main>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3">
    <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
  </div>
);

const Metric = ({ value, label, tone }: { value: string; label: string; tone: keyof typeof toneClass }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneClass[tone]}`}>{value}</span>
    <p className="mt-3 text-xs text-slate-500">{label}</p>
  </div>
);

const QuickAction = ({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof LayoutDashboard;
  title: string;
  detail: string;
  tone: keyof typeof toneClass;
}) => (
  <button className="min-h-[82px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm">
    <Icon className={`h-4 w-4 ${toneClass[tone].split(" ")[1]}`} />
    <h3 className="mt-3 text-sm font-bold">{title}</h3>
    <p className="text-xs text-slate-500">{detail}</p>
  </button>
);

const CompactOrder = ({ order }: { order: (typeof orders)[number] }) => (
  <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-sm font-bold text-red-500">
      {customerInitials(order.name)}
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="truncate text-sm font-bold">{order.name}</h3>
      <p className="text-xs text-slate-500">{order.items} - agora</p>
    </div>
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{order.status}</span>
  </article>
);

const OwnerBottomNav = ({ activeTab, onChange }: { activeTab: OwnerTab; onChange: (tab: OwnerTab) => void }) => (
  <nav className="absolute bottom-0 left-0 right-0 px-4 pb-5">
    <div className="rounded-[26px] border border-white/80 bg-white/80 px-2 py-2 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-around">
        {ownerTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => onChange(item.id)} className="flex min-w-[54px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5">
              <span className={`rounded-xl p-2 ${isActive ? "bg-red-500 text-white shadow-lg" : "text-slate-500"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`text-[9px] font-semibold ${isActive ? "text-red-500" : "text-slate-500"}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  </nav>
);

const RoleLockedNav = ({ role }: { role: string }) => (
  <div className="absolute bottom-0 left-0 right-0 px-4 pb-5">
    <div className="rounded-[26px] border border-white/80 bg-white/80 px-4 py-4 text-center text-xs font-semibold text-slate-500 shadow-2xl backdrop-blur-xl">
      Navbottom de {role} sera detalhado na proxima etapa
    </div>
  </div>
);

export default OwnerPreviewScreenV2;
