import type { AppData, User } from '../types';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT?.replace(/\/+$/, '') || '';
const SESSION_KEY = 'ion_session';

function clearLegacyClientData(): void {
  localStorage.removeItem('ion_cctv_data');
  localStorage.removeItem('ion_cctv_sha');
  sessionStorage.removeItem('ion_user');
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

export function isGitHubConfigured(): boolean {
  return Boolean(API_ENDPOINT);
}

function getSessionToken(): string {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

export function getSessionAuthorizationHeader(): string {
  const token = getSessionToken();
  if (!token) throw new Error('Sign in to use the chat service.');
  return `Bearer ${token}`;
}

function apiError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  includeSession = true
): Promise<T> {
  if (!API_ENDPOINT) throw new Error('The secure Worker API endpoint is not configured.');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = includeSession ? getSessionToken() : '';
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_ENDPOINT}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    if (response.status === 401 && includeSession) sessionStorage.removeItem(SESSION_KEY);
    throw apiError(result.error || `Secure service request failed (${response.status}).`, response.status);
  }
  return result;
}

export async function restoreSession(): Promise<User | null> {
  clearLegacyClientData();
  if (!getSessionToken()) return null;
  try {
    const result = await apiRequest<{ user: User }>('/api/auth/session');
    return result.user;
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) return null;
    throw error;
  }
}

export async function loginUser(email: string, password: string): Promise<User> {
  const result = await apiRequest<{ token: string; user: User }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false
  );
  sessionStorage.setItem(SESSION_KEY, result.token);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  try {
    if (getSessionToken()) {
      await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' });
    }
  } finally {
    sessionStorage.removeItem(SESSION_KEY);
    clearLegacyClientData();
  }
}

export async function createManagedUser(user: User, password: string): Promise<User> {
  const result = await apiRequest<{ user: User }>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ user, password }),
  });
  return result.user;
}

export async function changeManagedUserPassword(userId: string, password: string): Promise<void> {
  const result = await apiRequest<{ token?: string }>(`/api/users/${encodeURIComponent(userId)}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
  if (result.token) sessionStorage.setItem(SESSION_KEY, result.token);
}

export async function recordExportAudit(entityType: string, entityId: string): Promise<AppData> {
  const result = await apiRequest<{ data: Partial<AppData> }>('/api/audit', {
    method: 'POST',
    body: JSON.stringify({ action: 'EXPORT', entityType, entityId }),
  });
  return normalizeAppData(result.data);
}

/** Load authenticated application data through the server-side Worker API. */
export async function loadData(): Promise<AppData> {
  const data = await apiRequest<Partial<AppData>>('/api/data');
  return normalizeAppData(data);
}

/** Save application changes through the authenticated Worker API. */
export async function saveData(data: AppData, onError?: (error: Error) => void): Promise<AppData> {
  try {
    const result = await apiRequest<{ data: Partial<AppData> }>('/api/data', {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    return normalizeAppData(result.data);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    onError?.(failure);
    throw failure;
  }
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
