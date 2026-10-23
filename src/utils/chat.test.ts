import { describe, expect, it, vi } from 'vitest';
import type { AppData } from '../types';
import { buildChatContext, sendChatMessage } from './chat';

const appData: AppData = {
  users: [{
    id: 'user-1', name: 'Sensitive User', email: 'private@example.com',
    role: 'super_admin',
  }],
  requirements: [{
    id: 'requirement-1', zone: 'North', state: 'Delhi', city: 'Delhi',
    tcCode: 'TC-1', tcName: 'Test Center', clientName: 'Client',
    examName: 'Exam', createdBy: 'user-1', createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  }],
  vendors: [{
    id: 'vendor-1', zone: 'North', vendorName: 'Vendor',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-02',
  }],
  installations: [{
    id: 'installation-1', requirementId: 'requirement-1',
    installationType: 'Full Vendor', vendorId: 'vendor-1', cameraCount: 10,
    proxyProvided: true, internetProvided: true, storageProvided: false,
    localVendorCost: 1000, minimumCost: 900, quotationFileId: 'quotation-1',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedBy: 'user-1',
    updatedAt: '2026-01-02',
  }],
  examDates: [{
    id: 'date-1', installationRecordId: 'installation-1',
    examDate: '2026-02-01', scheduledCandidates: 50,
  }],
  quotations: [{
    id: 'quotation-1', installationRecordId: 'installation-1',
    originalFileName: 'private.pdf', dataUrl: 'data:application/pdf;base64,secret',
    mimeType: 'application/pdf', uploadedBy: 'user-1', uploadedAt: '2026-01-01',
  }],
  quoteRevisions: [],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [{
    id: 'audit-1', userId: 'user-1', action: 'LOGIN', entityType: 'User',
    entityId: 'user-1', timestamp: '2026-01-01',
  }],
};

describe('buildChatContext', () => {
  it('uses compact summaries for quick questions', () => {
    const context = buildChatContext(appData, 'How many installations?');
    const serialized = JSON.stringify(context);

    expect(context.installations).toEqual([]);
    expect(context.summary).toContain('"installations":1');
    expect(context.summary).toContain('"cost":1000');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('quotation-1');
    expect(serialized).not.toContain('data:application/pdf');
    expect(serialized).not.toContain('audit-1');
  });

  it('includes full operational details only when explicitly requested', () => {
    const serialized = JSON.stringify(buildChatContext(appData, 'Show all installation details'));

    expect(serialized).toContain('Test Center');
    expect(serialized).toContain('Vendor');
    expect(serialized).toContain('scheduledCandidates');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('quotation-1');
    expect(serialized).not.toContain('data:application/pdf');
    expect(serialized).not.toContain('audit-1');
  });

  it('keeps grouped requests compact even when phrased as a list', () => {
    const context = buildChatContext(appData, 'List installations by zone');

    expect(context.installations).toEqual([]);
    expect(context.summary).toContain('installationsByZone');
  });

  it('provides joined vendor, exam, and requirement data for flexible questions', () => {
    const context = buildChatContext(appData, 'How many candidates by vendor and exam?');

    expect(context.records).toEqual([expect.objectContaining({
      installationId: 'installation-1',
      zone: 'North',
      clientName: 'Client',
      examName: 'Exam',
      vendorName: 'Vendor',
      localVendorCost: 1000,
      examDates: [{ examDate: '2026-02-01', scheduledCandidates: 50 }],
    })]);
    expect(context.requirements).toHaveLength(1);
    expect(context.vendors).toHaveLength(1);
    expect(context.installations).toEqual([]);
  });
});

describe('sendChatMessage', () => {
  it('reports missing endpoint configuration', async () => {
    await expect(sendChatMessage('hello', buildChatContext(appData), [])).rejects.toThrow(
      'chat service is not configured'
    );
  });

  it('sends the prompt, filtered context, and conversation to the configured service', async () => {
    vi.stubEnv('VITE_GEMINI_CHAT_ENDPOINT', 'https://chat.example/api/chat');
    sessionStorage.setItem('ion_session', 'test-session-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ answer: 'There is one installation.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await expect(sendChatMessage('Count installations', buildChatContext(appData), [
      { role: 'user', text: 'Hello' },
    ])).resolves.toBe('There is one installation.');

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      message: string;
      history: Array<{ role: string; text: string }>;
      context: unknown;
    };
    expect(body.message).toBe('Count installations');
    expect(body.history).toEqual([{ role: 'user', text: 'Hello' }]);
    expect(JSON.stringify(body.context)).not.toContain('secret-hash');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer test-session-token' });

    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  });

  it('explains network and CORS fetch failures with deployment checks', async () => {
    vi.stubEnv('VITE_GEMINI_CHAT_ENDPOINT', 'https://chat.example/api/chat');
    sessionStorage.setItem('ion_session', 'test-session-token');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(sendChatMessage('hello', buildChatContext(appData), []))
      .rejects.toThrow('VITE_GEMINI_CHAT_ENDPOINT');
  });

  it('turns oversized detail requests into actionable concise guidance', async () => {
    vi.stubEnv('VITE_GEMINI_CHAT_ENDPOINT', 'https://chat.example/api/chat');
    sessionStorage.setItem('ion_session', 'test-session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'The loaded data is too large for one chat request.' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    ));

    await expect(sendChatMessage('Show all installation details', buildChatContext(appData, 'Show all installation details'), []))
      .resolves.toContain('Narrow your request by zone, client, exam, or date');

    vi.unstubAllEnvs();
  });

  it('shrinks oversized detail requests before sending them to the worker', async () => {
    vi.stubEnv('VITE_GEMINI_CHAT_ENDPOINT', 'https://chat.example/api/chat');
    sessionStorage.setItem('ion_session', 'test-session-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ answer: 'Here is the requested summary.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    const context = buildChatContext(appData, 'Show all installation details');
    const installation = context.installations[0];
    context.installations = Array.from({ length: 5_000 }, () => installation);

    await expect(sendChatMessage('Show all installation details', context, [])).resolves.toBe(
      'Here is the requested summary.'
    );

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(new TextEncoder().encode(String(fetchMock.mock.calls[0][1]?.body)).byteLength).toBeLessThan(700_000);
    expect(request.context.detailsOmitted).toBe(true);
    expect(request.context.installations.length).toBeLessThan(5_000);

    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  });
});
