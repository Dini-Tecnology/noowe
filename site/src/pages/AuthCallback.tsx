import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabaseAuthService } from '@/lib/supabase-auth';

function readHashParams() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return new URLSearchParams();
  return new URLSearchParams(hash);
}

function resolveMobileScheme(appParam: string | null) {
  if (appParam === 'restaurant') return 'okinawa-restaurant';
  if (appParam === 'client') return 'noowe';
  return null;
}

function mapAuthError(code: string | null, description: string | null) {
  if (code === 'otp_expired') {
    return 'Este link de confirmação expirou. Faça um novo cadastro ou solicite outro e-mail.';
  }
  if (description) return description;
  if (code) return `Não foi possível confirmar: ${code}`;
  return 'Link inválido ou expirado.';
}

function buildMobileDeepLink(scheme: string) {
  return `${scheme}://auth/callback${window.location.search}${window.location.hash}`;
}

export default function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirmando sua sessão...');

  useEffect(() => {
    const confirmSession = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = readHashParams();
      const mobileScheme = resolveMobileScheme(searchParams.get('app'));
      const authError = hashParams.get('error') ?? hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');

      if (authError) {
        if (mobileScheme) {
          window.location.replace(buildMobileDeepLink(mobileScheme));
          return;
        }
        setStatus('error');
        setMessage(mapAuthError(authError, errorDescription));
        return;
      }

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = searchParams.get('code');

      if (mobileScheme && (accessToken || refreshToken || code)) {
        setMessage('Abrindo o app NOOWE...');
        window.location.replace(buildMobileDeepLink(mobileScheme));
        return;
      }

      try {
        if (code) {
          await supabaseAuthService.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabaseAuthService.setSessionFromTokens(accessToken, refreshToken);
        } else {
          await supabaseAuthService.getCurrentUser();
        }
        setStatus('success');
        setMessage('Sessão confirmada com sucesso.');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Link inválido ou expirado.');
      }
    };

    confirmSession();
  }, []);

  const Icon = status === 'loading' ? Loader2 : status === 'success' ? CheckCircle2 : XCircle;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className={`h-6 w-6 text-primary ${status === 'loading' ? 'animate-spin' : ''}`} />
          </div>
          <CardTitle>Autenticação Supabase</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" disabled={status === 'loading'}>
            <Link to="/admin">Ir para o painel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
