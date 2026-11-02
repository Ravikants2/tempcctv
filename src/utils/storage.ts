import { v4 as uuidv4 } from 'uuid';
import type { AppData, User } from '../types';

const REPOSITORY_OWNER = 'Ravikants2';
const REPOSITORY_NAME = 'ion-cctv-private-data';
const DATA_BRANCH = 'data';
const DATA_PATH = 'db.json';
const SESSION_TOKEN_KEY = 'ion_github_data_token';
const SESSION_USER_KEY = 'ion_cctv_user';
const PASSWORD_ITERATIONS = 100_000;

interface StoredUser extends User {
  password?: string;
  passwordHash?: string;
  tokenVersion?: number;
}

interface StoredDatabase extends Partial<AppData> {
  users?: StoredUser[];
  [key: string]: unknown;
}

interface GitHubFile {
  content?: string;
  encoding?: string;
  download_url?: string;
  sha?: string;
}

interface GitHubResponse {
  message?: string;
  sha?: string;
  content?: { sha?: string };
}

let dataFileSha = '';
let storedPasswordHashes = new Map<string, string>();
let databaseMetadata: Record<string, unknown> = {};
let pendingWrite: Promise<void> = Promise.resolve();

function getSessionToken(): string {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
}

function githubApiError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function githubHeaders(token: string): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  });
  return headers;
}

async function githubRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: new Headers({
        ...Object.fromEntries(githubHeaders(token)),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...Object.fromEntries(new Headers(options.headers)),
      }),
    });
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error('Unable to reach GitHub. Check your connection and GitHub token permissions.');
    }
    throw cause;
  }

  const responseBody = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) {
      throw githubApiError('The private database changed since it was loaded. Reload the latest data and retry your change.', 409);
    }
    if (response.status === 401) {
      throw githubApiError('GitHub rejected the token. Check that it is valid and has not expired.', 401);
    }
    if (response.status === 403) {
      throw githubApiError('GitHub denied access. The token needs Contents read/write access to the private data repository.', 403);
    }
    if (response.status === 404) {
      throw githubApiError('The private database was not found. Confirm repository access and the data branch.', 404);
    }
    throw githubApiError(
      responseBody.message || `GitHub request failed (${response.status}).`,
      response.status
    );
  }
  return responseBody;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function databaseUrl(): string {
  const path = DATA_PATH.split('/').map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(REPOSITORY_OWNER)}/${encodeURIComponent(REPOSITORY_NAME)}/contents/${path}`;
}

function getPublicUser(user: StoredUser): User {
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser.passwordHash;
  delete safeUser.tokenVersion;
  return safeUser;
}

function getPublicData(database: StoredDatabase): AppData {
  const { users = [], ...publicData } = database;
  return normalizeAppData({
    ...publicData,
    users: users.map(getPublicUser),
  } as Partial<AppData>);
}

function recordStoredUsers(database: StoredDatabase): void {
  storedPasswordHashes = new Map(
    (database.users || [])
      .filter(user => typeof user.passwordHash === 'string')
      .map(user => [user.id, user.passwordHash as string])
  );
  databaseMetadata = Object.fromEntries(
    Object.entries(database).filter(([key]) => ![
      'users', 'requirements', 'vendors', 'installations', 'examDates', 'quotations',
      'quoteRevisions', 'approvalEvents', 'blanketApprovals', 'accessRoles', 'userGroups',
      'auditLogs',
    ].includes(key))
  );
}

async function readDatabase(token: string): Promise<StoredDatabase> {
  const file = await githubRequest<GitHubFile>(
    `${databaseUrl()}?ref=${encodeURIComponent(DATA_BRANCH)}`,
    token
  );
  let content = '';
  if (file.encoding === 'base64' && file.content) {
    content = new TextDecoder().decode(base64UrlDecode(file.content.replace(/\s/g, '').replace(/\+/g, '-').replace(/\//g, '_')));
  } else if (file.download_url) {
    const response = await fetch(file.download_url, { headers: githubHeaders(token) });
    if (!response.ok) {
      throw githubApiError(`Unable to download the private database (${response.status}).`, response.status);
    }
    content = await response.text();
  } else {
    throw new Error('GitHub returned an unreadable private database file.');
  }

  let database: StoredDatabase;
  try {
    database = JSON.parse(content) as StoredDatabase;
  } catch {
    throw new Error('The private database contains invalid JSON.');
  }
  if (!database || typeof database !== 'object' || Array.isArray(database)) {
    throw new Error('The private database has an invalid format.');
  }
  if (!Array.isArray(database.users)) database.users = [];
  for (const user of database.users) {
    if (typeof user.password === 'string') {
      if (!user.passwordHash?.startsWith('pbkdf2$')) {
        user.passwordHash = await derivePasswordHash(user.password);
      }
      delete user.password;
    }
  }
  recordStoredUsers(database);
  dataFileSha = file.sha || '';
  return database;
}

async function writeDatabase(database: StoredDatabase, token: string): Promise<void> {
  if (!dataFileSha) {
    throw new Error('The private database has not been loaded. Sign in again before saving.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify({
    ...databaseMetadata,
    ...database,
    schemaVersion: 1,
  }, null, 2));
  const result = await githubRequest<GitHubResponse>(databaseUrl(), token, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'data: update iON CCTV demo workspace',
      content: base64Encode(bytes),
      sha: dataFileSha,
      branch: DATA_BRANCH,
    }),
  });
  const nextSha = result.content?.sha || result.sha;
  if (!nextSha) throw new Error('GitHub saved the database but returned no file version.');
  dataFileSha = nextSha;
  recordStoredUsers(database);
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array<ArrayBufferLike> = crypto.getRandomValues(new Uint8Array(16)),
  iterations = PASSWORD_ITERATIONS
): Promise<string> {
  const stableSalt = new Uint8Array(salt.length);
  stableSalt.set(salt);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: stableSalt, iterations },
    key,
    256
  );
  return `pbkdf2$${iterations}$${base64UrlEncode(stableSalt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, storedHash: string | undefined): Promise<boolean> {
  if (!storedHash) return false;
  const [algorithm, iterationText, saltText, expectedText] = storedHash.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations)
    || iterations < 100_000 || iterations > PASSWORD_ITERATIONS || !saltText || !expectedText) {
    return false;
  }
  const actualHash = await derivePasswordHash(password, base64UrlDecode(saltText), iterations);
  const actual = base64UrlDecode(actualHash.split('$')[3]);
  const expected = base64UrlDecode(expectedText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export function getInitialData(): AppData {
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

export function normalizeAppData(data: Partial<AppData>): AppData {
  const initial = getInitialData();
  const userGroups = Array.isArray(data.userGroups) ? data.userGroups : [];
  const users = Array.isArray(data.users)
    ? data.users.map(user => ({
        ...user,
        groupIds: [...new Set([
          ...(Array.isArray(user.groupIds) ? user.groupIds : []),
          ...userGroups
            .filter(group => Array.isArray(group.userIds) && group.userIds.includes(user.id))
            .map(group => group.id),
        ])],
      }))
    : initial.users;
  const installations = (Array.isArray(data.installations) ? data.installations : []).map(record => ({
    ...record,
    approvalStatus: record.approvalStatus || 'pending' as const,
    approvalStage: record.approvalStage || (record.approvalStatus === 'approved' ? undefined : 'surveillance_head' as const),
  }));
  return {
    ...initial,
    ...data,
    users,
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    vendors: Array.isArray(data.vendors) ? data.vendors : [],
    installations,
    examDates: Array.isArray(data.examDates) ? data.examDates : [],
    quotations: Array.isArray(data.quotations) ? data.quotations : [],
    quoteRevisions: Array.isArray(data.quoteRevisions) ? data.quoteRevisions : [],
    approvalEvents: Array.isArray(data.approvalEvents) ? data.approvalEvents : [],
    blanketApprovals: Array.isArray(data.blanketApprovals) ? data.blanketApprovals : [],
    accessRoles: Array.isArray(data.accessRoles) ? data.accessRoles : [],
    userGroups,
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
  };
}

export async function restoreSession(): Promise<{ user: User; data: AppData } | null> {
  const token = getSessionToken();
  const userId = sessionStorage.getItem(SESSION_USER_KEY);
  if (!token || !userId) return null;
  const database = await readDatabase(token);
  const user = (database.users || []).find(candidate => candidate.id === userId);
  if (!user || !user.passwordHash) {
    await logoutUser();
    return null;
  }
  return { user: getPublicUser(user), data: getPublicData(database) };
}

export async function loginUser(
  email: string,
  password: string,
  token: string,
  bootstrapName = 'Super Admin',
  recoverSuperAdmin = false
): Promise<{ user: User; data: AppData } | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password || !token) throw new Error('Enter your user ID, password, and GitHub token.');
  const database = await readDatabase(token);
  const users = database.users || [];
  const hasSuperAdmin = users.some(user =>
    user.role === 'super_admin' && user.passwordHash?.startsWith('pbkdf2$')
  );

  let user = users.find(candidate => candidate.email.trim().toLowerCase() === cleanEmail);
  if (!hasSuperAdmin || recoverSuperAdmin) {
    if (password.length < 12) throw new Error('The first Super Admin password must contain at least 12 characters.');
    if (!user) {
      user = {
        id: uuidv4(),
        name: bootstrapName.trim() || 'Super Admin',
        email: cleanEmail,
        role: 'super_admin',
      };
      users.push(user);
    } else {
      user.role = 'super_admin';
    }
    user.passwordHash = await derivePasswordHash(password);
    user.tokenVersion = 0;
  } else if (!user || !await verifyPassword(password, user.passwordHash)) {
    return null;
  }

  user.lastLoginAt = new Date().toISOString();
  database.users = users;
  database.auditLogs = [
    ...(Array.isArray(database.auditLogs) ? database.auditLogs : []),
    {
      id: uuidv4(),
      userId: user.id,
      action: 'LOGIN' as const,
      entityType: 'User',
      entityId: user.id,
      timestamp: new Date().toISOString(),
    },
  ].slice(-5_000);
  await writeDatabase(database, token);
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_USER_KEY, user.id);
  return { user: getPublicUser(user), data: getPublicData(database) };
}

export async function logoutUser(): Promise<void> {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
  dataFileSha = '';
  storedPasswordHashes = new Map();
  databaseMetadata = {};
}

export async function createManagedUser(user: User, password: string): Promise<User> {
  if (password.length < 12) throw new Error('Password must contain at least 12 characters.');
  storedPasswordHashes.set(user.id, await derivePasswordHash(password));
  return user;
}

export async function changeManagedUserPassword(userId: string, password: string): Promise<void> {
  if (password.length < 12) throw new Error('Password must contain at least 12 characters.');
  if (!storedPasswordHashes.has(userId)) throw new Error('The user account was not loaded from the private repository.');
  storedPasswordHashes.set(userId, await derivePasswordHash(password));
}

export async function loadData(): Promise<AppData> {
  const token = getSessionToken();
  if (!token) throw new Error('Enter a GitHub token to load the private data repository.');
  return getPublicData(await readDatabase(token));
}

export async function saveData(data: AppData): Promise<AppData> {
  const token = getSessionToken();
  if (!token) throw new Error('Your GitHub token is missing. Sign in again before saving.');
  const normalized = normalizeAppData(data);
  const users = normalized.users.map(user => ({
    ...user,
    passwordHash: storedPasswordHashes.get(user.id) || '',
  }));
  const database: StoredDatabase = {
    ...databaseMetadata,
    ...normalized,
    users,
  };
  const write = pendingWrite.then(() => writeDatabase(database, token));
  pendingWrite = write.then(() => undefined, () => undefined);
  await write;
  return normalized;
}

/** Download full backup as JSON file */
export function exportBackup(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ion-cctv-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Restore from a backup JSON file */
export function importBackup(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        resolve(normalizeAppData(JSON.parse(event.target?.result as string) as Partial<AppData>));
      } catch {
        reject(new Error('Invalid backup file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
