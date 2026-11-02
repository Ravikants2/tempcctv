import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import {
  changeManagedUserPassword,
  createManagedUser,
  loginUser,
  logoutUser,
  restoreSession,
  saveData,
} from './storage';

describe('GitHub-backed authentication', () => {
  let database: Record<string, unknown>;
  let dataSha: string;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    database = {
      schemaVersion: 1,
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
    dataSha = 'sha-1';
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/contents/db.json?ref=data') && (!init || init.method !== 'PUT')) {
        return new Response(JSON.stringify({
          encoding: 'base64',
          content: btoa(JSON.stringify(database)),
          sha: dataSha,
        }), { status: 200 });
      }
      if (url.endsWith('/contents/db.json') && init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body)) as { content: string; sha: string };
        expect(payload.sha).toBe(dataSha);
        database = JSON.parse(atob(payload.content)) as Record<string, unknown>;
        dataSha = 'sha-2';
        return new Response(JSON.stringify({ content: { sha: dataSha } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    });
  });

  it('creates a first Super Admin in the private repo and verifies subsequent logins', async () => {
    const session = await loginUser(
      'admin@example.com',
      'secure-demo-password',
      'github_pat_test_secret',
      'Demo Admin'
    );

    expect(session?.user).toMatchObject({
      name: 'Demo Admin',
      email: 'admin@example.com',
      role: 'super_admin',
    });
    expect(session?.data.auditLogs).toHaveLength(1);
    expect(session?.data.auditLogs[0].action).toBe('LOGIN');
    expect(session?.data.users[0]).not.toHaveProperty('passwordHash');
    expect(sessionStorage.getItem('ion_github_data_token')).toBe('github_pat_test_secret');
    expect(localStorage.length).toBe(0);
    expect(database.users).toEqual([
      expect.objectContaining({ email: 'admin@example.com', role: 'super_admin' }),
    ]);
    expect(JSON.stringify(database)).not.toContain('secure-demo-password');
    expect(JSON.stringify(database)).not.toContain('github_pat_test_secret');

    const newUser: User = {
      id: 'member-1',
      name: 'Demo Member',
      email: 'member@example.com',
      role: 'user',
    };
    const createdUser = await createManagedUser(newUser, 'member-password-123');
    await saveData({
      ...session!.data,
      users: [...session!.data.users, createdUser],
    });
    const firstMemberHash = (database.users as Array<Record<string, unknown>>)
      .find(user => user.id === newUser.id)?.passwordHash;
    expect(firstMemberHash).toMatch(/^pbkdf2\$100000\$/);
    expect(JSON.stringify(database)).not.toContain('member-password-123');

    await changeManagedUserPassword(newUser.id, 'updated-member-password');
    await saveData({
      ...session!.data,
      users: [...session!.data.users, createdUser],
    });
    const updatedMemberHash = (database.users as Array<Record<string, unknown>>)
      .find(user => user.id === newUser.id)?.passwordHash;
    expect(updatedMemberHash).not.toBe(firstMemberHash);
    expect(JSON.stringify(database)).not.toContain('updated-member-password');

    await logoutUser();
    await expect(loginUser('admin@example.com', 'wrong-password', 'github_pat_test_secret'))
      .resolves.toBeNull();
    await expect(loginUser('admin@example.com', 'secure-demo-password', 'github_pat_test_secret'))
      .resolves.toMatchObject({ user: { email: 'admin@example.com', role: 'super_admin' } });
  });

  it('restores a session through the private repo and clears the token on sign-out', async () => {
    await loginUser('admin@example.com', 'secure-demo-password', 'github_pat_test_secret');
    expect(await restoreSession()).toMatchObject({ user: { email: 'admin@example.com' } });
    await logoutUser();
    expect(await restoreSession()).toBeNull();
    expect(sessionStorage.getItem('ion_github_data_token')).toBeNull();
  });

  it('resets the existing Super Admin password without changing the user ID', async () => {
    const original = await loginUser('admin@example.com', 'original-admin-password', 'github_pat_test_secret');
    await logoutUser();

    const recovered = await loginUser(
      'admin@example.com',
      'replacement-admin-password',
      'github_pat_test_secret',
      'Admin',
      true
    );
    expect(recovered?.user.id).toBe(original?.user.id);
    expect(database.users).toHaveLength(1);

    await logoutUser();
    await expect(loginUser('admin@example.com', 'original-admin-password', 'github_pat_test_secret'))
      .resolves.toBeNull();
    await expect(loginUser('admin@example.com', 'replacement-admin-password', 'github_pat_test_secret'))
      .resolves.toMatchObject({ user: { id: original?.user.id, role: 'super_admin' } });
  });

  it('keeps a legacy Super Admin ID and migrates a saved password to a hash', async () => {
    database.users = [{
      id: 'legacy-super-admin-id',
      name: 'Existing Admin',
      email: 'legacy@example.com',
      role: 'super_admin',
      password: 'legacy-password-123',
    }];

    const session = await loginUser(
      'legacy@example.com',
      'legacy-password-123',
      'github_pat_test_secret'
    );

    expect(session?.user.id).toBe('legacy-super-admin-id');
    expect(session?.user).not.toHaveProperty('password');
    const savedAdmin = (database.users as Array<Record<string, unknown>>)[0];
    expect(savedAdmin.password).toBeUndefined();
    expect(savedAdmin.passwordHash).toMatch(/^pbkdf2\$100000\$/);
    expect(JSON.stringify(database)).not.toContain('legacy-password-123');
  });
});
