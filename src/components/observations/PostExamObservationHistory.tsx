import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { createPortal } from 'react-dom';
import type {
  InstallationType,
  PostExamObservation,
  User,
  VendorMaster,
} from '../../types';
import { formatExamDate } from '../../utils/dates';
import { Modal } from '../ui';
import { TablePagination } from '../ui/TablePagination';

const PAGE_SIZE = 2;

interface PostExamObservationHistoryProps {
  installationRecordId: string;
  observations: PostExamObservation[];
  users: User[];
  clientName: string;
  examName: string;
  examDates: string[];
  tcCode: string;
  tcName: string;
  zone: string;
  state: string;
  city: string;
  vendor?: VendorMaster;
  installationType: InstallationType;
}

export function PostExamObservationHistory({
  installationRecordId,
  observations,
  users,
  clientName,
  examName,
  examDates,
  tcCode,
  tcName,
  zone,
  state,
  city,
  vendor,
  installationType,
}: PostExamObservationHistoryProps) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const recordObservations = observations
    .filter(observation => observation.installationRecordId === installationRecordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const pageCount = Math.max(1, Math.ceil(recordObservations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageObservations = recordObservations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <>
      <button
        type="button"
        disabled={recordObservations.length === 0}
        aria-label={`View ${recordObservations.length} post-exam observations for TC ${tcCode}`}
        title={`${recordObservations.length} post-exam observation${recordObservations.length === 1 ? '' : 's'}`}
        onClick={() => { setPage(1); setOpen(true); }}
        className="inline-flex min-w-8 items-center justify-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
      >
        <MessageSquareText size={13} aria-hidden="true" />
        {recordObservations.length}
      </button>

      {open && createPortal(
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={`Post-exam observations (${recordObservations.length})`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam details</h3>
                <p className="mt-2 text-sm font-medium text-slate-900">{examName}</p>
                <p className="mt-1 text-xs text-slate-600">{clientName}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {examDates.length > 0 ? examDates.map(formatExamDate).join(', ') : 'No exam dates recorded'}
                </p>
              </section>
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Venue details</h3>
                <p className="mt-2 text-sm font-medium text-slate-900">{tcCode} · {tcName}</p>
                <p className="mt-1 text-xs text-slate-600">{zone} · {state} · {city}</p>
              </section>
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor details</h3>
                <p className="mt-2 text-sm font-medium text-slate-900">{vendor?.vendorName || 'Vendor unavailable'}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {vendor?.vendorCode ? `Code ${vendor.vendorCode}` : 'Code not recorded'}
                  {vendor?.zone ? ` · ${vendor.zone}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-600">{installationType}</p>
              </section>
            </div>

            <section aria-label="Observation comments">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Observation history</h3>
                <span className="text-xs text-slate-500">Newest first · 2 per page</span>
              </div>
              <div className="max-h-[42vh] space-y-3 overflow-y-auto">
                {pageObservations.map(observation => {
                  const author = users.find(user => user.id === observation.createdBy)?.name || 'Former user';
                  const timestamp = new Date(observation.createdAt);
                  const postedAt = Number.isNaN(timestamp.getTime())
                    ? observation.createdAt
                    : timestamp.toLocaleString('en-IN');
                  return (
                    <article key={observation.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700">
                          Exam date: {formatExamDate(observation.examDate)}
                        </p>
                        <p className="text-[11px] text-slate-500">{author} · {postedAt}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {observation.comment}
                      </p>
                    </article>
                  );
                })}
              </div>
              <TablePagination
                page={currentPage}
                pageSize={PAGE_SIZE}
                totalItems={recordObservations.length}
                onPageChange={setPage}
              />
            </section>
          </div>
        </Modal>,
        document.body
      )}
    </>
  );
}
