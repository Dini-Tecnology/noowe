import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabaseAuthService } from '@/lib/supabase-auth';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkError, setLinkError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setCheckingLink(false);
      return;
    }

    let active = true;
    supabaseAuthService
      .exchangeCodeForSession(code)
      .catch((err) => {
        if (!active) return;
        setLinkError(true);
        setError(err instanceof Error ? err.message : 'Link de recuperação inválido ou expirado.');
      })
      .finally(() => {
        if (active) setCheckingLink(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError('');

      if (password.length < 8) {
        setError('A senha deve ter pelo menos 8 caracteres.');
        return;
      }

      if (password !== confirmPassword) {
        setError('As senhas não conferem.');
        return;
      }

      setLoading(true);
      try {
        await supabaseAuthService.updatePassword(password);
        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
      } finally {
        setLoading(false);
      }
    },
    [confirmPassword, password]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {success ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle>Redefinir senha</CardTitle>
          <CardDescription>
            {success ? 'Sua senha foi atualizada.' : 'Informe uma nova senha para sua conta.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <p className="text-center text-sm text-muted-foreground">Você já pode voltar ao login e entrar novamente.</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
	              {error && (
	                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
	                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
	                  <p>{error}</p>
	                </div>
	              )}
	              <Button type="submit" className="w-full" disabled={loading || checkingLink || linkError}>
	                {checkingLink ? 'Validando link...' : loading ? 'Salvando...' : 'Salvar nova senha'}
	              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
