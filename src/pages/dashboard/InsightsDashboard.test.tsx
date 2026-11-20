import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import InsightsDashboard from './InsightsDashboard';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/FilterContext', () => ({ useFilters: vi.fn() }));

const initialData: AppData = {
  users: [],
  requirements: [],
  vendors: [],
  installations: [],
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

describe('InsightsDashboard', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: null,
      data: initialData,
      syncStatus: 'idle',
      syncError: '',
      isApiConfigured: true,
      login: async () => false,
      logout: async () => undefined,
      createUserAccount: async user => user,
      changeUserPassword: async () => undefined,
      updateData: vi.fn(),
      addAuditLog: vi.fn(),
      can: () => false,
      reloadFromGitHub: async () => undefined,
    });
    vi.mocked(useFilters).mockReturnValue({
      filters: { startDate: '', endDate: '', client: '', exam: '', zone: '', tcCode: '' },
      setFilters: vi.fn(),
      clearFilters: vi.fn(),
    });
  });

  it('shows comparison controls and useful empty states without records', () => {
    render(<InsightsDashboard />);

    expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By City' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By State' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By Vendor' })).toBeInTheDocument();
    expect(screen.getByText('No installation data matches the selected filters.')).toBeInTheDocument();
    expect(screen.getByText('No observations match the selected filters.')).toBeInTheDocument();
  });
});
