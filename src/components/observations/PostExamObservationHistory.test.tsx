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
    />);

    expect(screen.getByText('Newest observation')).toBeInTheDocument();
    expect(screen.getByText('Middle observation')).toBeInTheDocument();
    expect(screen.queryByText('Oldest observation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Oldest observation')).toBeInTheDocument();
    expect(screen.queryByText('Newest observation')).not.toBeInTheDocument();
  });
});
