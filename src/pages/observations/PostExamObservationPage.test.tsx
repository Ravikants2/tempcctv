import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import PostExamObservationPage from './PostExamObservationPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const initialData: AppData = {
  users: [{
    id: 'backend-1', name: 'Backend User', email: 'backend@example.com', role: 'backend_user',
  }],
  requirements: [{
    id: 'requirement-1', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-100', tcName: 'Test Venue', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  vendors: [],
  installations: [{
    id: 'installation-1', requirementId: 'requirement-1', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 12500, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
  }],
  examDates: [{
    id: 'date-1', installationRecordId: 'installation-1',
    examDate: '2026-02-01', scheduledCandidates: 500,
  }],
  postExamObservations: [],
  quotations: [],
  quoteRevisions: [],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [],
};

describe('PostExamObservationPage', () => {
  let mockData = initialData;
  let updatedData: AppData | undefined;

  beforeEach(() => {
    mockData = initialData;
    updatedData = undefined;
    vi.mocked(useAuth).mockReturnValue({
      currentUser: initialData.users[0],
      data: mockData,
      syncStatus: 'idle',
      syncError: '',
      isApiConfigured: true,
      login: async () => false,
      logout: async () => undefined,
      createUserAccount: async user => user,
      changeUserPassword: async () => undefined,
      updateData: updater => { updatedData = updater(mockData); },
      addAuditLog: vi.fn(),
      can: action => action === 'page:post-exam-observations' || action === 'observations:create',
      reloadFromGitHub: async () => undefined,
    });
  });

  it('posts a comment against the selected venue and saved exam date', () => {
    render(<PostExamObservationPage />);

    expect(screen.getAllByText('01/02/2026').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add observation' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Observation' }), {
      target: { value: 'Reviewed the venue after the exam.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));

    expect(updatedData?.postExamObservations).toHaveLength(1);
    expect(updatedData?.postExamObservations[0]).toMatchObject({
      installationRecordId: 'installation-1',
      examDate: '2026-02-01',
      comment: 'Reviewed the venue after the exam.',
      createdBy: 'backend-1',
    });
  });
});
