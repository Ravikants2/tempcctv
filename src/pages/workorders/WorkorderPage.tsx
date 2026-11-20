import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { SortableTable } from '../../components/ui/SortableTable';
import { TablePagination } from '../../components/ui/TablePagination';
import { getRequirementExamSchedule } from '../../utils/calculations';
import { Alert, Modal } from '../../components/ui/index';
import { Download, Eye, CheckCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TEMP_CCTV_INSTALLATION_DECLARATION } from '../../utils/installation';

const PAGE_SIZE = 10;

export default function WorkorderPage() {
  const { data, can, currentUser, updateData, addAuditLog } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [exam, setExam] = useState('');
  const [zone, setZone] = useState('');
  const [state, setState] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCompletionIds, setSelectedCompletionIds] = useState<Set<string>>(new Set());
  const [completionRecordIds, setCompletionRecordIds] = useState<string[]>([]);
  const [installationDate, setInstallationDate] = useState(new Date().toISOString().slice(0, 10));
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [completionAlert, setCompletionAlert] = useState('');
  const isZonalUser = currentUser?.role === 'zonal_user';

  const scopedRequirements = data.requirements.filter(requirement =>
    currentUser?.role !== 'zonal_user' || requirement.zone === currentUser.zone
  );
  const approvedRecords = data.installations.filter(record =>
    record.approvalStatus === 'approved' &&
    scopedRequirements.some(requirement => requirement.id === record.requirementId)
  );
  const clients = [...new Set(scopedRequirements.map(requirement => requirement.clientName))].sort();
  const exams = [...new Set(scopedRequirements
    .filter(requirement => !client || requirement.clientName === client)
    .map(requirement => requirement.examName))].sort();
  const zones = [...new Set(scopedRequirements.map(requirement => requirement.zone))].sort();
  const states = [...new Set(scopedRequirements
    .filter(requirement => !zone || requirement.zone === zone)
    .map(requirement => requirement.state))].sort();
  const query = search.trim().toLowerCase();

  const filtered = approvedRecords.filter(record => {
    const requirement = scopedRequirements.find(item => item.id === record.requirementId);
    if (!requirement) return false;
    if (client && requirement.clientName !== client) return false;
    if (exam && requirement.examName !== exam) return false;
    if (zone && requirement.zone !== zone) return false;
    if (state && requirement.state !== state) return false;
    if (downloadStatus === 'downloaded' && !record.workOrderDownloadedAt) return false;
    if (downloadStatus === 'not-downloaded' && record.workOrderDownloadedAt) return false;
    const vendor = data.vendors.find(item => item.id === record.vendorId);
    return !query || [
      requirement.clientName,
      requirement.examName,
      requirement.zone,
      requirement.state,
      requirement.city,
      requirement.tcCode,
      requirement.tcName,
      vendor?.vendorName,
    ].some(value => String(value || '').toLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleEligibleCompletionIds = pageRows
    .filter(record => record.workOrderDownloadedAt && !record.tempCctvInstalledAt)
    .map(record => record.id);
  const allVisibleEligibleSelected = visibleEligibleCompletionIds.length > 0 &&
    visibleEligibleCompletionIds.every(id => selectedCompletionIds.has(id));

  const markDownloaded = (records: typeof filtered) => {
    const timestamp = new Date().toISOString();
    const ids = new Set(records.map(record => record.id));
    updateData(prev => ({
      ...prev,
      installations: prev.installations.map(record =>
        ids.has(record.id)
          ? { ...record, workOrderDownloadedAt: timestamp, workOrderDownloadedBy: currentUser?.id }
          : record
      ),
    }));
    records.forEach(record =>
      addAuditLog('EXPORT', 'Workorder', record.id, undefined, {
        downloadedAt: timestamp,
        downloadedBy: currentUser?.id,
      })
    );
  };

  const downloadWorkordersCSV = (records: typeof filtered) => {
    if (records.length === 0) return;
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const headers = [
      'Client', 'Exam', 'Zone', 'State', 'City', 'TC Code', 'TC Name',
      'Vendor', 'Cameras', 'Exam Days', 'Cost', 'Download Status', 'Installation Status',
    ];
    const rows = records.map(record => {
      const requirement = scopedRequirements.find(item => item.id === record.requirementId);
      const vendor = data.vendors.find(item => item.id === record.vendorId);
      const schedule = getRequirementExamSchedule(record.requirementId, data.requirements, data.installations, data.examDates);
      return [
        requirement?.clientName,
        requirement?.examName,
        requirement?.zone,
        requirement?.state,
        requirement?.city,
        requirement?.tcCode,
        requirement?.tcName,
        vendor?.vendorName,
        record.cameraCount,
        schedule.length,
        record.localVendorCost,
        record.workOrderDownloadedAt ? 'Downloaded' : 'Not downloaded',
        record.tempCctvInstalledAt ? `Installed · ${record.tempCctvInstalledAt}` : 'Pending installation',
      ];
    });
    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(',')),
    ].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workorders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadWorkorders = (records: typeof filtered) => {
    if (records.length === 0) return;
    downloadWorkordersCSV(records);
    markDownloaded(records);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCompletionSelected = (id: string) => {
    setSelectedCompletionIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const beginCompletion = (recordIds: string[]) => {
    setCompletionRecordIds(recordIds);
    setInstallationDate(new Date().toISOString().slice(0, 10));
    setDeclarationAccepted(false);
    setCompletionAlert('');
  };

  const completeInstallations = () => {
    if (!isZonalUser) return;
    if (!installationDate || !declarationAccepted || completionRecordIds.length === 0) {
      setCompletionAlert('Enter the installation date and confirm the declaration to continue.');
      return;
    }

    const recordIds = new Set(completionRecordIds);
    const completedAt = new Date().toISOString();
    const updatedRecords = data.installations.filter(record =>
      recordIds.has(record.id) &&
      record.approvalStatus === 'approved' &&
      Boolean(record.workOrderDownloadedAt) &&
      !record.tempCctvInstalledAt &&
      scopedRequirements.some(requirement => requirement.id === record.requirementId)
    );
    if (updatedRecords.length === 0) {
      setCompletionAlert('No eligible downloaded workorders were found. Refresh the page and try again.');
      return;
    }

    const auditEntries = updatedRecords.map(record => ({
      id: uuidv4(),
      userId: currentUser?.id || 'system',
      action: 'UPDATE' as const,
      entityType: 'TemporaryCCTVInstallation',
      entityId: record.id,
      beforeJson: JSON.stringify(record),
      afterJson: JSON.stringify({
        ...record,
        tempCctvInstalledAt: installationDate,
        tempCctvInstalledBy: currentUser?.id,
        tempCctvInstallationDeclaredAt: completedAt,
        tempCctvInstallationDeclaration: TEMP_CCTV_INSTALLATION_DECLARATION,
      }),
      timestamp: completedAt,
    }));
    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record =>
        updatedRecords.some(updated => updated.id === record.id)
          ? {
              ...record,
              tempCctvInstalledAt: installationDate,
              tempCctvInstalledBy: currentUser?.id,
              tempCctvInstallationDeclaredAt: completedAt,
              tempCctvInstallationDeclaration: TEMP_CCTV_INSTALLATION_DECLARATION,
            }
          : record
      ),
      auditLogs: [...previous.auditLogs, ...auditEntries],
    }));
    setSelectedCompletionIds(new Set());
    setCompletionRecordIds([]);
  };

  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Approved installations</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workorder</h1>
        <p className="mt-1 text-sm text-slate-500">Workorders generated from approved temporary CCTV installation records.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Input aria-label="Search workorders" placeholder="Search workorders..." value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-52" />
          <Select label="Client" value={client}
            onChange={event => { setClient(event.target.value); setExam(''); setPage(1); }}
            options={clients.map(value => ({ value, label: value }))} placeholder="All clients" className="w-44" />
          <Select label="Exam" value={exam} onChange={event => { setExam(event.target.value); setPage(1); }}
            options={exams.map(value => ({ value, label: value }))} placeholder="All exams" className="w-44" />
          <Select label="Zone" value={zone}
            onChange={event => { setZone(event.target.value); setState(''); setPage(1); }}
            options={zones.map(value => ({ value, label: value }))} placeholder="All zones" className="w-36" />
          <Select label="State" value={state} onChange={event => { setState(event.target.value); setPage(1); }}
            options={states.map(value => ({ value, label: value }))} placeholder="All states" className="w-40" />
          <Select label="Workorder status" value={downloadStatus}
            onChange={event => { setDownloadStatus(event.target.value); setPage(1); }}
            options={[{ value: 'downloaded', label: 'Downloaded' }, { value: 'not-downloaded', label: 'Not downloaded' }]}
            placeholder="All workorders" className="w-44" />
          <span className="mb-0.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {filtered.length} workorders
          </span>
          <Button variant="outline" size="sm" disabled={selectedIds.size === 0}
            onClick={() => downloadWorkorders(filtered.filter(record => selectedIds.has(record.id)))}>
            <Download size={14} /> Download CSV ({selectedIds.size})
          </Button>
          <Button size="sm" disabled={filtered.length === 0}
            onClick={() => downloadWorkorders(filtered)}>
            <Download size={14} /> Download CSV all ({filtered.length})
          </Button>
          {isZonalUser && (
            <Button size="sm" variant="secondary" disabled={selectedCompletionIds.size === 0}
              onClick={() => beginCompletion([...selectedCompletionIds])}>
              <CheckCircle size={14} /> Mark selected installed ({selectedCompletionIds.size})
            </Button>
          )}
        </div>
      </div>

      {isZonalUser && (
        <p className="mb-3 text-sm text-slate-600">
          Use the workorder status filter to list downloaded venues. Only downloaded workorders can be marked installed.
        </p>
      )}
      {completionAlert && (
        <Alert type="error" onClose={() => setCompletionAlert('')}>{completionAlert}</Alert>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {(isZonalUser ? ['Complete', 'Select', 'S No'] : ['Select', 'S No']).concat(
                  ['Client', 'Exam', 'Zone', 'State', 'TC Code', 'TC Name', 'Vendor', 'Cameras', 'Exam Days', 'Cost', 'Download status', 'Installation status', 'Actions']
                ).map(heading =>
                  <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {heading === 'Complete' ? (
                      <input type="checkbox" checked={allVisibleEligibleSelected}
                        onChange={event => setSelectedCompletionIds(previous => {
                          const next = new Set(previous);
                          visibleEligibleCompletionIds.forEach(id => {
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                          });
                          return next;
                        })}
                        aria-label="Select all downloaded venues on this page for completion" />
                    ) : heading}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={isZonalUser ? 16 : 15} className="px-4 py-8 text-center text-slate-400">
                  {downloadStatus === 'downloaded' ? 'No downloaded workorders found.' : 'No approved workorders found.'}
                </td></tr>
              ) : pageRows.map((record, index) => {
                const requirement = scopedRequirements.find(item => item.id === record.requirementId)!;
                const vendor = data.vendors.find(item => item.id === record.vendorId);
                const schedule = getRequirementExamSchedule(record.requirementId, data.requirements, data.installations, data.examDates);
                return (
                  <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/40">
                    {isZonalUser && (
                      <td className="px-3 py-3">
                        {record.workOrderDownloadedAt && !record.tempCctvInstalledAt && (
                          <input type="checkbox" checked={selectedCompletionIds.has(record.id)}
                            onChange={() => toggleCompletionSelected(record.id)}
                            aria-label={`Select venue ${requirement.tcName} for installation completion`} />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggleSelected(record.id)}
                        aria-label={`Select workorder for TC ${requirement.tcCode}`} />
                    </td>
                    <td className="px-3 py-3">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="px-3 py-3">{requirement.clientName}</td>
                    <td className="px-3 py-3">{requirement.examName}</td>
                    <td className="px-3 py-3">{requirement.zone}</td>
                    <td className="px-3 py-3">{requirement.state}</td>
                    <td className="px-3 py-3 font-mono text-xs">{requirement.tcCode}</td>
                    <td className="px-3 py-3">{requirement.tcName}</td>
                    <td className="px-3 py-3">{vendor?.vendorName || '—'}</td>
                    <td className="px-3 py-3">{record.cameraCount}</td>
                    <td className="px-3 py-3">{schedule.length}</td>
                    <td className="px-3 py-3">₹{record.localVendorCost.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">
                      {record.workOrderDownloadedAt ? (
                        <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
                          title={new Date(record.workOrderDownloadedAt).toLocaleString('en-IN')}>
                          Downloaded
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          Not downloaded
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {record.tempCctvInstalledAt
                        ? <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">Installed · {record.tempCctvInstalledAt}</span>
                        : <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Pending installation</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="outline" size="sm" aria-label={`Download CSV workorder for TC ${requirement.tcCode}`}
                        onClick={() => downloadWorkorders([record])}>
                        <Download size={14} />
                      </Button>
                      {isZonalUser && record.workOrderDownloadedAt && !record.tempCctvInstalledAt && (
                        <Button variant="outline" size="sm" aria-label={`Mark ${requirement.tcName} installed`}
                          onClick={() => beginCompletion([record.id])}>
                          <CheckCircle size={14} /> Complete
                        </Button>
                      )}
                      {can('edit_installation') && (
                        <Button variant="ghost" size="sm" aria-label={`View workorder for TC ${requirement.tcCode}`}
                          onClick={() => navigate(`/installation/edit/${record.id}`)}>
                          <Eye size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
        </div>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>
      <Modal open={completionRecordIds.length > 0} title="Confirm temporary CCTV installation"
        onClose={() => setCompletionRecordIds([])} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Mark {completionRecordIds.length} venue{completionRecordIds.length === 1 ? '' : 's'} as installed.
            The selected date will be recorded for each venue.
          </p>
          <Input label="Installation date" type="date" max={new Date().toISOString().slice(0, 10)} value={installationDate}
            onChange={event => setInstallationDate(event.target.value)} required />
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={declarationAccepted}
              onChange={event => setDeclarationAccepted(event.target.checked)} className="mt-1" />
            <span>{TEMP_CCTV_INSTALLATION_DECLARATION}</span>
          </label>
          {completionAlert && <p className="text-sm text-red-600" role="alert">{completionAlert}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCompletionRecordIds([])}>Cancel</Button>
            <Button disabled={!installationDate || !declarationAccepted} onClick={completeInstallations}>
              Confirm installation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
