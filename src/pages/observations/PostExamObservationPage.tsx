import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Alert, Modal } from '../../components/ui';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { TablePagination } from '../../components/ui/TablePagination';
import type {
  InstallationRecord,
  ObservationSeverity,
  ObservationType,
  PostExamObservation,
  RequirementMaster,
} from '../../types';
import { formatExamDate, normalizeExamDate } from '../../utils/dates';

const PAGE_SIZE = 10;

interface ObservationRow {
  installation: InstallationRecord;
  requirement: RequirementMaster;
  examDate: string;
}

export default function PostExamObservationPage() {
  const { data, currentUser, can, updateData } = useAuth();
  const [clientFilter, setClientFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [examDateFilter, setExamDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<ObservationRow | null>(null);
  const [comment, setComment] = useState('');
  const [severityId, setSeverityId] = useState('');
  const [observationTypeId, setObservationTypeId] = useState('');
  const [severityName, setSeverityName] = useState('');
  const [severityColor, setSeverityColor] = useState<ObservationSeverity['color']>('amber');
  const [observationTypeName, setObservationTypeName] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const canCreate = can('observations:create');
  const canManageLists = can('observations:manage_lists');
  const severities = data.observationSeverities?.length
    ? data.observationSeverities
    : [
        { id: 'severity-high', name: 'High', color: 'red' as const, createdAt: '' },
        { id: 'severity-mid', name: 'Mid', color: 'amber' as const, createdAt: '' },
        { id: 'severity-low', name: 'Low', color: 'green' as const, createdAt: '' },
      ];
  const observationTypes = data.observationTypes?.length
    ? data.observationTypes
    : [
        { id: 'observation-poor-camera', name: 'Poor Camera Quality', createdAt: '' },
        { id: 'observation-recording-missing', name: 'Recording Missing', createdAt: '' },
      ];

  const rows = useMemo(() => {
    const requirementsById = new Map(data.requirements.map(requirement => [requirement.id, requirement]));
    return data.installations.flatMap(installation => {
      const requirement = requirementsById.get(installation.requirementId);
      if (!requirement) return [];
      const examDates = [...new Set(data.examDates
        .filter(schedule => schedule.installationRecordId === installation.id)
        .map(schedule => normalizeExamDate(schedule.examDate) || schedule.examDate.trim())
        .filter(Boolean))];
      return examDates.map(examDate => ({ installation, requirement, examDate }));
    });
  }, [data.examDates, data.installations, data.requirements]);

  const clients = [...new Set(rows.map(row => row.requirement.clientName))].sort();
  const exams = [...new Set(rows
    .filter(row => !clientFilter || row.requirement.clientName === clientFilter)
    .map(row => row.requirement.examName))].sort();
  const zones = [...new Set(rows.map(row => row.requirement.zone))].sort();
  const states = [...new Set(rows
    .filter(row => !zoneFilter || row.requirement.zone === zoneFilter)
    .map(row => row.requirement.state))].sort();
  const examDates = [...new Set(rows
    .filter(row =>
      (!clientFilter || row.requirement.clientName === clientFilter) &&
      (!examFilter || row.requirement.examName === examFilter)
    )
    .map(row => row.examDate))].sort();

  const filteredRows = rows.filter(row => {
    if (clientFilter && row.requirement.clientName !== clientFilter) return false;
    if (examFilter && row.requirement.examName !== examFilter) return false;
    if (zoneFilter && row.requirement.zone !== zoneFilter) return false;
    if (stateFilter && row.requirement.state !== stateFilter) return false;
    if (examDateFilter && row.examDate !== examDateFilter) return false;
    const query = search.trim().toLocaleLowerCase();
    return !query || [
      row.requirement.tcCode,
      row.requirement.tcName,
      row.requirement.city,
    ].some(value => value.toLocaleLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const observationsForRow = (row: ObservationRow): PostExamObservation[] =>
    data.postExamObservations.filter(observation =>
      observation.installationRecordId === row.installation.id &&
      (normalizeExamDate(observation.examDate) || observation.examDate) === row.examDate
    );

  const clearFilters = () => {
    setClientFilter('');
    setExamFilter('');
    setZoneFilter('');
    setStateFilter('');
    setExamDateFilter('');
    setSearch('');
    setPage(1);
  };

  const addSeverity = () => {
    const name = severityName.trim();
    if (!name) return;
    if (severities.some(severity => severity.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFormError('A severity with this name already exists.');
      return;
    }
    const severity: ObservationSeverity = {
      id: uuidv4(),
      name,
      color: severityColor,
      createdAt: new Date().toISOString(),
    };
    updateData(previous => ({
      ...previous,
      observationSeverities: [...(previous.observationSeverities?.length
        ? previous.observationSeverities
        : severities), severity],
    }));
    setSeverityName('');
    setSuccessMessage('Severity level added.');
  };

  const addObservationType = () => {
    const name = observationTypeName.trim();
    if (!name) return;
    if (observationTypes.some(type => type.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFormError('A predefined observation with this name already exists.');
      return;
    }
    const observationType: ObservationType = {
      id: uuidv4(),
      name,
      createdAt: new Date().toISOString(),
    };
    updateData(previous => ({
      ...previous,
      observationTypes: [...(previous.observationTypes?.length
        ? previous.observationTypes
        : observationTypes), observationType],
    }));
    setObservationTypeName('');
    setSuccessMessage('Predefined observation added.');
  };

  const saveObservation = () => {
    const trimmedComment = comment.trim();
    if (!selectedRow) return;
    if (!trimmedComment) {
      setFormError('Enter an observation before saving.');
      return;
    }
    if (!severityId) {
      setFormError('Select a severity.');
      return;
    }
    if (!observationTypeId) {
      setFormError('Select a predefined observation type.');
      return;
    }
    if (!currentUser) {
      setFormError('Unable to identify the signed-in user. Please sign in again.');
      return;
    }

    const observation: PostExamObservation = {
      id: uuidv4(),
      installationRecordId: selectedRow.installation.id,
      examDate: selectedRow.examDate,
      comment: trimmedComment,
      severityId,
      observationTypeId,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    updateData(previous => ({
      ...previous,
      postExamObservations: [...previous.postExamObservations, observation],
    }));
    setSelectedRow(null);
    setComment('');
    setSeverityId('');
    setObservationTypeId('');
    setFormError('');
    setSuccessMessage('Post-exam observation added.');
  };

  return (
    <div>
      <div className="mb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Backend workspace</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Post exam Observation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add comments to saved venue exam dates. The latest two comments are shown in Records and Approvals.
        </p>
      </div>

      {successMessage && (
        <div className="mb-4">
          <Alert type="success" onClose={() => setSuccessMessage('')}>{successMessage}</Alert>
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Observation filters">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Client" value={clientFilter} options={clients.map(value => ({ value, label: value }))}
            placeholder="All clients" className="w-44"
            onChange={event => { setClientFilter(event.target.value); setExamFilter(''); setExamDateFilter(''); setPage(1); }} />
          <Select label="Exam" value={examFilter} options={exams.map(value => ({ value, label: value }))}
            placeholder="All exams" className="w-44"
            onChange={event => { setExamFilter(event.target.value); setExamDateFilter(''); setPage(1); }} />
          <Select label="Zone" value={zoneFilter} options={zones.map(value => ({ value, label: value }))}
            placeholder="All zones" className="w-40"
            onChange={event => { setZoneFilter(event.target.value); setStateFilter(''); setPage(1); }} />
          <Select label="State" value={stateFilter} options={states.map(value => ({ value, label: value }))}
            placeholder="All states" className="w-44"
            onChange={event => { setStateFilter(event.target.value); setPage(1); }} />
          <Select label="Exam date" value={examDateFilter} options={examDates.map(value => ({
            value, label: formatExamDate(value),
          }))} placeholder="All dates" className="w-40"
            onChange={event => { setExamDateFilter(event.target.value); setPage(1); }} />
          <Input label="Venue / TC code" value={search} className="w-48" placeholder="Search venue"
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
          {(clientFilter || examFilter || zoneFilter || stateFilter || examDateFilter || search) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">{filteredRows.length} venue exam date{filteredRows.length === 1 ? '' : 's'}</p>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Client · Exam</th>
                <th className="px-3 py-3">Zone · State</th>
                <th className="px-3 py-3">TC code · venue</th>
                <th className="px-3 py-3">Exam date</th>
                <th className="px-3 py-3">Observations</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => {
                const observationCount = observationsForRow(row).length;
                return (
                  <tr key={`${row.installation.id}-${row.examDate}`} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{row.requirement.clientName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.requirement.examName}</p>
                    </td>
                    <td className="whitespace-normal px-3 py-3">{row.requirement.zone}<br />{row.requirement.state}</td>
                    <td className="max-w-xs whitespace-normal px-3 py-3">
                      <span className="font-mono text-xs font-semibold text-blue-700">{row.requirement.tcCode}</span>
                      <p className="mt-1 break-words font-medium text-slate-900">{row.requirement.tcName}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{formatExamDate(row.examDate)}</td>
                    <td className="px-3 py-3">{observationCount}</td>
                    <td className="px-3 py-3">
                      {canCreate ? (
                        <Button size="sm" onClick={() => {
                          setSelectedRow(row);
                          setComment('');
                          setSeverityId(severities[0]?.id || '');
                          setObservationTypeId(observationTypes[0]?.id || '');
                          setFormError('');
                        }}>Add observation</Button>
                      ) : <span className="text-xs text-slate-500">Read only</span>}
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    {rows.length === 0
                      ? 'No saved exam dates are available. Add exam dates to venue records before posting observations.'
                      : 'No venue exam dates match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredRows.length} onPageChange={setPage} />
      </div>

      {canManageLists && (
        <section className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2"
          aria-label="Observation list management">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Severity levels</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {severities.map(severity => (
                <span key={severity.id}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    severity.color === 'red' ? 'bg-red-100 text-red-800'
                      : severity.color === 'amber' ? 'bg-amber-100 text-amber-800'
                        : 'bg-green-100 text-green-800'
                  }`}>
                  {severity.name}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <Input label="Severity name" value={severityName} placeholder="e.g. Critical"
                onChange={event => setSeverityName(event.target.value)} className="w-40" />
              <Select label="Blink colour" value={severityColor}
                options={[
                  { value: 'red', label: 'Red' },
                  { value: 'amber', label: 'Amber' },
                  { value: 'green', label: 'Light green' },
                ]}
                onChange={event => setSeverityColor(event.target.value as ObservationSeverity['color'])}
                className="w-36" />
              <Button size="sm" onClick={addSeverity}>Add severity</Button>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Predefined observations</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {observationTypes.map(type => (
                <span key={type.id} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                  {type.name}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <Input label="Observation list item" value={observationTypeName} placeholder="e.g. Camera Offline"
                onChange={event => setObservationTypeName(event.target.value)} className="flex-1" />
              <Button size="sm" onClick={addObservationType}>Add list item</Button>
            </div>
          </div>
        </section>
      )}

      <Modal open={Boolean(selectedRow)} title="Add post-exam observation" size="md"
        onClose={() => { setSelectedRow(null); setFormError(''); }}>
        {selectedRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{selectedRow.requirement.clientName} · {selectedRow.requirement.examName}</p>
              <p className="mt-1 text-slate-600">{selectedRow.requirement.tcCode} · {selectedRow.requirement.tcName}</p>
              <p className="mt-1 text-slate-600">{selectedRow.requirement.zone} · {selectedRow.requirement.state} · {formatExamDate(selectedRow.examDate)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Severity" value={severityId} required
                options={severities.map(severity => ({ value: severity.id, label: severity.name }))}
                placeholder="Select severity"
                onChange={event => { setSeverityId(event.target.value); setFormError(''); }} />
              <Select label="Observation type" value={observationTypeId} required
                options={observationTypes.map(type => ({ value: type.id, label: type.name }))}
                placeholder="Select observation"
                onChange={event => { setObservationTypeId(event.target.value); setFormError(''); }} />
            </div>
            <Textarea label="Observation" value={comment} rows={5} maxLength={2000}
              placeholder="Enter the post-exam observation"
              onChange={event => { setComment(event.target.value); setFormError(''); }} />
            <p className="text-right text-xs text-slate-500">{comment.length}/2000</p>
            {formError && <Alert type="error">{formError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelectedRow(null); setFormError(''); }}>Cancel</Button>
              <Button onClick={saveObservation}>Save observation</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
