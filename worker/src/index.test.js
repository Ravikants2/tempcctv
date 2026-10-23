// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { dataApiInternals } from './data-api.js';

const env = {
  ALLOWED_ORIGINS: 'https://ravikants2.github.io',
  GEMINI_API_KEY: 'test-secret',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_FALLBACK_MODEL: 'gemini-3.8-flash',
  DATA_PAT: 'server-only-test-token',
  DATA_REPO_OWNER: 'Ravikants2',
  DATA_REPO_NAME: 'ion-cctv-private-data',
  DATA_BRANCH: 'data',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
};

const chatUser = {
  id: 'chat-user',
  name: 'Test Admin',
  email: 'admin@example.com',
  role: 'super_admin',
  passwordHash: '',
  tokenVersion: 0,
};
let chatToken;

beforeAll(async () => {
  chatUser.passwordHash = await dataApiInternals.derivePasswordHash('test-password-with-more-than-12-chars');
  chatToken = await dataApiInternals.createSession(chatUser, env);
});

function githubDatabaseResponse() {
  const database = {
    authVersion: 1,
    users: [chatUser],
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
  const bytes = new TextEncoder().encode(JSON.stringify(database));
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return new Response(JSON.stringify({
    sha: 'chat-database-sha',
    content: btoa(binary),
  }), { status: 200 });
}

function mockGitHubAndGemini(geminiHandler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).includes('/contents/db.json?ref=data')) {
      expect(options?.headers?.Authorization).toBe(`Bearer ${env.DATA_PAT}`);
      return githubDatabaseResponse();
    }
    return geminiHandler(url, options);
  });
}

function geminiCalls(fetchMock) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/models/'));
}

function createRequest(overrides = {}, token = chatToken) {
  const body = {
    message: 'List all installations.',
    history: [],
    context: {
      summary: '{}',
      records: [],
      requirements: [],
      vendors: [],
      installations: [],
      examDates: [],
    },
    ...overrides,
  };
  return new Request('https://chat.example/api/chat', {
    method: 'POST',
    headers: {
      Origin: 'https://ravikants2.github.io',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function geminiResponse(text, finishReason = 'STOP') {
  return new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text }] },
      finishReason,
    }],
  }), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gemini response completion', () => {
  it('rejects chat requests without an authenticated session', async () => {
    const fetchMock = mockGitHubAndGemini(async () => {
      throw new Error('Gemini must not be called for an unauthenticated request.');
    });

    const response = await worker.fetch(createRequest({}, ''), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in is required.' });
    expect(geminiCalls(fetchMock)).toHaveLength(0);
  });

  it('uses the summary and flags omitted rows instead of rejecting oversized details', async () => {
    const installations = Array.from({ length: 1_000 }, (_, index) => ({
      id: `installation-${index}`,
      requirementId: `requirement-${index}`,
      installationType: 'Full Vendor',
      vendorId: 'vendor-1',
      storageType: 'Storage '.repeat(40),
      storageUnit: 'GB',
      updatedAt: '2026-01-01',
      cameraCount: 10,
      storageQuantity: 10,
      storageSize: 10,
      localVendorCost: 1000,
      minimumCost: 900,
      proxyProvided: true,
      internetProvided: true,
      storageProvided: false,
    }));
    const fetchMock = mockGitHubAndGemini(async (_url, options) => {
      const sentBody = JSON.parse(String(options?.body));
      expect(sentBody.contents.at(-1).parts[0].text).toContain('"detailsOmitted":true');
      expect(sentBody.contents.at(-1).parts[0].text).not.toContain('The loaded data is too large');
      return geminiResponse('The data is large; narrow by zone.');
    });

    const response = await worker.fetch(createRequest({
      context: { summary: '{"installations":1000}', records: [], requirements: [], vendors: [], installations, examDates: [] },
    }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'The data is large; narrow by zone.' });
    expect(geminiCalls(fetchMock)).toHaveLength(1);
  });

  it('allows longer answers and returns a complete answer', async () => {
    const fetchMock = mockGitHubAndGemini(async () => geminiResponse('Complete table and totals.'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'Complete table and totals.' });
    const requestBody = JSON.parse(String(geminiCalls(fetchMock)[0][1]?.body));
    expect(requestBody.generationConfig.maxOutputTokens).toBe(4_096);
    expect(requestBody.systemInstruction.parts[0].text).toContain('Keep answers concise by default');
    expect(geminiCalls(fetchMock)[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
  });

  it('passes joined records to Gemini and directs it to calculate combinations and offer choices', async () => {
    const fetchMock = mockGitHubAndGemini(async () => geminiResponse('Vendor A handled 50 candidates for Exam X.'));
    const context = {
      summary: '{}',
      records: [{
        installationId: 'installation-1',
        requirementId: 'requirement-1',
        vendorId: 'vendor-1',
        zone: 'North',
        state: 'Delhi',
        city: 'Delhi',
        tcCode: 'TC-1',
        tcName: 'Test Center',
        clientName: 'Client',
        examName: 'Exam X',
        vendorName: 'Vendor A',
        vendorZone: 'North',
        installationType: 'Full Vendor',
        cameraCount: 10,
        proxyProvided: true,
        internetProvided: true,
        storageProvided: false,
        localVendorCost: 1000,
        updatedAt: '2026-01-01',
        examDates: [{ examDate: '2026-02-01', scheduledCandidates: 50 }],
        ignoredSensitiveField: 'must not be forwarded',
      }],
      requirements: [],
      vendors: [],
      installations: [],
      examDates: [],
    };

    const response = await worker.fetch(createRequest({ context }), env);

    expect(response.status).toBe(200);
    const requestBody = JSON.parse(String(geminiCalls(fetchMock)[0][1]?.body));
    const prompt = requestBody.contents.at(-1).parts[0].text;
    expect(prompt).toContain('"vendorName":"Vendor A"');
    expect(prompt).toContain('"examName":"Exam X"');
    expect(prompt).toContain('"scheduledCandidates":50');
    expect(prompt).not.toContain('must not be forwarded');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Calculate counts, sums, averages');
    expect(requestBody.systemInstruction.parts[0].text).toContain('numbered choices');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Never multiply an installation-level cost');
  });

  it.each([404, 429])('retries HTTP %s responses with the fallback model', async status => {
    const geminiResponses = [
      new Response(JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' },
      }), { status }),
      geminiResponse('Fallback model answer.'),
    ];
    const fetchMock = mockGitHubAndGemini(async () => geminiResponses.shift());

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'Fallback model answer.' });
    expect(geminiCalls(fetchMock)).toHaveLength(2);
    expect(geminiCalls(fetchMock)[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
    expect(geminiCalls(fetchMock)[1][0]).toContain('/models/gemini-3.8-flash:generateContent');
  });

  it('continues an answer when Gemini reports the output token limit', async () => {
    const geminiResponses = [
      geminiResponse('Partial answer ending at', 'MAX_TOKENS'),
      geminiResponse('the subtotal. Complete final sentence.'),
    ];
    const fetchMock = mockGitHubAndGemini(async () => geminiResponses.shift());

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer: 'Partial answer ending at\nthe subtotal. Complete final sentence.',
    });
    expect(geminiCalls(fetchMock)).toHaveLength(2);
    const continuationBody = JSON.parse(String(geminiCalls(fetchMock)[1][1]?.body));
    expect(continuationBody.contents.at(-2)).toEqual({
      role: 'model',
      parts: [{ text: 'Partial answer ending at' }],
    });
    expect(continuationBody.contents.at(-1).parts[0].text).toContain('Continue the answer exactly where it stopped');
  });

  it('does not return a partial answer if Gemini also truncates the continuation', async () => {
    const geminiResponses = [
      geminiResponse('Partial answer', 'MAX_TOKENS'),
      geminiResponse('Still incomplete', 'MAX_TOKENS'),
    ];
    mockGitHubAndGemini(async () => geminiResponses.shift());

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'This answer exceeds the chat response limit. Please narrow your question and try again.',
    });
  });
});
