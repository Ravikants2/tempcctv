import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PostExamObservationEntry } from '../../utils/postExamObservations';
import { PostExamObservationHistory } from './PostExamObservationHistory';

const entries: PostExamObservationEntry[] = [
  {
    observation: {
      id: 'observation-1', installationRecordId: 'installation-1', examDate: '2026-02-01',
      comment: 'Oldest observation', createdBy: 'user-1', createdAt: '2026-02-02T10:00:00.000Z',
    },
    clientName: 'Client A', examName: 'Exam A', tcCode: 'TC-100', tcName: 'Test Venue',
    zone: 'East 1', state: 'State A', city: 'City A',
    vendor: { id: 'vendor-1', vendorCode: 'V-1', zone: 'East 1', vendorName: 'Test Vendor', createdBy: 'user-1', createdAt: '', updatedAt: '' },
    installationType: 'Full Vendor',
  },
  {
    observation: {
      id: 'observation-2', installationRecordId: 'installation-1', examDate: '2026-02-01',
      comment: 'Middle observation', createdBy: 'user-1', createdAt: '2026-02-03T10:00:00.000Z',
    },
    clientName: 'Client A', examName: 'Exam A', tcCode: 'TC-100', tcName: 'Test Venue',
    zone: 'East 1', state: 'State A', city: 'City A',
    vendor: { id: 'vendor-1', vendorCode: 'V-1', zone: 'East 1', vendorName: 'Test Vendor', createdBy: 'user-1', createdAt: '', updatedAt: '' },
    installationType: 'Full Vendor',
  },
  {
    observation: {
      id: 'observation-3', installationRecordId: 'installation-2', examDate: '2026-03-01',
      comment: 'Newest observation', createdBy: 'user-1', createdAt: '2026-02-04T10:00:00.000Z',
    },
    clientName: 'Client B', examName: 'Exam B', tcCode: 'TC-100', tcName: 'Test Venue',
    zone: 'West 1', state: 'State B', city: 'City B',
    vendor: { id: 'vendor-2', vendorCode: 'V-2', zone: 'West 1', vendorName: 'Other Vendor', createdBy: 'user-1', createdAt: '', updatedAt: '' },
    installationType: 'Partial Vendor',
  },
];

describe('PostExamObservationHistory', () => {
  it('shows all projects for a TC code and paginates two newest comments at a time', () => {
    render(<PostExamObservationHistory
      tcCode="TC-100"
      entries={entries}
      users={[{ id: 'user-1', name: 'Backend User', email: 'backend@example.com', role: 'backend_user' }]}
    />);

    const countButton = screen.getByRole('button', { name: 'View 3 post-exam observations for TC TC-100' });
    expect(countButton).toBeInTheDocument();
    expect(screen.queryByText('Newest observation')).not.toBeInTheDocument();
    fireEvent.click(countButton);

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Newest observation')).toBeInTheDocument();
    expect(dialog.getByText('Middle observation')).toBeInTheDocument();
    expect(dialog.getByText('Client B · Exam B')).toBeInTheDocument();
    expect(dialog.getByText('Other Vendor')).toBeInTheDocument();
    expect(dialog.queryByText('Oldest observation')).not.toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Next page' }));

    expect(dialog.getByText('Oldest observation')).toBeInTheDocument();
    expect(dialog.queryByText('Newest observation')).not.toBeInTheDocument();
  });
});
