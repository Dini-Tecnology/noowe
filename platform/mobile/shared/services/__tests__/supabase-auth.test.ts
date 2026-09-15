import { supabaseAuthAdapter } from '../supabase-auth';
import { getSupabaseClient } from '../supabase';

jest.mock('../supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../../utils/auth-redirect', () => ({
  getAuthRedirectUrl: jest.fn(() => 'noowe://auth/callback'),
}));
jest.mock('expo-linking', () => ({}));

const invoke = jest.fn();

describe('supabaseAuthAdapter — register-with-resend', () => {
  beforeEach(() => {
    invoke.mockReset();
    (getSupabaseClient as jest.Mock).mockReturnValue({ functions: { invoke } });
  });

  describe('checkEmailAvailability', () => {
    it('asks the function only for the email, without password or redirect', async () => {
      invoke.mockResolvedValueOnce({ data: { exists: true, confirmed: false }, error: null });

      const result = await supabaseAuthAdapter.checkEmailAvailability('dono@noowe.com');

      expect(invoke).toHaveBeenCalledWith('register-with-resend', {
        body: { action: 'check-email', email: 'dono@noowe.com' },
      });
      expect(result).toEqual({ exists: true, confirmed: false });
    });

    it('treats a response without flags as a free email', async () => {
      invoke.mockResolvedValueOnce({ data: {}, error: null });

      await expect(supabaseAuthAdapter.checkEmailAvailability('novo@noowe.com')).resolves.toEqual({
        exists: false,
        confirmed: false,
      });
    });
  });

  describe('resendSignupConfirmation', () => {
    it('reports that no email was sent when the account is already confirmed', async () => {
      invoke.mockResolvedValueOnce({ data: { success: true, confirmationSent: false }, error: null });

      await expect(supabaseAuthAdapter.resendSignupConfirmation('dono@noowe.com')).resolves.toEqual({
        confirmationSent: false,
      });
    });

    it('reports the email as sent when the function confirms it', async () => {
      invoke.mockResolvedValueOnce({ data: { success: true, confirmationSent: true }, error: null });

      await expect(supabaseAuthAdapter.resendSignupConfirmation('pendente@noowe.com')).resolves.toEqual({
        confirmationSent: true,
      });
    });
  });
});
