import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const storageMocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  logoutUser: vi.fn(async () => {
    sessionStorage.removeItem('ion_session');
  }),
  restoreSession: vi.fn(),
}));

vi.mock('../utils/storage', async importOriginal => {
  const actual = await importOriginal<typeof import('../utils/storage')>();
  return {
    ...actual,
    loginUser: storageMocks.loginUser,
    logoutUser: storageMocks.logoutUser,
    restoreSession: storageMocks.restoreSession,
  };
});

function LoginProbe() {
  const { login } = useAuth();
  return <button onClick={() => void login('user@example.com', 'password').catch(() => undefined)}>
    Sign in
  </button>;
}

describe('AuthProvider login failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('ion_session', 'existing-session');
    storageMocks.restoreSession.mockRejectedValue(new Error('Failed to fetch'));
    storageMocks.loginUser.mockRejectedValue(new Error('Failed to fetch'));
  });

  it('preserves the existing session after a transient sign-in failure', async () => {
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(storageMocks.restoreSession).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(storageMocks.loginUser).toHaveBeenCalled());
    expect(storageMocks.logoutUser).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ion_session')).toBe('existing-session');
  });
});
