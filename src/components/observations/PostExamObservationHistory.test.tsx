import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PostExamObservation } from '../../types';
import { PostExamObservationHistory } from './PostExamObservationHistory';

const observations: PostExamObservation[] = [
  {
    id: 'observation-1', installationRecordId: 'installation-1', examDate: '2026-02-01',
    comment: 'Oldest observation', createdBy: 'user-1', createdAt: '2026-02-02T10:00:00.000Z',
  },
  {
    id: 'observation-2', installationRecordId: 'installation-1', examDate: '2026-02-01',
    comment: 'Middle observation', createdBy: 'user-1', createdAt: '2026-02-03T10:00:00.000Z',
  },
  {
    id: 'observation-3', installationRecordId: 'installation-1', examDate: '2026-02-01',
    comment: 'Newest observation', createdBy: 'user-1', createdAt: '2026-02-04T10:00:00.000Z',
  },
];

describe('PostExamObservationHistory', () => {
  it('shows the two newest comments first and paginates older comments', () => {
    render(<PostExamObservationHistory
      installationRecordId="installation-1"
      observations={observations}
      users={[{ id: 'user-1', name: 'Backend User', email: 'backend@example.com', role: 'backend_user' }]}
      clientName="Client"
      examName="Exam"
      examDates={['2026-02-01']}
      tcCode="TC-100"
      tcName="Test Venue"
      zone="East 1"
      state="State"
      city="City"
      vendor={{ id: 'vendor-1', vendorCode: 'V-1', zone: 'East 1', vendorName: 'Test Vendor', createdBy: 'user-1', createdAt: '', updatedAt: '' }}
      installationType="Full Vendor"
    />);

    expect(screen.getByRole('button', { name: 'View 3 post-exam observations for TC TC-100' })).toBeInTheDocument();
    expect(screen.queryByText('Newest observation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View 3 post-exam observations for TC TC-100' }));

    expect(screen.getByText('Test Vendor')).toBeInTheDocument();
    expect(screen.getByText('Exam details')).toBeInTheDocument();
    expect(screen.getByText('Newest observation')).toBeInTheDocument();
    expect(screen.getByText('Middle observation')).toBeInTheDocument();
    expect(screen.queryByText('Oldest observation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Oldest observation')).toBeInTheDocument();
    expect(screen.queryByText('Newest observation')).not.toBeInTheDocument();
  });
});
