import { FC, useState } from 'react';
import { ChevronLeft, Pencil, Plus, QrCode, Trash2, Users } from 'lucide-react';
import RestaurantLiquidGlassNav from '../../components/RestaurantLiquidGlassNav';

interface TablesScreenV2Props { onNavigate: (screen: string) => void; }

type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'blocked';

interface RestaurantTable {
  id: string;
  status: TableStatus;
  seats: number;
  section: string;
  hasQR: boolean;
}

const initialTables: RestaurantTable[] = [
  { id: '01', status: 'occupied', seats: 4, section: 'Salão', hasQR: true },
  { id: '02', status: 'available', seats: 2, section: 'Salão', hasQR: true },
  { id: '03', status: 'reserved', seats: 4, section: 'Salão', hasQR: false },
  { id: '04', status: 'cleaning', seats: 2, section: 'Varanda', hasQR: true },
  { id: '05', status: 'available', seats: 4, section: 'Varanda', hasQR: false },
  { id: '06', status: 'occupied', seats: 6, section: 'Privativo', hasQR: true },
  { id: '07', status: 'blocked', seats: 2, section: 'Varanda', hasQR: false },
  { id: '08', status: 'available', seats: 4, section: 'Salão', hasQR: true },
  { id: '09', status: 'reserved', seats: 6, section: 'Privativo', hasQR: true },
];

const statusMeta: Record<TableStatus, { label: string; card: string; text: string; border: string; dot: string }> = {
  available: { label: 'Livre', card: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-600' },
  occupied: { label: 'Ocupada', card: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-600' },
  reserved: { label: 'Reservada', card: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-600' },
  cleaning: { label: 'Limpeza', card: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-600' },
  blocked: { label: 'Bloqueada', card: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', dot: 'bg-slate-500' },
};

const statusOrder = Object.keys(statusMeta) as TableStatus[];

const TablesScreenV2: FC<TablesScreenV2Props> = ({ onNavigate }) => {
  const [tables, setTables] = useState(initialTables);
  const [selectedTableId, setSelectedTableId] = useState<string | null>('01');
  const selectedTable = tables.find((table) => table.id === selectedTableId);

  const updateStatus = (status: TableStatus) => {
    if (!selectedTableId) return;
    setTables((current) => current.map((table) => table.id === selectedTableId ? { ...table, status } : table));
  };

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-b from-muted/70 to-background pb-28">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button aria-label="Voltar" onClick={() => onNavigate('dashboard')} className="-ml-2 rounded-full p-2 transition-colors hover:bg-muted">
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-foreground">Mapa de Mesas</h1>
              <p className="truncate text-[11px] text-muted-foreground">Operação do salão em tempo real</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => onNavigate('qr-batch')} className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 py-2 text-primary transition-colors hover:bg-primary/20">
              <QrCode className="h-4 w-4" />
              <span className="text-xs font-bold">QR</span>
            </button>
            <button aria-label="Adicionar mesa" className="rounded-xl bg-primary p-2 text-primary-foreground shadow-sm transition-transform active:scale-95">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Legenda de status">
          {statusOrder.map((status) => {
            const meta = statusMeta[status];
            return (
              <span key={status} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${meta.card} ${meta.border} ${meta.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {tables.map((table) => {
            const meta = statusMeta[table.status];
            const selected = table.id === selectedTableId;
            return (
              <button
                key={table.id}
                aria-pressed={selected}
                aria-label={`Mesa ${table.id}, ${meta.label}, ${table.section}, ${table.seats} lugares`}
                onClick={() => setSelectedTableId(selected ? null : table.id)}
                className={`relative aspect-square overflow-hidden rounded-[14px] border p-2 text-center transition-all duration-200 ${meta.card} ${selected ? 'z-10 scale-[1.04] border-[3px] border-primary shadow-[0_8px_20px_rgba(234,88,12,0.24)]' : meta.border}`}
              >
                <span className={`absolute inset-x-0 top-0 h-1 ${meta.dot}`} />
                {table.hasQR && <QrCode className={`absolute right-1.5 top-2 h-3 w-3 ${meta.text}`} />}
                <div className="flex h-full flex-col items-center justify-center">
                  <span className={`text-[9px] font-black uppercase tracking-[0.08em] ${meta.text}`}>{meta.label}</span>
                  <div className="mt-0.5 flex items-baseline gap-1 leading-none">
                    <span className="text-[9px] font-semibold text-muted-foreground">Mesa</span>
                    <span className="text-[32px] font-black tracking-[-0.06em] text-foreground">{table.id}</span>
                  </div>
                  <span className="max-w-full truncate text-[10px] font-semibold text-muted-foreground">{table.section}</span>
                  <span className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-muted-foreground">
                    <Users className="h-3 w-3" /> {table.seats} lugares
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedTable && (
          <section className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
            <span className={`absolute inset-y-0 left-0 w-1 ${statusMeta[selectedTable.status].dot}`} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black tracking-[0.12em] text-muted-foreground">MESA SELECIONADA</p>
                <h2 className="text-xl font-black tracking-tight text-foreground">Mesa {selectedTable.id}</h2>
              </div>
              <div className="flex gap-1.5">
                <button aria-label="Editar mesa" className="rounded-xl bg-muted p-2 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button aria-label="Excluir mesa" className="rounded-xl bg-red-50 p-2 text-red-500 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[1.3fr_1fr_.7fr] gap-1.5">
              <div className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${statusMeta[selectedTable.status].card}`}>
                <span className={`h-2 w-2 rounded-full ${statusMeta[selectedTable.status].dot}`} />
                <div className="min-w-0"><p className="text-[8px] font-bold text-muted-foreground">Status atual</p><p className={`truncate text-xs font-black ${statusMeta[selectedTable.status].text}`}>{statusMeta[selectedTable.status].label}</p></div>
              </div>
              <div className="min-w-0 rounded-xl border border-border px-2.5 py-2"><p className="text-[8px] font-bold text-muted-foreground">Salão</p><p className="truncate text-xs font-black text-foreground">{selectedTable.section}</p></div>
              <div className="rounded-xl border border-border px-2.5 py-2"><p className="text-[8px] font-bold text-muted-foreground">Lugares</p><p className="text-xs font-black text-foreground">{selectedTable.seats}</p></div>
            </div>

            <p className="mb-2 mt-4 text-[9px] font-black tracking-[0.1em] text-muted-foreground">ALTERAR STATUS</p>
            <div className="flex flex-wrap gap-1.5">
              {statusOrder.map((status) => {
                const meta = statusMeta[status];
                const active = selectedTable.status === status;
                return (
                  <button key={status} aria-pressed={active} onClick={() => updateStatus(status)} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition-all ${active ? `${meta.card} ${meta.border} ${meta.text} shadow-sm` : 'border-border bg-background text-foreground hover:bg-muted'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
                  </button>
                );
              })}
            </div>

            <button onClick={() => onNavigate('qr-generator')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-transform active:scale-[0.99]">
              <QrCode className="h-4 w-4" /> Gerar QR Code
            </button>
          </section>
        )}
      </main>

      <RestaurantLiquidGlassNav activeTab="tables" onNavigate={onNavigate} />
    </div>
  );
};

export default TablesScreenV2;
