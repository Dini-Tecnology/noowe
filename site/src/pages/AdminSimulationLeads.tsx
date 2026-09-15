import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download, Users, Target, Clock, ArrowUpDown,
  CheckCircle, XCircle, TrendingUp,
} from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import NooweLogo from '@/components/site/NooweLogo';
import RequireAuth from '@/components/auth/RequireAuth';

const PROFILE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Dono', color: 'bg-primary/10 text-primary' },
  manager: { label: 'Gerente', color: 'bg-amber-500/10 text-amber-600' },
  team: { label: 'Equipe', color: 'bg-blue-500/10 text-blue-600' },
};

const PIE_COLORS = ['hsl(16, 85%, 56%)', 'hsl(38, 92%, 50%)', 'hsl(210, 70%, 55%)'];

interface LeadRow {
  id: string;
  profile: string;
  model: string;
  pillar: string | null;
  pain_points: string[] | null;
  acts_completed: number | null;
  completed: boolean | null;
  cta_clicked: string | null;
  language: string | null;
  total_time_seconds: number | null;
  time_per_act: Record<string, number> | null;
  created_at: string;
}

const StatCard = ({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string | number; accent: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
      accent === 'primary' ? 'bg-primary/10' : accent === 'warning' ? 'bg-amber-500/10' : accent === 'success' ? 'bg-emerald-500/10' : 'bg-blue-500/10'
    }`}>
      <Icon size={18} className={
        accent === 'primary' ? 'text-primary' : accent === 'warning' ? 'text-amber-600' : accent === 'success' ? 'text-emerald-600' : 'text-blue-600'
      } />
    </div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
  </div>
);

function AdminSimulationLeadsContent() {
  const [data, setData] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [profileFilter, setProfileFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [sortField, setSortField] = useState<'created_at' | 'acts_completed'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setLoading(true);
    supabase
      .from('simulation_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data: rows }) => {
        setData((rows as LeadRow[]) || []);
        setLoading(false);
      });
  }, []);

  const cutoff = useMemo(() => subDays(new Date(), days), [days]);

  const filtered = useMemo(() => {
    return data
      .filter(r => isAfter(new Date(r.created_at), cutoff))
      .filter(r => profileFilter === 'all' || r.profile === profileFilter)
      .filter(r => modelFilter === 'all' || r.model === modelFilter)
      .sort((a, b) => {
        const aVal = sortField === 'created_at' ? new Date(a.created_at).getTime() : (a.acts_completed ?? 0);
        const bVal = sortField === 'created_at' ? new Date(b.created_at).getTime() : (b.acts_completed ?? 0);
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
  }, [data, cutoff, profileFilter, modelFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter(r => r.completed).length;
    const avgActs = total > 0 ? (filtered.reduce((s, r) => s + (r.acts_completed ?? 0), 0) / total).toFixed(1) : '0';
    const avgTime = total > 0
      ? Math.round(filtered.reduce((s, r) => s + (r.total_time_seconds ?? 0), 0) / total)
      : 0;
    const ctaClicks = filtered.filter(r => r.cta_clicked).length;
    return { total, completed, avgActs, avgTime, ctaClicks };
  }, [filtered]);

  const profileChart = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(r => { counts[r.profile] = (counts[r.profile] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: PROFILE_LABELS[name]?.label || name, value }));
  }, [filtered]);

  const modelChart = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(r => { counts[r.model] = (counts[r.model] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered]);

  const uniqueModels = useMemo(() => [...new Set(data.map(r => r.model))].sort(), [data]);

  const toggleSort = (field: 'created_at' | 'acts_completed') => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const headers = ['Data', 'Perfil', 'Modelo', 'Pilar', 'Atos', 'Completo', 'CTA', 'Tempo (s)', 'Idioma'];
    const rows = filtered.map(r => [
      format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'),
      r.profile, r.model, r.pillar || '', r.acts_completed ?? 0,
      r.completed ? 'Sim' : 'Não', r.cta_clicked || '', r.total_time_seconds ?? '', r.language || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `simulation-leads-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NooweLogo />
          <span className="text-sm font-semibold text-foreground">Simulation Leads</span>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download size={14} className="mr-1.5" /> CSV
        </Button>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 rounded-xl border border-border p-0.5">
            {[7, 14, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos perfis</SelectItem>
              <SelectItem value="owner">Dono</SelectItem>
              <SelectItem value="manager">Gerente</SelectItem>
              <SelectItem value="team">Equipe</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Modelo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos modelos</SelectItem>
              {uniqueModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Total de leads" value={stats.total} accent="primary" />
          <StatCard icon={CheckCircle} label="Completaram" value={stats.completed} accent="success" />
          <StatCard icon={Target} label="Atos médios" value={stats.avgActs} accent="warning" />
          <StatCard icon={Clock} label="Tempo médio (s)" value={stats.avgTime} accent="info" />
          <StatCard icon={TrendingUp} label="Cliques CTA" value={stats.ctaClicks} accent="primary" />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground mb-4">Leads por perfil</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={profileChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {profileChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground mb-4">Leads por modelo</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={modelChart}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(16, 85%, 56%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('created_at')}>
                    <span className="inline-flex items-center gap-1">Data <ArrowUpDown size={12} /></span>
                  </TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Pilar</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('acts_completed')}>
                    <span className="inline-flex items-center gap-1">Atos <ArrowUpDown size={12} /></span>
                  </TableHead>
                  <TableHead>Completo</TableHead>
                  <TableHead>CTA</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Idioma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Nenhum lead encontrado</TableCell></TableRow>
                ) : filtered.slice(0, 100).map(row => (
                  <TableRow key={row.id} className="hover:bg-muted/20">
                    <TableCell className="text-xs">{format(new Date(row.created_at), 'dd/MM HH:mm')}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PROFILE_LABELS[row.profile]?.color || 'bg-muted text-foreground'}`}>
                        {PROFILE_LABELS[row.profile]?.label || row.profile}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{row.model}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.pillar || '—'}</TableCell>
                    <TableCell className="text-xs font-medium">{row.acts_completed ?? 0}/5</TableCell>
                    <TableCell>
                      {row.completed
                        ? <CheckCircle size={14} className="text-emerald-500" />
                        : <XCircle size={14} className="text-muted-foreground/40" />
                      }
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.cta_clicked || '—'}</TableCell>
                    <TableCell className="text-xs">{row.total_time_seconds ? `${Math.round(row.total_time_seconds)}s` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.language || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 100 && (
            <p className="text-xs text-muted-foreground text-center py-3">Mostrando 100 de {filtered.length} leads</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminSimulationLeads() {
  return (
    <RequireAuth
      allowedRoles={['admin', 'owner', 'manager']}
      title="Painel de Leads"
      description="Entre com Supabase Auth para consultar os leads de simulação."
    >
      <AdminSimulationLeadsContent />
    </RequireAuth>
  );
}
