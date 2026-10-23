// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataApiInternals, handleDataApi } from './data-api.js';

const origin = 'https://ravikants2.github.io';
const env = {
  ALLOWED_ORIGINS: origin,
  DATA_PAT: 'server-only-test-token',
  DATA_REPO_OWNER: 'Ravikants2',
  DATA_REPO_NAME: 'ion-cctv-private-data',
  DATA_BRANCH: 'data',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
};

function emptyDatabase() {
  return {
    users: [],
    requirements: [],
    vendors: [],
    installations: [],
    examDates: [],
    quotations: [],
    quoteRevisions: [],
    approvalEvents: [],
    blanketApprovals: [],
    accessRoles: [],
    userGroups: [],
    auditLogs: [],
  };
}

function contentResponse(database, sha) {
  const bytes = new TextEncoder().encode(JSON.stringify(database));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return new Response(JSON.stringify({
    sha,
    content: btoa(binary),
  }), { status: 200 });
}

function request(path, method = 'GET', body, token) {
  const headers = new Headers({ Origin: origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createGitHubMock(database) {
  const savedPayloads = [];
  let currentSha = 'existing-file-sha';
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const method = options?.method || 'GET';
    expect(options?.headers?.Authorization).toBe(`Bearer ${env.DATA_PAT}`);
    if (method === 'GET') return contentResponse(database, currentSha);
    if (method === 'PUT') {
      const payload = JSON.parse(String(options.body));
      expect(payload.sha).toBe(currentSha);
      const saved = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(payload.content), (character) => character.charCodeAt(0))
      ));
      savedPayloads.push(saved);
      Object.assign(database, saved);
      currentSha = 'updated-file-sha';
      return new Response(JSON.stringify({ content: { sha: 'updated-file-sha' } }), { status: 200 });
    }
    throw new Error(`Unexpected GitHub request method: ${method}`);
  });
  return { fetchMock, savedPayloads };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('secure GitHub data API', () => {
  it('hashes passwords with a salted, slow PBKDF2 hash', async () => {
    const first = await dataApiInternals.derivePasswordHash('Correct horse battery staple!');
    const second = await dataApiInternals.derivePasswordHash('Correct horse battery staple!');
    expect(first.split('$')[1]).toBe('100000');
    expect(first).not.toBe(second);
    await expect(dataApiInternals.verifyPassword('Correct horse battery staple!', first)).resolves.toBe(true);
    await expect(dataApiInternals.verifyPassword('wrong password', first)).resolves.toBe(false);
  });

  it('rejects an untrusted browser origin before reading private data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handleDataApi(
      new Request('https://worker.example/api/data', { headers: { Origin: 'https://attacker.example' } }),
      env,
      'https://attacker.example',
      [origin]
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('migrates legacy demo hashes and bootstraps one administrator', async () => {
    const database = {
      ...emptyDatabase(),
      users: [{
        id: 'legacy-user',
        name: 'Old Admin',
        email: 'old-admin@example.com',
        role: 'super_admin',
        passwordHash: 'demo_unsafe_hash',
      }],
    };
    const { savedPayloads } = createGitHubMock(database);
    const migrationEnv = {
      ...env,
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'new-secure-admin-password',
    };
    const response = await handleDataApi(
      request('/api/auth/login', 'POST', {
        email: 'admin@example.com',
        password: 'new-secure-admin-password',
      }),
      migrationEnv,
      origin,
      [origin]
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.user.email).toBe('admin@example.com');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(savedPayloads).toHaveLength(2);
    expect(savedPayloads[0].users.find((user) => user.id === 'legacy-user').passwordHash).toBe('');
    expect(savedPayloads[0].users.find((user) => user.email === 'admin@example.com').passwordHash).toMatch(/^pbkdf2\$/);
  });

  it('returns authenticated activity without exposing password hashes', async () => {
    const passwordHash = await dataApiInternals.derivePasswordHash('Correct horse battery staple!');
    const database = {
      ...emptyDatabase(),
      authVersion: 1,
      users: [{
        id: 'admin-1',
        name: 'Test Admin',
        email: 'admin@example.com',
        role: 'super_admin',
        passwordHash,
        tokenVersion: 0,
      }],
    };
    createGitHubMock(database);

    const loginResponse = await handleDataApi(
      request('/api/auth/login', 'POST', { email: 'admin@example.com', password: 'Correct horse battery staple!' }),
      env,
      origin,
      [origin]
    );
    const { token } = await loginResponse.json();
    expect(loginResponse.status).toBe(200);

    const dataResponse = await handleDataApi(
      request('/api/data', 'GET', undefined, token),
      env,
      origin,
      [origin]
    );
    const visibleData = await dataResponse.json();
    expect(dataResponse.status).toBe(200);
    expect(visibleData.users[0]).not.toHaveProperty('passwordHash');
    expect(visibleData.auditLogs.some((entry) => entry.action === 'LOGIN' && entry.userId === 'admin-1')).toBe(true);
  });

  it('preserves authentication metadata and credentials when application data is saved', async () => {
    const passwordHash = await dataApiInternals.derivePasswordHash('Correct horse battery staple!');
    const user = {
      id: 'admin-1',
      name: 'Test Admin',
      email: 'admin@example.com',
      role: 'super_admin',
      passwordHash,
      tokenVersion: 0,
    };
    const database = { ...emptyDatabase(), authVersion: 1, users: [user] };
    const { savedPayloads } = createGitHubMock(database);
    const token = await dataApiInternals.createSession(user, env);
    const response = await handleDataApi(
      request('/api/data', 'PUT', {
        data: {
          ...emptyDatabase(),
          users: [{ ...user, passwordHash: undefined }],
          requirements: [{ id: 'requirement-1', zone: 'North' }],
        },
      }, token),
      env,
      origin,
      [origin]
    );

    expect(response.status).toBe(200);
    expect(savedPayloads.at(-1).authVersion).toBe(1);
    expect(savedPayloads.at(-1).users[0].passwordHash).toBe(passwordHash);
    expect(savedPayloads.at(-1).auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'RequirementMaster',
        entityId: 'requirement-1',
        userId: user.id,
      }),
    ]));

    const sessionResponse = await handleDataApi(
      request('/api/auth/session', 'GET', undefined, token),
      env,
      origin,
      [origin]
    );
    expect(sessionResponse.status).toBe(200);
  });

  it('allows Super Admin account creation and password resets with audited revocation', async () => {
    const admin = {
      id: 'admin-1',
      name: 'Test Admin',
      email: 'admin@example.com',
      role: 'super_admin',
      passwordHash: await dataApiInternals.derivePasswordHash('Correct horse battery staple!'),
      tokenVersion: 0,
    };
    const database = { ...emptyDatabase(), authVersion: 1, users: [admin] };
    const { savedPayloads } = createGitHubMock(database);
    const adminToken = await dataApiInternals.createSession(admin, env);
    const createResponse = await handleDataApi(
      request('/api/users', 'POST', {
        user: {
          id: 'user-2',
          name: 'Managed User',
          email: 'managed@example.com',
          role: 'user',
          groupIds: [],
        },
        password: 'initial-user-password',
      }, adminToken),
      env,
      origin,
      [origin]
    );
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(created.user).not.toHaveProperty('passwordHash');

    const oldSession = await dataApiInternals.createSession(database.users.find((user) => user.id === 'user-2'), env);
    const resetResponse = await handleDataApi(
      request('/api/users/user-2/password', 'PUT', { password: 'replacement-password' }, adminToken),
      env,
      origin,
      [origin]
    );
    expect(resetResponse.status).toBe(200);
    expect(savedPayloads.at(-1).auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'UserPassword',
        entityId: 'user-2',
        userId: admin.id,
      }),
    ]));

    const revokedResponse = await handleDataApi(
      request('/api/data', 'GET', undefined, oldSession),
      env,
      origin,
      [origin]
    );
    expect(revokedResponse.status).toBe(401);

    const signInResponse = await handleDataApi(
      request('/api/auth/login', 'POST', {
        email: 'managed@example.com',
        password: 'replacement-password',
      }),
      env,
      origin,
      [origin]
    );
    expect(signInResponse.status).toBe(200);
  });

  it('rejects data reads without an authenticated user', async () => {
    const database = {
      ...emptyDatabase(),
      authVersion: 1,
      users: [{
        id: 'admin-1',
        name: 'Test Admin',
        email: 'admin@example.com',
        role: 'super_admin',
        passwordHash: await dataApiInternals.derivePasswordHash('Correct horse battery staple!'),
        tokenVersion: 0,
      }],
    };
    createGitHubMock(database);
    const response = await handleDataApi(request('/api/data'), env, origin, [origin]);
    expect(response.status).toBe(401);
  });
});
