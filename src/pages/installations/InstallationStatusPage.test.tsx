import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Role } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { TEMP_CCTV_INSTALLATION_DECLARATION } from '../../utils/installation';
import InstallationStatusPage from './InstallationStatusPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const initialData: AppData = {
  users: [],
  requirements: [{
    id: 'requirement-1', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-100', tcName: 'Test Venue 1', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }, {
    id: 'requirement-2', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-200', tcName: 'Test Venue 2', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  vendors: [],
  installations: [{
    id: 'installation-1', requirementId: 'requirement-1', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 12500, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
    approvalStatus: 'approved', workOrderDownloadedAt: '2026-01-03T00:00:00.000Z',
  }, {
    id: 'installation-2', requirementId: 'requirement-2', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 8, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 10000, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
    approvalStatus: 'approved', workOrderDownloadedAt: '2026-01-03T00:00:00.000Z',
  }],
  examDates: [],
  postExamObservations: [],
  quotations: [],
  quoteRevisions: [],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [],
};

describe('InstallationStatusPage', () => {
  let mockData = initialData;
  let updatedData: AppData | undefined;
  let updateData: (updater: (previous: AppData) => AppData) => void;

  beforeEach(() => {
    mockData = initialData;
    updatedData = undefined;
    updateData = vi.fn((updater: (previous: AppData) => AppData) => {
      updatedData = updater(mockData);
    });
    mockAuthData('user', true);
  });

  function mockAuthData(role: Role, canEdit: boolean) {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: { id: 'user-1', name: 'Test User', email: 'user@example.com', role },
      data: mockData,
      syncStatus: 'idle',
      syncError: '',
      isApiConfigured: true,
      login: async () => false,
      logout: async () => undefined,
      createUserAccount: async user => user,
      changeUserPassword: async () => undefined,
      updateData,
      addAuditLog: vi.fn(),
      can: permission => permission === 'records:edit' && canEdit,
      reloadFromGitHub: async () => undefined,
    });
  }

  function acceptDeclarationAndConfirm(date: string) {
    fireEvent.change(screen.getByLabelText('Installation date'), { target: { value: date } });
    fireEvent.click(screen.getByLabelText(TEMP_CCTV_INSTALLATION_DECLARATION));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm installation' }));
  }

  it('lets an editable user complete one venue with a date and declaration', () => {
    render(<InstallationStatusPage />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Complete' })[0]);
    const installationDate = new Date().toISOString().slice(0, 10);
    acceptDeclarationAndConfirm(installationDate);

    expect(updatedData?.installations[0]).toMatchObject({
      tempCctvInstalledAt: installationDate,
      tempCctvInstalledBy: 'user-1',
      tempCctvInstallationDeclaration: TEMP_CCTV_INSTALLATION_DECLARATION,
    });
    expect(updatedData?.installations[0].tempCctvInstallationDeclaredAt).toBeTruthy();
    expect(updatedData?.auditLogs[0]).toMatchObject({
      entityType: 'TemporaryCCTVInstallation',
      entityId: 'installation-1',
      userId: 'user-1',
    });
  });

  it('lets an editable user complete selected venues in bulk', () => {
    render(<InstallationStatusPage />);

    fireEvent.click(screen.getByLabelText('Select all eligible venues on this page'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark selected installed (2)' }));
    acceptDeclarationAndConfirm(new Date().toISOString().slice(0, 10));

    expect(updatedData?.installations.map(record => record.tempCctvInstalledAt))
      .toEqual([expect.any(String), expect.any(String)]);
    expect(updatedData?.installations.every(record =>
      record.tempCctvInstallationDeclaration === TEMP_CCTV_INSTALLATION_DECLARATION
    )).toBe(true);
    expect(updatedData?.auditLogs).toHaveLength(2);
  });

  it('keeps installation completion read-only for users without edit permission', () => {
    mockAuthData('viewer', false);
    render(<InstallationStatusPage />);

    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark selected installed/ })).not.toBeInTheDocument();
  });
});
