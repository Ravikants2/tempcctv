import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ObservationSeverity, ObservationType, User } from '../../types';
import { formatExamDate } from '../../utils/dates';
import type { PostExamObservationEntry } from '../../utils/postExamObservations';
import { Modal } from '../ui';
import { TablePagination } from '../ui/TablePagination';

const PAGE_SIZE = 2;

interface PostExamObservationHistoryProps {
  tcCode: string;
  entries: PostExamObservationEntry[];
  users: User[];
  severities?: ObservationSeverity[];
  observationTypes?: ObservationType[];
}

export function PostExamObservationHistory({
  tcCode,
  entries,
  users,
  severities = [],
  observationTypes = [],
}: PostExamObservationHistoryProps) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const orderedEntries = [...entries].sort((left, right) =>
    right.observation.createdAt.localeCompare(left.observation.createdAt)
  );
  const pageCount = Math.max(1, Math.ceil(orderedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageEntries = orderedEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const projectCount = new Set(orderedEntries.map(entry =>
    `${entry.clientName.trim().toLocaleLowerCase()}\u0000${entry.examName.trim().toLocaleLowerCase()}`
  )).size;
  const venueName = orderedEntries[0]?.tcName;
  const severityById = new Map(severities.map(severity => [severity.id, severity]));
  const observationTypeById = new Map(observationTypes.map(type => [type.id, type]));
  const rank = (severity?: ObservationSeverity) =>
    severity?.color === 'red' ? 3 : severity?.color === 'amber' ? 2 : severity?.color === 'green' ? 1 : 0;
  const highestSeverity = orderedEntries
    .map(entry => severityById.get(entry.observation.severityId || ''))
    .filter((severity): severity is ObservationSeverity => Boolean(severity))
    .sort((left, right) => rank(right) - rank(left))[0];
  const blinkClass = highestSeverity?.color === 'red'
    ? 'severity-blink-red'
    : highestSeverity?.color === 'amber'
      ? 'severity-blink-amber'
      : highestSeverity?.color === 'green'
        ? 'severity-blink-green'
        : '';

  return (
    <>
      <button
        type="button"
        disabled={orderedEntries.length === 0}
        aria-label={`View ${orderedEntries.length} post-exam observations for TC ${tcCode}`}
        title={`${orderedEntries.length} post-exam observation${orderedEntries.length === 1 ? '' : 's'}`}
        onClick={() => { setPage(1); setOpen(true); }}
        className={`inline-flex min-w-8 items-center justify-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-default disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 ${blinkClass}`}
      >
        <MessageSquareText size={13} aria-hidden="true" />
        {orderedEntries.length}
      </button>

      {open && createPortal(
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={`Post-exam observations · TC ${tcCode}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{venueName || 'Venue details unavailable'}</p>
              <p className="text-xs text-slate-500">
                {orderedEntries.length} observation{orderedEntries.length === 1 ? '' : 's'} across {projectCount} project{projectCount === 1 ? '' : 's'} · newest first
              </p>
            </div>

            <section aria-label="Observation comments">
              <div className="max-h-[55vh] space-y-3 overflow-y-auto">
                {pageEntries.map(({ observation, clientName, examName, tcName, zone, state, city, vendor, installationType }) => {
                  const author = users.find(user => user.id === observation.createdBy)?.name || 'Former user';
                  const timestamp = new Date(observation.createdAt);
                  const postedAt = Number.isNaN(timestamp.getTime())
                    ? observation.createdAt
                    : timestamp.toLocaleString('en-IN');
                  const severity = severityById.get(observation.severityId || '');
                  const observationType = observationTypeById.get(observation.observationTypeId || '');
                  return (
                    <article key={observation.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <section className="rounded-md bg-slate-50 p-2">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Project / exam</h3>
                          <p className="mt-1 text-xs font-medium text-slate-900">{clientName} · {examName}</p>
                          <p className="mt-1 text-xs text-slate-600">Exam date: {formatExamDate(observation.examDate)}</p>
                        </section>
                        <section className="rounded-md bg-slate-50 p-2">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Venue / vendor</h3>
                          <p className="mt-1 text-xs font-medium text-slate-900">{tcCode} · {tcName}</p>
                          <p className="mt-1 text-xs text-slate-600">{zone} · {state} · {city}</p>
                          <p className="mt-1 text-xs font-medium text-slate-800">{vendor?.vendorName || 'Vendor unavailable'}</p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {vendor?.vendorCode ? `Code ${vendor.vendorCode}` : 'Code not recorded'}
                            {vendor?.zone ? ` · ${vendor.zone}` : ''} · {installationType}
                          </p>
                        </section>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {severity && (
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            severity.color === 'red'
                              ? 'severity-blink-red bg-red-100 text-red-800'
                              : severity.color === 'amber'
                                ? 'severity-blink-amber bg-amber-100 text-amber-800'
                                : 'severity-blink-green bg-green-100 text-green-800'
                          }`}>
                            Severity: {severity.name}
                          </span>
                        )}
                        {observationType && (
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                            {observationType.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {observation.comment}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-500">{author} · {postedAt}</p>
                    </article>
                  );
                })}
              </div>
              <TablePagination
                page={currentPage}
                pageSize={PAGE_SIZE}
                totalItems={orderedEntries.length}
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
