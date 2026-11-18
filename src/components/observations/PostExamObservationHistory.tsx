import { useState } from 'react';
import type { PostExamObservation, User } from '../../types';
import { formatExamDate } from '../../utils/dates';
import { TablePagination } from '../ui/TablePagination';

const PAGE_SIZE = 2;

interface PostExamObservationHistoryProps {
  installationRecordId: string;
  observations: PostExamObservation[];
  users: User[];
}

export function PostExamObservationHistory({
  installationRecordId,
  observations,
  users,
}: PostExamObservationHistoryProps) {
  const [page, setPage] = useState(1);
  const recordObservations = observations
    .filter(observation => observation.installationRecordId === installationRecordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const pageCount = Math.max(1, Math.ceil(recordObservations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageObservations = recordObservations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  if (recordObservations.length === 0) {
    return <span className="text-xs text-slate-400">No observations</span>;
  }

  return (
    <div className="min-w-[180px] space-y-2">
      {pageObservations.map(observation => {
        const author = users.find(user => user.id === observation.createdBy)?.name || 'Former user';
        const timestamp = new Date(observation.createdAt);
        const postedAt = Number.isNaN(timestamp.getTime())
          ? observation.createdAt
          : timestamp.toLocaleString('en-IN');
        return (
          <article key={observation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] font-semibold text-slate-700">
              {formatExamDate(observation.examDate)}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-800">
              {observation.comment}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">{author} · {postedAt}</p>
          </article>
        );
      })}
      <TablePagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        totalItems={recordObservations.length}
        onPageChange={setPage}
      />
    </div>
  );
}
