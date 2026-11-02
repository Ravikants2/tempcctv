import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Cloudflare Worker API client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_ENDPOINT', 'https://worker.example');
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('authenticates with the app credentials and keeps only the returned session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      token: 'signed-app-session',
      user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'super_admin' },
      data: { users: [] },
    }), { status: 200 }));
    const { loginUser } = await import('./storage');

    await expect(loginUser('admin@example.com', 'app-password')).resolves.toMatchObject({
      user: { id: 'admin-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith('https://worker.example/api/auth/login', expect.objectContaining({
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ email: 'admin@example.com', password: 'app-password' }),
    }));
    const requestHeaders = new Headers(vi.mocked(fetchMock).mock.calls[0][1]?.headers);
    expect(requestHeaders.has('Authorization')).toBe(false);
    expect(sessionStorage.getItem('ion_session')).toBe('signed-app-session');
    expect(localStorage.length).toBe(0);
  });

  it('attaches the app session to authenticated API calls and clears it on logout', async () => {
    sessionStorage.setItem('ion_session', 'signed-app-session');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const { logoutUser, loadData } = await import('./storage');

    await loadData();
    await logoutUser();

    expect(new Headers(vi.mocked(fetchMock).mock.calls[0][1]?.headers).get('Authorization'))
      .toBe('Bearer signed-app-session');
    expect(new Headers(vi.mocked(fetchMock).mock.calls[1][1]?.headers).get('Authorization'))
      .toBe('Bearer signed-app-session');
    expect(sessionStorage.getItem('ion_session')).toBeNull();
  });

  it('removes previously remembered GitHub tokens from browser storage', async () => {
    localStorage.setItem('ion_github_data_token_remembered', 'old-github-token');
    sessionStorage.setItem('ion_github_data_token', 'old-session-github-token');
    const { restoreSession } = await import('./storage');

    await expect(restoreSession()).resolves.toBeNull();

    expect(localStorage.getItem('ion_github_data_token_remembered')).toBeNull();
    expect(sessionStorage.getItem('ion_github_data_token')).toBeNull();
  });
});
