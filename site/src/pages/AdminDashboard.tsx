import { useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import SEOHead from '@/components/seo/SEOHead';
import RequireAuth from '@/components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Activity, AlertTriangle, ChevronDown, Lock, LogOut, Search, ShieldCheck, TrendingUp, Users } from 'lucide-react';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  lastLogin: string;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  icon: ElementType;
  trend?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend && (
              <p className="text-xs text-primary flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3" /> {trend}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersTable() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError('');

      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id,email,full_name,is_active,last_login_at,created_at')
          .order('created_at', { ascending: false })
          .limit(500);

        if (profilesError) throw profilesError;

        const userIds = ((profiles as Array<{ id: string }> | null) ?? []).map((profile) => profile.id);
        const [profileRolesResult, restaurantRolesResult] =
          userIds.length > 0
            ? await Promise.all([
                supabase.from('profile_roles').select('user_id,role_key,is_active').in('user_id', userIds).eq('is_active', true),
                supabase.from('user_roles').select('user_id,role,is_active').in('user_id', userIds).eq('is_active', true),
              ])
            : [
                { data: [], error: null },
                { data: [], error: null },
              ];

        if (profileRolesResult.error) throw profileRolesResult.error;
        if (restaurantRolesResult.error) throw restaurantRolesResult.error;

        const rolesByUser = new Map<string, Set<string>>();
        for (const row of (profileRolesResult.data as Array<{ user_id: string; role_key: string }> | null) ?? []) {
          if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, new Set());
          rolesByUser.get(row.user_id)?.add(row.role_key);
        }
        for (const row of (restaurantRolesResult.data as Array<{ user_id: string; role: string }> | null) ?? []) {
          if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, new Set());
          rolesByUser.get(row.user_id)?.add(row.role);
        }

        setUsers(
          ((profiles as any[]) ?? []).map((profile) => ({
            id: profile.id,
            name: profile.full_name || profile.email || 'Sem nome',
            email: profile.email || '—',
            roles: Array.from(rolesByUser.get(profile.id) ?? new Set(['customer'])),
            status: profile.is_active === false ? 'inactive' : 'active',
            lastLogin: profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('pt-BR') : '—',
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar usuários.');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.roles.join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Usuários</CardTitle>
            <CardDescription>{users.length} contas visíveis pela sua role</CardDescription>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loadingUsers ? (
          <div className="py-8 text-center text-muted-foreground">Carregando usuários...</div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Nome</th>
                  <th className="pb-3 font-medium">E-mail</th>
                  <th className="pb-3 font-medium">Roles</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Último login</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{user.name}</td>
                    <td className="py-3 text-muted-foreground">{user.email}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.map((role) => (
                          <Badge key={role} variant={role === 'admin' || role === 'owner' ? 'default' : 'secondary'}>
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge
                        variant={user.status === 'active' ? 'default' : 'outline'}
                        className={user.status === 'active' ? 'bg-primary/10 text-primary hover:bg-primary/10' : ''}
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{user.lastLogin}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminDashboardBody() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const roleLabel = useMemo(() => {
    if (!user) return '—';
    if (user.roles.includes('admin')) return 'Admin';
    if (user.roles.includes('owner')) return 'Owner';
    if (user.roles.includes('manager')) return 'Manager';
    return user.roles[0] ?? 'User';
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Admin Dashboard"
        description="Painel administrativo protegido por Supabase Auth."
        noIndex
      />
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">Admin Dashboard</h1>
            <Badge variant="outline" className="text-xs">
              {roleLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Métricas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard title="Usuários" value="RLS" icon={Users} />
            <MetricCard title="Sessão" value="Supabase" icon={ShieldCheck} />
            <MetricCard title="Claims de role" value={user?.roles.length ?? 0} icon={Activity} />
            <MetricCard title="Restaurantes" value={user?.restaurantIds.length ?? 0} icon={TrendingUp} />
            <MetricCard title="Refresh token" value="Auto" icon={ChevronDown} />
            <MetricCard title="Policies" value="Ativas" icon={Lock} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Dados sensíveis são lidos diretamente do Supabase com RLS; não há endpoint custom de auth neste fluxo.
          </p>
        </section>

        <Separator />

        {isAdmin ? (
          <section>
            <UsersTable />
          </section>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                Gestão completa de usuários é restrita a contas com role admin.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <RequireAuth
      allowedRoles={['admin', 'owner', 'manager']}
      title="Admin Dashboard"
      description="Entre com e-mail e senha gerenciados pelo Supabase Auth."
    >
      <AdminDashboardBody />
    </RequireAuth>
  );
}
