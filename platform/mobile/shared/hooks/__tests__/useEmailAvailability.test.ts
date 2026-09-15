import { act, renderHook } from '@testing-library/react-native';
import { authService } from '../../services/auth';
import {
  EMAIL_CHECK_DEBOUNCE_MS,
  isEmailBlockedForSignup,
  useEmailAvailability,
} from '../useEmailAvailability';

jest.mock('../../services/auth', () => ({
  authService: { checkEmailAvailability: jest.fn() },
}));

const mockedCheck = authService.checkEmailAvailability as jest.Mock;

async function runDebouncedCheck() {
  await act(async () => {
    jest.advanceTimersByTime(EMAIL_CHECK_DEBOUNCE_MS);
  });
}

describe('useEmailAvailability', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedCheck.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not query the server while the email is incomplete', async () => {
    const { result } = renderHook(() => useEmailAvailability('dono@'));

    await runDebouncedCheck();

    expect(result.current).toBe('idle');
    expect(mockedCheck).not.toHaveBeenCalled();
    expect(isEmailBlockedForSignup(result.current)).toBe(false);
  });

  it('blocks signup while the check is in flight', () => {
    mockedCheck.mockResolvedValueOnce({ exists: false, confirmed: false });
    const { result } = renderHook(() => useEmailAvailability('novo@noowe.com'));

    expect(result.current).toBe('checking');
    expect(isEmailBlockedForSignup(result.current)).toBe(true);
  });

  it('blocks signup when the email already has a confirmed account', async () => {
    mockedCheck.mockResolvedValueOnce({ exists: true, confirmed: true });
    const { result } = renderHook(() => useEmailAvailability('  Dono@Noowe.com '));

    await runDebouncedCheck();

    expect(mockedCheck).toHaveBeenCalledWith('dono@noowe.com');
    expect(result.current).toBe('registered');
    expect(isEmailBlockedForSignup(result.current)).toBe(true);
  });

  it('blocks signup when the email exists but was never confirmed', async () => {
    mockedCheck.mockResolvedValueOnce({ exists: true, confirmed: false });
    const { result } = renderHook(() => useEmailAvailability('pendente@noowe.com'));

    await runDebouncedCheck();

    expect(result.current).toBe('unconfirmed');
    expect(isEmailBlockedForSignup(result.current)).toBe(true);
  });

  it('allows signup for an email without an account', async () => {
    mockedCheck.mockResolvedValueOnce({ exists: false, confirmed: false });
    const { result } = renderHook(() => useEmailAvailability('novo@noowe.com'));

    await runDebouncedCheck();

    expect(result.current).toBe('available');
    expect(isEmailBlockedForSignup(result.current)).toBe(false);
  });

  it('does not lock signup when the check itself fails', async () => {
    mockedCheck.mockRejectedValueOnce(new Error('Too many requests'));
    const { result } = renderHook(() => useEmailAvailability('novo@noowe.com'));

    await runDebouncedCheck();

    expect(result.current).toBe('unknown');
    expect(isEmailBlockedForSignup(result.current)).toBe(false);
  });

  it('checks only the last email typed within the debounce window', async () => {
    mockedCheck.mockResolvedValue({ exists: false, confirmed: false });
    const { result, rerender } = renderHook(
      ({ email }: { email: string }) => useEmailAvailability(email),
      { initialProps: { email: 'a@noowe.com' } },
    );

    await act(async () => {
      jest.advanceTimersByTime(EMAIL_CHECK_DEBOUNCE_MS - 100);
    });
    rerender({ email: 'ab@noowe.com' });
    await runDebouncedCheck();

    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck).toHaveBeenCalledWith('ab@noowe.com');
    expect(result.current).toBe('available');
  });

  it('ignores a late response for an email the user already changed', async () => {
    let resolveFirst: (value: { exists: boolean; confirmed: boolean }) => void = () => {};
    mockedCheck
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ exists: false, confirmed: false });

    const { result, rerender } = renderHook(
      ({ email }: { email: string }) => useEmailAvailability(email),
      { initialProps: { email: 'dono@noowe.com' } },
    );

    await runDebouncedCheck();
    rerender({ email: 'novo@noowe.com' });
    await runDebouncedCheck();
    expect(result.current).toBe('available');

    await act(async () => {
      resolveFirst({ exists: true, confirmed: true });
    });

    expect(result.current).toBe('available');
  });
});
