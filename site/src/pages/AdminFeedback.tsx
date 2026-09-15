import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Bug, Lightbulb, MousePointerClick, HelpCircle, Star, Download,
  ArrowUpDown, MessageSquare, TrendingUp, BarChart3, Eye,
  Monitor, Smartphone, Tablet, ChevronRight, Calendar, MapPin, Activity,
} from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import NooweLogo from '@/components/site/NooweLogo';
import RequireAuth from '@/components/auth/RequireAuth';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bgClass: string }> = {
  bug: { icon: Bug, label: 'Bug', color: 'hsl(0 84% 60%)', bgClass: 'bg-destructive/10 text-destructive' },
  improvement: { icon: Lightbulb, label: 'Melhoria', color: 'hsl(38 92% 50%)', bgClass: 'bg-amber-500/10 text-amber-600' },
  usability: { icon: MousePointerClick, label: 'Usabilidade', color: 'hsl(var(--primary))', bgClass: 'bg-primary/10 text-primary' },
  question: { icon: HelpCircle, label: 'Pergunta', color: 'hsl(210 70% 55%)', bgClass: 'bg-blue-500/10 text-blue-600' },
};

const PIE_COLORS = ['hsl(0, 84%, 60%)', 'hsl(38, 92%, 50%)', 'hsl(16, 85%, 56%)', 'hsl(210, 70%, 55%)'];

interface FeedbackRow {
  id: string;
  email: string | null;
  feedback_type: string;
  rating: number | null;
  description: string;
  page_route: string;
  demo_step: string | null;
  created_at: string;
  viewport_mode: string | null;
  active_role: string | null;
  journey_step: string | null;
  recent_actions: unknown[] | null;
}

// ── Stat Card ──
const StatCard = ({ icon: Icon, label, value, accent, suffix }: {
  icon: React.ElementType; label: string; value: string | number; accent: string; suffix?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
      accent === 'primary' ? 'bg-primary/10' :
      accent === 'warning' ? 'bg-amber-500/10' :
      accent === 'success' ? 'bg-emerald-500/10' :
      'bg-destructive/10'
    }`}>
      <Icon size={18} className={
        accent === 'primary' ? 'text-primary' :
        accent === 'warning' ? 'text-amber-500' :
        accent === 'success' ? 'text-emerald-500' :
        'text-destructive'
      } />
    </div>
    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

// ── Meta Item ──
const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
    <p className="text-xs text-foreground font-medium truncate">{value}</p>
  </div>
);

// ── Feedback Detail Drawer ──
const FeedbackDetail = ({ row }: { row: FeedbackRow }) => {
  const cfg = TYPE_CONFIG[row.feedback_type] || TYPE_CONFIG.improvement;
  const Icon = cfg.icon;

  return (
    <div className="space-y-6 pt-2">
      <SheetHeader>
        <SheetTitle className="text-lg font-bold">Detalhes do Feedback</SheetTitle>
      </SheetHeader>

      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${cfg.bgClass}`}>
          <Icon size={14} />
          {cfg.label}
        </span>
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Calendar size={13} />
          {format(new Date(row.created_at), 'dd/MM/yyyy HH:mm')}
        </span>
      </div>

      {row.rating && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rating</p>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={20} className={i < row.rating! ? 'text-amber-500 fill-amber-500' : 'text-border'} />
            ))}
            <span className="ml-2 text-sm font-semibold text-foreground">{row.rating}/5</span>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição</p>
        <p className="text-sm text-foreground leading-relaxed bg-muted/50 rounded-xl p-4">{row.description || '—'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetaItem label="Página" value={row.page_route} />
        <MetaItem label="Viewport" value={row.viewport_mode || '—'} />
        <MetaItem label="Role" value={row.active_role || '—'} />
        <MetaItem label="Journey Step" value={row.journey_step || '—'} />
        <MetaItem label="Demo Step" value={row.demo_step || '—'} />
        <MetaItem label="Email" value={row.email || '—'} />
      </div>

      {row.recent_actions && row.recent_actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Últimas ações</p>
          <div className="space-y-1.5">
            {(row.recent_actions as string[]).map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <span className="text-foreground/70">{String(action)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Viewport Icon ──
const ViewportIcon = ({ mode }: { mode: string | null }) => {
  if (mode === 'mobile') return <Smartphone size={14} className="text-muted-foreground" />;
  if (mode === 'tablet') return <Tablet size={14} className="text-muted-foreground" />;
  return <Monitor size={14} className="text-muted-foreground" />;
};

// ── Main Component ──
const AdminFeedbackContent: React.FC = () => {
  const [data, setData] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [sortField, setSortField] = useState<'created_at' | 'rating'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedRow, setSelectedRow] = useState<FeedbackRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from('demo_feedback')
        .select('*')
        .order('created_at', { ascending: false });
      setData((rows as FeedbackRow[]) || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const uniqueRoutes = useMemo(() => [...new Set(data.map(r => r.page_route))].sort(), [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (typeFilter !== 'all') result = result.filter(r => r.feedback_type === typeFilter);
    if (routeFilter !== 'all') result = result.filter(r => r.page_route === routeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.description?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.page_route.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortField === 'created_at') {
        return sortDir === 'desc'
          ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === 'desc' ? (b.rating || 0) - (a.rating || 0) : (a.rating || 0) - (b.rating || 0);
    });
  }, [data, typeFilter, routeFilter, sortField, sortDir, searchQuery]);

  const stats = useMemo(() => {
    const rated = data.filter(r => r.rating && r.rating > 0);
    const avgRating = rated.length > 0 ? rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length : 0;
    const last7 = data.filter(r => isAfter(new Date(r.created_at), subDays(new Date(), 7))).length;
    const bugCount = data.filter(r => r.feedback_type === 'bug').length;
    return { total: data.length, avgRating, last7, bugCount };
  }, [data]);

  const typeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(r => { counts[r.feedback_type] = (counts[r.feedback_type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({
      name: TYPE_CONFIG[type]?.label || type, value: count, type,
    }));
  }, [data]);

  const ratingChartData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    data.forEach(r => { if (r.rating && r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++; });
    return counts.map((count, i) => ({ rating: `${i + 1}★`, count }));
  }, [data]);

  const timelineData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) { days[format(subDays(new Date(), i), 'dd/MM')] = 0; }
    data.forEach(r => {
      const day = format(new Date(r.created_at), 'dd/MM');
      if (days[day] !== undefined) days[day]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date, count }));
  }, [data]);

  const routeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(r => { counts[r.page_route] = (counts[r.page_route] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([route, count]) => ({ route: route.replace(/^\//, '') || '/', count }));
  }, [data]);

  const toggleSort = (field: 'created_at' | 'rating') => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportCsv = () => {
    const headers = ['Date', 'Type', 'Rating', 'Description', 'Page', 'Email', 'Viewport', 'Role', 'Journey Step', 'Recent Actions'];
    const rows = filtered.map(r => [
      format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
      r.feedback_type, r.rating || '',
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.page_route, r.email || '', r.viewport_mode || '',
      r.active_role || '', r.journey_step || '',
      r.recent_actions ? `"${(r.recent_actions as string[]).join(' → ')}"` : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `noowe-feedback-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Dashboard ──
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NooweLogo size="sm" />
            <div className="w-px h-6 bg-border" />
            <span className="text-sm font-semibold text-foreground">Feedback Dashboard</span>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={14} className="mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard icon={MessageSquare} label="Total de Feedbacks" value={stats.total} accent="primary" />
              <StatCard icon={Star} label="Rating Médio" value={stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'} accent="warning" suffix={stats.avgRating > 0 ? '/ 5' : ''} />
              <StatCard icon={TrendingUp} label="Últimos 7 dias" value={stats.last7} accent="success" />
              <StatCard icon={Bug} label="Bugs Reportados" value={stats.bugCount} accent="destructive" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-primary" /> Feedbacks por dia (14 dias)
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(16, 85%, 56%)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(16, 85%, 56%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    <Area type="monotone" dataKey="count" stroke="hsl(16, 85%, 56%)" fill="url(#colorCount)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-primary" /> Por tipo
                </h3>
                {typeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={typeChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                        {typeChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Sem dados</div>
                )}
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {typeChartData.map((d, i) => (
                    <div key={d.type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Star size={16} className="text-amber-500" /> Distribuição de ratings
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={ratingChartData}>
                    <XAxis dataKey="rating" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(38, 92%, 50%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <MapPin size={16} className="text-primary" /> Top páginas
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={routeChartData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="route" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="hsl(16, 85%, 56%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Input placeholder="Buscar por descrição, email ou rota..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="w-full sm:w-72 h-10" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] h-10"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="improvement">Melhoria</SelectItem>
                  <SelectItem value="usability">Usabilidade</SelectItem>
                  <SelectItem value="question">Pergunta</SelectItem>
                </SelectContent>
              </Select>
              <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger className="w-[180px] h-10"><SelectValue placeholder="Página" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as páginas</SelectItem>
                  {uniqueRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card text-center py-20 text-muted-foreground">Nenhum feedback encontrado</div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10" />
                        <TableHead>
                          <button onClick={() => toggleSort('created_at')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                            Data <ArrowUpDown size={11} />
                          </button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Tipo</TableHead>
                        <TableHead>
                          <button onClick={() => toggleSort('rating')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                            Rating <ArrowUpDown size={11} />
                          </button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider min-w-[280px]">Descrição</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Página</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Device</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(row => {
                        const cfg = TYPE_CONFIG[row.feedback_type] || TYPE_CONFIG.improvement;
                        const Icon = cfg.icon;
                        return (
                          <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedRow(row)}>
                            <TableCell><ChevronRight size={14} className="text-muted-foreground" /></TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.created_at), 'dd/MM/yy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${cfg.bgClass}`}>
                                <Icon size={12} /> {cfg.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              {row.rating ? (
                                <div className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={12} className={i < row.rating! ? 'text-amber-500 fill-amber-500' : 'text-border'} />
                                  ))}
                                </div>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-sm max-w-[400px]">
                              <p className="line-clamp-2 text-foreground/80">{row.description || '—'}</p>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{row.page_route}</code>
                            </TableCell>
                            <TableCell><ViewportIcon mode={row.viewport_mode} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.email || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={!!selectedRow} onOpenChange={open => !open && setSelectedRow(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedRow && <FeedbackDetail row={selectedRow} />}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default function AdminFeedback() {
  return (
    <RequireAuth
      allowedRoles={['admin', 'owner', 'manager']}
      title="Painel de Feedbacks"
      description="Entre com Supabase Auth para consultar feedbacks."
    >
      <AdminFeedbackContent />
    </RequireAuth>
  );
}
