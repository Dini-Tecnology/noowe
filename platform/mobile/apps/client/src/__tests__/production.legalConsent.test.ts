// QA 26/11 item 12a: o aceite dos Termos vai para o servidor (RPC), não para o perfil, e versão nova pede reaceite.
import { supabaseAuthAdapter } from '@/shared/services/supabase-auth';
import { getSupabaseClient } from '@/shared/services/supabase';
import { LEGAL_VERSIONS } from '@/shared/config/legal';

jest.mock('@/shared/services/supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/shared/utils/auth-redirect', () => ({ getAuthRedirectUrl: jest.fn(() => 'noowe://auth/callback') }));
jest.mock('expo-linking', () => ({}));

const rpc = jest.fn();
let consents: Array<{ consent_type: string; version: string }> = [];
const query: any = { select: () => query, eq: () => query, is: () => Promise.resolve({ data: consents, error: null }) };
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue({
    rpc,
    from: jest.fn(() => query),
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    },
  });
});

it('grava o aceite pela RPC accept_legal_terms', async () => {
  await supabaseAuthAdapter.acceptLegalTerms('1.0', '1.0');
  expect(rpc).toHaveBeenCalledWith('accept_legal_terms', { p_terms_version: '1.0', p_privacy_version: '1.0' });
});

it('falha alto quando o servidor recusa', async () => {
  rpc.mockResolvedValueOnce({ error: new Error('x') });
  await expect(supabaseAuthAdapter.acceptLegalTerms('1.0', '1.0')).rejects.toThrow('x');
});

it('pede reaceite só quando falta a versão vigente', async () => {
  consents = [{ consent_type: 'terms_of_service', version: LEGAL_VERSIONS.terms }, { consent_type: 'privacy_policy', version: LEGAL_VERSIONS.privacy }];
  await expect(supabaseAuthAdapter.pendingLegalVersions(LEGAL_VERSIONS)).resolves.toBeNull();
  consents = [{ consent_type: 'terms_of_service', version: '0.9' }, { consent_type: 'privacy_policy', version: LEGAL_VERSIONS.privacy }];
  await expect(supabaseAuthAdapter.pendingLegalVersions(LEGAL_VERSIONS)).resolves.toEqual({
    currentTermsVersion: LEGAL_VERSIONS.terms, currentPrivacyVersion: LEGAL_VERSIONS.privacy,
  });
});
