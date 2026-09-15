import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type AppRole, supabaseAuthService } from '@/lib/supabase-auth';
import { useAuth } from '@/hooks/useAuth';

interface RequireAuthProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
  title?: string;
  description?: string;
}

function AuthForm({ title, description }: { title: string; description: string }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setLoading(true);
      setError('');
      setMessage('');

      try {
        await signIn(email, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, signIn]
  );

  const handleResetPassword = useCallback(async () => {
    if (!email) {
      setError('Informe seu e-mail para receber o link de redefinição.');
      return;
    }

    setResetLoading(true);
    setError('');
    setMessage('');

    try {
      await supabaseAuthService.sendPasswordReset(email);
      setMessage('Enviamos um link de redefinição de senha para este e-mail.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail de redefinição.');
    } finally {
      setResetLoading(false);
    }
  }, [email]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-email">E-mail</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Senha</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {message && (
              <div className="flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{message}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || resetLoading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResetPassword}
              disabled={loading || resetLoading}
            >
              {resetLoading ? 'Enviando...' : 'Esqueci minha senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RequireAuth({
  children,
  allowedRoles,
  title = 'Acesso restrito',
  description = 'Entre com sua conta Supabase para continuar.',
}: RequireAuthProps) {
  const { user, loading, hasAnyRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando sessão...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm title={title} description={description} />;
  }

  if (allowedRoles && !hasAnyRole(allowedRoles)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Acesso negado</CardTitle>
            <CardDescription>Esta área exige uma das roles: {allowedRoles.join(', ')}.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
