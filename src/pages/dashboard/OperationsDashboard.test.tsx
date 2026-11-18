import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import OperationsDashboard from './OperationsDashboard';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/FilterContext', () => ({ useFilters: vi.fn() }));

const initialData: AppData = {
  users: [],
  requirements: [{
    id: 'requirement-complete', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-100', tcName: 'Completed Venue', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }, {
    id: 'requirement-pending', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-200', tcName: 'Pending Venue', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }, {
    id: 'requirement-not-created', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-300', tcName: 'Unsubmitted Venue', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  vendors: [],
  installations: [{
    id: 'installation-complete', requirementId: 'requirement-complete', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 12500, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
    approvalStatus: 'approved', workOrderDownloadedAt: '2026-01-03T00:00:00.000Z',
    tempCctvInstalledAt: '2026-01-04',
  }, {
    id: 'installation-pending', requirementId: 'requirement-pending', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 8, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 10000, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
    approvalStatus: 'approved', workOrderDownloadedAt: '2026-01-03T00:00:00.000Z',
  }],
  examDates: [],
  quotations: [],
  quoteRevisions: [],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [],
};

describe('OperationsDashboard temporary CCTV status', () => {
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

  it('shows installation counts and filters venue details by temporary CCTV status', () => {
    render(
      <MemoryRouter>
        <OperationsDashboard />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Temp. CCTV Installed')).toHaveLength(2);
    expect(screen.getAllByText('Temp. CCTV Pending')).toHaveLength(2);

    const clientSummaryTable = screen.getAllByRole('table')[0];
    const clientButtons = within(clientSummaryTable).getAllByRole('button', { name: 'Client' });
    fireEvent.click(clientButtons[1]);
    const clientRow = clientButtons[1].closest('tr');
    if (!clientRow) throw new Error('Client summary row was not rendered.');
    expect(within(clientRow).getAllByRole('cell').map(cell => cell.textContent))
      .toEqual(['Client', '3', '1', '2', '0', '2', '2', '0', '1', '1']);

    const venueTable = screen.getAllByRole('table')[2];
    fireEvent.change(screen.getByLabelText('Temp. CCTV status'), { target: { value: 'Completed' } });

    expect(within(venueTable).getByText('Completed')).toBeInTheDocument();
    expect(within(venueTable).queryByText('Pending Venue')).not.toBeInTheDocument();
    expect(within(venueTable).queryByText('Awaiting workorder')).not.toBeInTheDocument();
  });
});
