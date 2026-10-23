const PASSWORD_ITERATIONS = 310_000;
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const MAX_DATABASE_BYTES = 8_000_000;
const MAX_REQUEST_BYTES = 10_000_000;
const MAX_AUDIT_ENTRIES = 5_000;
const AUTH_VERSION = 1;
const DATA_PATH = 'db.json';
const COLLECTIONS = {
  users: 'User',
  requirements: 'RequirementMaster',
  vendors: 'VendorMaster',
  installations: 'InstallationRecord',
  examDates: 'ExamDateDetail',
  quotations: 'QuotationFile',
  quoteRevisions: 'QuoteRevision',
  approvalEvents: 'InstallationApproval',
  blanketApprovals: 'BlanketApproval',
  accessRoles: 'AccessRole',
  userGroups: 'UserGroup',
};

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

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

function base64UrlEncode(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeText(value) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function normalizeDatabase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('Stored database is invalid.', 502);
  }
  const data = { ...emptyDatabase(), ...value };
  for (const key of Object.keys(COLLECTIONS).concat('auditLogs')) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  return data;
}

function githubConfig(env) {
  if (!env.DATA_PAT || !env.DATA_REPO_OWNER || !env.DATA_REPO_NAME) {
    throw new ApiError('The private GitHub data repository is not configured.', 503);
  }
  return {
    owner: env.DATA_REPO_OWNER,
    repo: env.DATA_REPO_NAME,
    branch: env.DATA_BRANCH || 'data',
  };
}

function githubUrl(config, path) {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`;
}

function githubHeaders(env, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${env.DATA_PAT}`,
    'Content-Type': 'application/json',
    'User-Agent': 'ion-cctv-app',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function readDatabase(env) {
  const config = githubConfig(env);
  const url = githubUrl(
    config,
    `/contents/${DATA_PATH}?ref=${encodeURIComponent(config.branch)}`
  );
  const response = await fetch(url, { headers: githubHeaders(env) });

  if (response.status === 404) {
    return { data: emptyDatabase(), sha: null, isNew: true, config };
  }
  if (!response.ok) {
    console.error('GitHub data read failed with status', response.status);
    throw new ApiError('The private GitHub database could not be read.', 502);
  }

  const file = await response.json();
  let content;
  if (typeof file.content === 'string' && file.content.trim()) {
    content = new TextDecoder().decode(base64ToBytes(file.content.replace(/\s/g, '')));
  } else if (typeof file.download_url === 'string') {
    const rawResponse = await fetch(file.download_url, { headers: githubHeaders(env, 'application/vnd.github.raw') });
    if (!rawResponse.ok) {
      console.error('GitHub data download failed with status', rawResponse.status);
      throw new ApiError('The private GitHub database could not be downloaded.', 502);
    }
    content = await rawResponse.text();
  } else {
    throw new ApiError('GitHub returned an unreadable database file.', 502);
  }

  if (new TextEncoder().encode(content).byteLength > MAX_DATABASE_BYTES) {
    throw new ApiError('The GitHub database is too large for this service.', 413);
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ApiError('The private GitHub database contains invalid JSON.', 502);
  }
  return { data: normalizeDatabase(parsed), sha: file.sha, isNew: false, config };
}

async function ensureDataBranch(env, config) {
  const referenceUrl = githubUrl(config, `/git/ref/heads/${encodeURIComponent(config.branch)}`);
  const referenceResponse = await fetch(referenceUrl, { headers: githubHeaders(env) });
  if (referenceResponse.ok) return;
  if (referenceResponse.status !== 404) {
    console.error('GitHub branch lookup failed with status', referenceResponse.status);
    throw new ApiError('The private GitHub data branch could not be checked.', 502);
  }

  const baseResponse = await fetch(
    githubUrl(config, '/git/ref/heads/main'),
    { headers: githubHeaders(env) }
  );
  if (!baseResponse.ok) {
    throw new ApiError('The private data repository needs an initial main branch.', 503);
  }
  const base = await baseResponse.json();
  const createResponse = await fetch(githubUrl(config, '/git/refs'), {
    method: 'POST',
    headers: githubHeaders(env),
    body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: base.object.sha }),
  });
  if (!createResponse.ok && createResponse.status !== 422) {
    console.error('GitHub data branch creation failed with status', createResponse.status);
    throw new ApiError('The private GitHub data branch could not be created.', 502);
  }
}

async function writeDatabase(env, loaded, data, message = 'data: secure application update') {
  const contentText = JSON.stringify(data, null, 2);
  const contentBytes = new TextEncoder().encode(contentText);
  if (contentBytes.byteLength > MAX_DATABASE_BYTES) {
    throw new ApiError('The database exceeds the configured size limit.', 413);
  }
  const config = loaded.config ?? githubConfig(env);
  if (loaded.isNew && !loaded.sha) await ensureDataBranch(env, config);

  const payload = {
    message,
    content: bytesToBase64(contentBytes),
    branch: config.branch,
  };
  if (loaded.sha) payload.sha = loaded.sha;
  const response = await fetch(githubUrl(config, `/contents/${DATA_PATH}`), {
    method: 'PUT',
    headers: githubHeaders(env),
    body: JSON.stringify(payload),
  });
  if ([409, 422].includes(response.status)) {
    throw new ApiError('Another user saved data first. Reload the latest data and retry your change.', 409);
  }
  if (!response.ok) {
    console.error('GitHub data write failed with status', response.status);
    throw new ApiError('The private GitHub database could not be saved.', 502);
  }
  return { ...loaded, data, sha: (await response.json()).content?.sha, isNew: false };
}

function sanitizedAuditValue(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizedAuditValue(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 5_000) return '[large value omitted]';
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|dataurl|secret|token/i.test(key))
    .map(([key, item]) => [key, sanitizedAuditValue(item, depth + 1)]));
}

function auditEntry(actorId, action, entityType, entityId, before, after) {
  return {
    id: crypto.randomUUID(),
    userId: actorId,
    action,
    entityType,
    entityId: String(entityId || 'unknown').slice(0, 200),
    beforeJson: before === undefined ? undefined : JSON.stringify(sanitizedAuditValue(before)),
    afterJson: after === undefined ? undefined : JSON.stringify(sanitizedAuditValue(after)),
    timestamp: new Date().toISOString(),
  };
}

function addAuditEntries(database, entries) {
  database.auditLogs = [...database.auditLogs, ...entries].slice(-MAX_AUDIT_ENTRIES);
}

function diffAuditEntries(previous, next, actorId) {
  const entries = [];
  for (const [collection, entityType] of Object.entries(COLLECTIONS)) {
    const beforeRows = new Map(previous[collection].map((row) => [row.id, row]));
    const afterRows = new Map(next[collection].map((row) => [row.id, row]));
    for (const [id, row] of afterRows) {
      const before = beforeRows.get(id);
      if (!before) {
        entries.push(auditEntry(actorId, 'CREATE', entityType, id, undefined, row));
      } else if (JSON.stringify(before) !== JSON.stringify(row)) {
        entries.push(auditEntry(actorId, 'UPDATE', entityType, id, before, row));
      }
    }
    for (const [id, row] of beforeRows) {
      if (!afterRows.has(id)) entries.push(auditEntry(actorId, 'DELETE', entityType, id, row, undefined));
    }
  }
  return entries;
}

function publicUser(user) {
  const { passwordHash, tokenVersion, ...safeUser } = user;
  void passwordHash;
  void tokenVersion;
  return safeUser;
}

function publicDatabase(database) {
  const { authVersion, ...safeDatabase } = database;
  void authVersion;
  return {
    ...safeDatabase,
    users: safeDatabase.users.map(publicUser),
  };
}

function apiUser(user) {
  return publicUser(user);
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(header);
  return match?.[1] ?? '';
}

async function derivePasswordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const [algorithm, iterationText, saltText, expectedText] = storedHash.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations)
    || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expectedText) {
    return false;
  }
  const actual = await derivePasswordHash(password, base64UrlDecode(saltText));
  const actualBytes = base64UrlDecode(actual.split('$')[3]);
  const expectedBytes = base64UrlDecode(expectedText);
  if (actualBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

async function sessionKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new ApiError('The session signing secret is not configured.', 503);
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createSession(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeText(JSON.stringify({
    sub: user.id,
    ver: user.tokenVersion || 0,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  }));
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    await sessionKey(env),
    new TextEncoder().encode(payload)
  ));
  return `${payload}.${base64UrlEncode(signature)}`;
}

async function authenticateRequest(request, env, loaded) {
  const token = getBearerToken(request);
  if (!token) throw new ApiError('Sign in is required.', 401);
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new ApiError('Your session is invalid. Sign in again.', 401);
  let claims;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await sessionKey(env),
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) throw new Error('Invalid signature');
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    throw new ApiError('Your session is invalid. Sign in again.', 401);
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new ApiError('Your session has expired. Sign in again.', 401);
  }
  const user = loaded.data.users.find((item) => item.id === claims.sub);
  if (!user || !user.passwordHash || (user.tokenVersion || 0) !== claims.ver) {
    throw new ApiError('Your account is not active. Sign in again.', 401);
  }
  return user;
}

async function readJsonBody(request, maxBytes = MAX_REQUEST_BYTES) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw new ApiError('Send a JSON request.', 415);
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) throw new ApiError('Request is too large.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ApiError('Request is too large.', 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid object');
    return body;
  } catch {
    throw new ApiError('Request JSON is invalid.');
  }
}

async function ensureBootstrapAdmin(loaded, env) {
  let dirty = loaded.isNew;
  const database = loaded.data;
  if (database.authVersion !== AUTH_VERSION) {
    database.authVersion = AUTH_VERSION;
    database.users = database.users.map((user) => ({
      ...user,
      passwordHash: '',
      tokenVersion: 0,
    }));
    dirty = true;
  }

  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    if (!database.users.some((user) => user.role === 'super_admin' && user.passwordHash?.startsWith('pbkdf2$'))) {
      throw new ApiError('Configure the initial Super Admin email and password in the Worker secrets.', 503);
    }
  } else if (env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new ApiError('The initial Super Admin password must be at least 12 characters.', 503);
  } else if (!database.users.some((user) => user.role === 'super_admin' && user.passwordHash?.startsWith('pbkdf2$'))) {
    const email = env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
    let admin = database.users.find((user) => user.role === 'super_admin'
      && user.email?.trim().toLowerCase() === email);
    if (!admin) {
      admin = {
        id: crypto.randomUUID(),
        name: 'Super Admin',
        email,
        role: 'super_admin',
        zone: undefined,
        groupIds: [],
        tokenVersion: 0,
      };
      database.users.push(admin);
    }
    admin.passwordHash = await derivePasswordHash(env.BOOTSTRAP_ADMIN_PASSWORD);
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    addAuditEntries(database, [auditEntry(admin.id, 'CREATE', 'User', admin.id, undefined, admin)]);
    dirty = true;
  }

  if (dirty) loaded = await writeDatabase(env, loaded, database, 'security: initialize private database');
  return loaded;
}

function isSuperAdmin(user) {
  return user.role === 'super_admin';
}

function validateAppData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('Application data must be a JSON object.');
  }
  for (const key of Object.keys(COLLECTIONS).concat('auditLogs')) {
    if (!Array.isArray(value[key])) throw new ApiError(`Application data has an invalid ${key} collection.`);
  }
  return value;
}

async function handleApiRoute(request, env, origin) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return jsonResponse({}, 204, origin);
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await readJsonBody(request, 4_096);
    if (typeof body.email !== 'string' || typeof body.password !== 'string'
      || body.email.length > 254 || body.password.length > 1_024) {
      throw new ApiError('Enter a valid email and password.');
    }
    if (env.LOGIN_RATE_LIMITER?.limit) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const limit = await env.LOGIN_RATE_LIMITER.limit({ key: ip });
      if (!limit.success) throw new ApiError('Too many sign-in attempts. Try again later.', 429);
    }
    let loaded = await readDatabase(env);
    loaded = await ensureBootstrapAdmin(loaded, env);
    const email = body.email.trim().toLowerCase();
    const user = loaded.data.users.find((item) => item.email?.trim().toLowerCase() === email);
    if (!user || !await verifyPassword(body.password, user.passwordHash)) {
      throw new ApiError('Invalid email or password.', 401);
    }
    user.lastLoginAt = new Date().toISOString();
    user.tokenVersion = user.tokenVersion || 0;
    addAuditEntries(loaded.data, [
      auditEntry(user.id, 'LOGIN', 'User', user.id, undefined, { email: user.email }),
    ]);
    loaded = await writeDatabase(env, loaded, loaded.data, 'auth: user sign-in');
    return jsonResponse({ token: await createSession(user, env), user: apiUser(user) }, 200, origin);
  }

  if (method === 'GET' && path === '/api/auth/session') {
    const loaded = await ensureBootstrapAdmin(await readDatabase(env), env);
    const user = await authenticateRequest(request, env, loaded);
    return jsonResponse({ user: apiUser(user) }, 200, origin);
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const loaded = await ensureBootstrapAdmin(await readDatabase(env), env);
    const user = await authenticateRequest(request, env, loaded);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    addAuditEntries(loaded.data, [
      auditEntry(user.id, 'LOGOUT', 'User', user.id, undefined, { email: user.email }),
    ]);
    await writeDatabase(env, loaded, loaded.data, 'auth: user sign-out');
    return jsonResponse({ ok: true }, 200, origin);
  }

  const loaded = await ensureBootstrapAdmin(await readDatabase(env), env);
  const actor = await authenticateRequest(request, env, loaded);

  if (method === 'GET' && path === '/api/data') {
    const visible = publicDatabase(loaded.data);
    if (!isSuperAdmin(actor)) {
      visible.auditLogs = visible.auditLogs.filter((entry) => entry.userId === actor.id);
    }
    return jsonResponse(visible, 200, origin);
  }

  if (method === 'POST' && path === '/api/users') {
    if (!isSuperAdmin(actor)) throw new ApiError('Only a Super Admin can create user accounts.', 403);
    const body = await readJsonBody(request, 8_192);
    const userInput = body.user;
    const password = body.password;
    if (!userInput || typeof userInput !== 'object' || Array.isArray(userInput)
      || typeof userInput.id !== 'string' || typeof userInput.name !== 'string'
      || typeof userInput.email !== 'string' || typeof userInput.role !== 'string'
      || typeof password !== 'string' || password.length < 12 || password.length > 1_024) {
      throw new ApiError('Enter valid account details and a password with at least 12 characters.');
    }
    const email = userInput.email.trim().toLowerCase();
    const allowedRoles = new Set([
      'super_admin', 'sub_admin', 'user', 'viewer', 'zonal_user',
      'surveillance_head', 'enablement_head', 'custom',
    ]);
    if (!userInput.name.trim() || userInput.name.length > 120
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !allowedRoles.has(userInput.role)
      || (userInput.role === 'zonal_user' && typeof userInput.zone !== 'string')) {
      throw new ApiError('Enter valid account details and select a supported role.');
    }
    if (userInput.role === 'custom'
      && !loaded.data.accessRoles.some((role) => role.id === userInput.customRoleId)) {
      throw new ApiError('Choose a configured custom access role.');
    }
    if (!Array.isArray(userInput.groupIds)
      || userInput.groupIds.some((id) => !loaded.data.userGroups.some((group) => group.id === id))) {
      throw new ApiError('Choose valid user groups.');
    }
    if (loaded.data.users.some((user) => user.email?.trim().toLowerCase() === email)) {
      throw new ApiError('A user with this email already exists.', 409);
    }
    const user = {
      ...userInput,
      email,
      name: userInput.name.trim(),
      passwordHash: await derivePasswordHash(password),
      tokenVersion: 0,
      lastLoginAt: undefined,
    };
    loaded.data.users.push(user);
    for (const group of loaded.data.userGroups) {
      if (user.groupIds?.includes(group.id)) group.userIds = [...new Set([...(group.userIds || []), user.id])];
    }
    addAuditEntries(loaded.data, [
      auditEntry(actor.id, 'CREATE', 'User', user.id, undefined, user),
    ]);
    await writeDatabase(env, loaded, loaded.data, 'users: create account');
    return jsonResponse({ user: apiUser(user) }, 201, origin);
  }

  const passwordMatch = /^\/api\/users\/([^/]+)\/password$/.exec(path);
  if (method === 'PUT' && passwordMatch) {
    if (!isSuperAdmin(actor)) throw new ApiError('Only a Super Admin can change user passwords.', 403);
    const targetId = decodeURIComponent(passwordMatch[1]);
    const body = await readJsonBody(request, 4_096);
    if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1_024) {
      throw new ApiError('Password must contain at least 12 characters.');
    }
    const user = loaded.data.users.find((item) => item.id === targetId);
    if (!user) throw new ApiError('User account was not found.', 404);
    const before = { password: '[redacted]' };
    user.passwordHash = await derivePasswordHash(body.password);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    addAuditEntries(loaded.data, [
      auditEntry(actor.id, 'UPDATE', 'UserPassword', user.id, before, { password: '[changed]' }),
    ]);
    await writeDatabase(env, loaded, loaded.data, 'users: reset account password');
    return jsonResponse({
      ok: true,
      ...(targetId === actor.id ? { token: await createSession(user, env) } : {}),
    }, 200, origin);
  }

  if (method === 'POST' && path === '/api/audit') {
    const body = await readJsonBody(request, 4_096);
    if (body.action !== 'EXPORT' || typeof body.entityType !== 'string' || typeof body.entityId !== 'string') {
      throw new ApiError('This audit event is not allowed.');
    }
    addAuditEntries(loaded.data, [
      auditEntry(actor.id, 'EXPORT', body.entityType.slice(0, 100), body.entityId.slice(0, 200), undefined, undefined),
    ]);
    const saved = await writeDatabase(env, loaded, loaded.data, 'audit: data export');
    return jsonResponse({ data: publicDatabase(saved.data) }, 200, origin);
  }

  if (method === 'PUT' && path === '/api/data') {
    const body = await readJsonBody(request);
    const input = validateAppData(body.data);
    if (!isSuperAdmin(actor)) {
      for (const collection of ['accessRoles', 'userGroups']) {
        if (JSON.stringify(input[collection]) !== JSON.stringify(loaded.data[collection])) {
          throw new ApiError('Only a Super Admin can change access roles and groups.', 403);
        }
      }
    }
    const existingUsers = new Map(loaded.data.users.map((user) => [user.id, user]));
    const nextUsers = input.users.map((user) => {
      if (!user || typeof user.id !== 'string' || !existingUsers.has(user.id)) {
        throw new ApiError('Create user accounts using the secure user-management API.');
      }
      const existing = existingUsers.get(user.id);
      if (!isSuperAdmin(actor) && JSON.stringify({ ...user, passwordHash: undefined, tokenVersion: undefined, lastLoginAt: undefined })
        !== JSON.stringify({ ...existing, passwordHash: undefined, tokenVersion: undefined, lastLoginAt: undefined })) {
        throw new ApiError('Only a Super Admin can change user accounts.', 403);
      }
      return {
        ...user,
        passwordHash: existing.passwordHash,
        tokenVersion: existing.tokenVersion || 0,
        lastLoginAt: existing.lastLoginAt,
      };
    });
    const nextUserIds = new Set(nextUsers.map((user) => user.id));
    const removedUsers = loaded.data.users.filter((user) => !nextUserIds.has(user.id));
    if (removedUsers.length > 0 && !isSuperAdmin(actor)) {
      throw new ApiError('Only a Super Admin can remove user accounts.', 403);
    }
    if (nextUsers.length > loaded.data.users.length) {
      throw new ApiError('Create user accounts using the secure user-management API.');
    }
    if (nextUsers.length === 0 || !nextUsers.some((user) => user.role === 'super_admin' && user.passwordHash)) {
      throw new ApiError('At least one active Super Admin account must remain.', 400);
    }
    if (removedUsers.some((user) => user.id === actor.id)) {
      throw new ApiError('You cannot remove your own account.');
    }

    const next = normalizeDatabase({
      ...input,
      users: nextUsers,
      auditLogs: loaded.data.auditLogs,
      authVersion: loaded.data.authVersion,
    });
    const audit = diffAuditEntries(loaded.data, next, actor.id);
    addAuditEntries(next, audit);
    const saved = await writeDatabase(env, loaded, next);
    return jsonResponse({ data: publicDatabase(saved.data) }, 200, origin);
  }

  throw new ApiError('API route not found.', 404);
}

export async function handleDataApi(request, env, origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: 'This origin is not allowed.' }, 403);
  }
  try {
    return await handleApiRoute(request, env, origin);
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ error: error.message }, error.status, origin);
    console.error('Secure data API failed:', error?.message || 'Unexpected error');
    return jsonResponse({ error: 'The secure data service could not complete the request.' }, 500, origin);
  }
}

export async function authorizeChatRequest(request, env) {
  try {
    const loaded = await ensureBootstrapAdmin(await readDatabase(env), env);
    await authenticateRequest(request, env, loaded);
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message, status: error.status };
    console.error('Chat authentication failed:', error?.message || 'Unexpected error');
    return { error: 'The secure data service could not verify this session.', status: 503 };
  }
}

export const dataApiInternals = {
  derivePasswordHash,
  verifyPassword,
  createSession,
  normalizeDatabase,
  publicDatabase,
};
