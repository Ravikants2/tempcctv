import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { KPICard, Badge } from '../../components/ui/index';
import { Select } from '../../components/ui/FormFields';
import { applyDashboardFilters, getInstallationStats, getRequirementCompletion } from '../../utils/calculations';
import { CheckCircle, Clock, FileText, AlertTriangle, Pencil } from 'lucide-react';
import { CostValue } from '../../components/ui/CostValue';
import { TablePagination } from '../../components/ui/TablePagination';

const PAGE_SIZE = 10;

export default function OperationsDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const navigate = useNavigate();
  const [kpiDetail, setKpiDetail] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [attentionPage, setAttentionPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [venuePage, setVenuePage] = useState(1);
  const [venueFilters, setVenueFilters] = useState({
    exam: '',
    zone: '',
    state: '',
    recordStatus: '',
    approvalStatus: '',
    workorderStatus: '',
  });

  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);
  const completion = getRequirementCompletion(data.requirements, data.installations, filters);
  const allReqs = completion.requirements;
  const pending = completion.pending;
  const completionPct = allReqs.length > 0 ? Math.round((completion.completed.length / allReqs.length) * 100) : 0;

  const withQuotation = filtered.filter(i => i.quotationFileId).length;
  const withoutQuotation = filtered.length - withQuotation;
  const approvedFiltered = filtered.filter(i => i.approvalStatus === 'approved');
  const workordersDownloaded = approvedFiltered.filter(i => i.workOrderDownloadedAt).length;
  const workordersPending = approvedFiltered.length - workordersDownloaded;
  const workorderRows = approvedFiltered;

  const clientSummaries = [...new Set(allReqs.map(requirement => requirement.clientName))]
    .sort((left, right) => left.localeCompare(right))
    .map(clientName => {
      const clientRequirements = allReqs.filter(requirement => requirement.clientName === clientName);
      const clientRequirementIds = new Set(clientRequirements.map(requirement => requirement.id));
      const clientInstallations = filtered.filter(installation =>
        clientRequirementIds.has(installation.requirementId)
      );
      const submittedInstallations = clientInstallations.filter(installation =>
        ['pending', 'approved', 'returned'].includes(installation.approvalStatus || 'pending')
      );
      const pendingApproval = clientInstallations.filter(installation =>
        (installation.approvalStatus || 'pending') === 'pending'
      );
      const approved = clientInstallations.filter(installation =>
        installation.approvalStatus === 'approved'
      );
      const downloaded = approved.filter(installation => installation.workOrderDownloadedAt);

      return {
        clientName,
        venues: clientRequirements.length,
        recordsPending: clientRequirements.length - clientInstallations.length,
        sentForApproval: submittedInstallations.length,
        pendingApproval: pendingApproval.length,
        approved: approved.length,
        workordersDownloaded: downloaded.length,
        workordersPending: approved.length - downloaded.length,
      };
    });

  const selectedClientRequirements = selectedClient
    ? allReqs.filter(requirement => requirement.clientName === selectedClient)
    : [];
  const selectedClientExams = [...new Set(selectedClientRequirements.map(requirement => requirement.examName))]
    .sort((left, right) => left.localeCompare(right))
    .map(examName => {
      const examRequirements = selectedClientRequirements.filter(requirement => requirement.examName === examName);
      const examInstallations = filtered.filter(installation =>
        examRequirements.some(requirement => requirement.id === installation.requirementId)
      );
      return {
        examName,
        venues: examRequirements.length,
        sentForApproval: examInstallations.length,
        pendingApproval: examInstallations.filter(installation =>
          (installation.approvalStatus || 'pending') === 'pending'
        ).length,
        approved: examInstallations.filter(installation => installation.approvalStatus === 'approved').length,
        downloaded: examInstallations.filter(installation =>
          installation.approvalStatus === 'approved' && installation.workOrderDownloadedAt
        ).length,
      };
    });
  const selectedClientVenueRows = selectedClientRequirements.map(requirement => {
    const installation = filtered.find(item => item.requirementId === requirement.id);
    const approvalStatus = installation
      ? (installation.approvalStatus || 'pending')
      : 'Not created';
    const recordStatus = installation ? 'Created' : 'Pending';
    const workorderStatus = !installation
      ? 'Not applicable'
      : installation.approvalStatus === 'approved'
        ? installation.workOrderDownloadedAt ? 'Downloaded' : 'Pending'
        : 'Waiting for approval';
    return { requirement, installation, approvalStatus, recordStatus, workorderStatus };
  });
  const filteredClientVenueRows = selectedClientVenueRows.filter(row =>
    (!venueFilters.exam || row.requirement.examName === venueFilters.exam) &&
    (!venueFilters.zone || row.requirement.zone === venueFilters.zone) &&
    (!venueFilters.state || row.requirement.state === venueFilters.state) &&
    (!venueFilters.recordStatus || row.recordStatus === venueFilters.recordStatus) &&
    (!venueFilters.approvalStatus || row.approvalStatus === venueFilters.approvalStatus) &&
    (!venueFilters.workorderStatus || row.workorderStatus === venueFilters.workorderStatus)
  );
  const venuePageCount = Math.max(1, Math.ceil(filteredClientVenueRows.length / PAGE_SIZE));
  const currentVenuePage = Math.min(venuePage, venuePageCount);
  const venuePageRows = filteredClientVenueRows.slice(
    (currentVenuePage - 1) * PAGE_SIZE,
    currentVenuePage * PAGE_SIZE
  );
  const venueFilterOptions = {
    exams: [...new Set(selectedClientVenueRows.map(row => row.requirement.examName))].sort(),
    zones: [...new Set(selectedClientVenueRows.map(row => row.requirement.zone))].sort(),
    states: [...new Set(selectedClientVenueRows.map(row => row.requirement.state))].sort(),
    recordStatuses: [...new Set(selectedClientVenueRows.map(row => row.recordStatus))].sort(),
    approvalStatuses: [...new Set(selectedClientVenueRows.map(row => row.approvalStatus))].sort(),
    workorderStatuses: [...new Set(selectedClientVenueRows.map(row => row.workorderStatus))].sort(),
  };
  const updateVenueFilter = (key: keyof typeof venueFilters, value: string) => {
    setVenueFilters(previous => ({ ...previous, [key]: value }));
    setVenuePage(1);
  };

  const fullVendor = filtered.filter(i => i.installationType === 'Full Vendor');
  const partialVendor = filtered.filter(i => i.installationType === 'Partial Vendor');

  const typeStats = (insts: typeof filtered) => {
    const candidates = insts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
    const cameras = insts.reduce((s, i) => s + i.cameraCount, 0);
    const cost = insts.reduce((s, i) => s + i.localVendorCost, 0);
    return { venues: insts.length, candidates, cameras, cost, perCandidate: candidates > 0 ? cost / candidates : 0 };
  };

  const storageInsts = filtered.filter(i => i.storageProvided);
  const penDrives = storageInsts.filter(i => i.storageType === 'Pen Drive').reduce((s, i) => s + (i.storageQuantity || 0), 0);
  const extHDDs = storageInsts.filter(i => i.storageType === 'External HDD').reduce((s, i) => s + (i.storageQuantity || 0), 0);

  const attentionItems = filtered.filter(i => {
    const { totalCandidates } = getInstallationStats(i, data.examDates);
    return !i.quotationFileId || totalCandidates === 0 || i.cameraCount === 0 ||
      i.localVendorCost === 0 || !i.vendorId || (i.storageProvided && !i.storageType);
  });
  const pendingCurrentPage = Math.min(pendingPage, Math.max(1, Math.ceil(pending.length / PAGE_SIZE)));
  const pendingRows = pending.slice((pendingCurrentPage - 1) * PAGE_SIZE, pendingCurrentPage * PAGE_SIZE);
  const attentionCurrentPage = Math.min(attentionPage, Math.max(1, Math.ceil(attentionItems.length / PAGE_SIZE)));
  const attentionRows = attentionItems.slice((attentionCurrentPage - 1) * PAGE_SIZE, attentionCurrentPage * PAGE_SIZE);

  if (kpiDetail) {
    const items = kpiDetail === 'pending'
      ? pending
      : attentionItems.map(i => data.requirements.find(r => r.id === i.requirementId)!).filter(Boolean);
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const currentPage = Math.min(detailPage, pageCount);
    const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    return (
      <div>
        <GlobalFilters />
        <button onClick={() => setKpiDetail(null)} className="text-blue-600 hover:underline text-sm mb-4 block">← Back to Dashboard</button>
        <h2 className="text-lg font-bold mb-4 capitalize">{kpiDetail} Details</h2>
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              {['Client','Exam','Zone','State','City','TC Code','TC Name','Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pageItems.map(req => (
                <tr key={req.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{req.clientName}</td>
                  <td className="px-3 py-2">{req.examName}</td>
                  <td className="px-3 py-2">{req.zone}</td>
                  <td className="px-3 py-2">{req.state}</td>
                  <td className="px-3 py-2">{req.city}</td>
                  <td className="px-3 py-2 font-mono text-xs">{req.tcCode}</td>
                  <td className="px-3 py-2">{req.tcName}</td>
                  <td className="px-3 py-2">
                    {kpiDetail === 'pending' ? (
                      <button onClick={() => navigate('/installation/new')} className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Pencil size={12} /> Create</button>
                    ) : (
                      <button onClick={() => { const inst = data.installations.find(i => i.requirementId === req.id); if (inst) navigate(`/installation/edit/${inst.id}`); }} className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Pencil size={12} /> Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
          <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={items.length} onPageChange={setDetailPage} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <h1 className="text-xl font-bold text-gray-900 mb-4">Operations Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-4 mb-8">
        <KPICard title="Required Venues" value={allReqs.length} icon={<CheckCircle size={20} />} color="blue" />
        <KPICard title="Completed" value={completion.completed.length} icon={<CheckCircle size={20} />} color="green" />
        <KPICard title="Pending" value={pending.length} icon={<Clock size={20} />} color="orange" onClick={() => setKpiDetail('pending')} />
        <KPICard title="Completion %" value={`${completionPct}%`} icon={<CheckCircle size={20} />} color="teal" />
        <KPICard title="Quotation Available" value={withQuotation} icon={<FileText size={20} />} color="green" />
        <KPICard title="Quotation Missing" value={withoutQuotation} icon={<AlertTriangle size={20} />} color="red" onClick={() => setKpiDetail('attention')} />
        <KPICard title="Workorders Downloaded" value={workordersDownloaded} icon={<FileText size={20} />} color="green" />
        <KPICard title="Workorders Pending" value={workordersPending} icon={<Clock size={20} />} color="orange" />
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-6">
        <div className="px-4 py-3 border-b font-semibold text-gray-800">Client-wise Approval &amp; Workorder Summary</div>
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            {['Client','Venues','Records Pending','Sent for Approval','Pending Approval','Approved','WO Downloaded','WO Pending'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {clientSummaries.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No client records found.</td></tr>
            ) : clientSummaries.map(summary => (
              <tr key={summary.clientName} className="border-t hover:bg-blue-50/40">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => {
                    setSelectedClient(selectedClient === summary.clientName ? null : summary.clientName);
                    setVenuePage(1);
                    setVenueFilters({ exam: '', zone: '', state: '', recordStatus: '', approvalStatus: '', workorderStatus: '' });
                  }}
                    className="font-semibold text-blue-700 hover:underline">
                    {summary.clientName}
                  </button>
                </td>
                <td className="px-3 py-2">{summary.venues}</td>
                <td className="px-3 py-2">{summary.recordsPending}</td>
                <td className="px-3 py-2">{summary.sentForApproval}</td>
                <td className="px-3 py-2">{summary.pendingApproval}</td>
                <td className="px-3 py-2">{summary.approved}</td>
                <td className="px-3 py-2">{summary.workordersDownloaded}</td>
                <td className="px-3 py-2">{summary.workordersPending}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      {selectedClient && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{selectedClient} — Exam &amp; Venue Details</h2>
            <button type="button" onClick={() => {
              setSelectedClient(null);
              setVenuePage(1);
            }}
              className="text-sm text-blue-600 hover:underline">Close details</button>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b font-semibold text-gray-800">Exam-wise Summary</div>
            <SortableTable className="w-full text-sm">
              <thead><tr className="bg-gray-50">
                {['Exam','Venues','Sent for Approval','Pending Approval','Approved','WO Downloaded'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {selectedClientExams.map(exam => (
                  <tr key={exam.examName} className="border-t">
                    <td className="px-3 py-2 font-medium">{exam.examName}</td>
                    <td className="px-3 py-2">{exam.venues}</td>
                    <td className="px-3 py-2">{exam.sentForApproval}</td>
                    <td className="px-3 py-2">{exam.pendingApproval}</td>
                    <td className="px-3 py-2">{exam.approved}</td>
                    <td className="px-3 py-2">{exam.downloaded}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b font-semibold text-gray-800">Venue Details</div>
            <div className="flex flex-wrap items-end gap-3 border-b bg-slate-50 p-4">
              <Select label="Exam" value={venueFilters.exam} onChange={event => updateVenueFilter('exam', event.target.value)}
                options={venueFilterOptions.exams.map(value => ({ value, label: value }))} placeholder="All exams" className="w-44" />
              <Select label="Zone" value={venueFilters.zone} onChange={event => updateVenueFilter('zone', event.target.value)}
                options={venueFilterOptions.zones.map(value => ({ value, label: value }))} placeholder="All zones" className="w-36" />
              <Select label="State" value={venueFilters.state} onChange={event => updateVenueFilter('state', event.target.value)}
                options={venueFilterOptions.states.map(value => ({ value, label: value }))} placeholder="All states" className="w-40" />
              <Select label="Record status" value={venueFilters.recordStatus} onChange={event => updateVenueFilter('recordStatus', event.target.value)}
                options={venueFilterOptions.recordStatuses.map(value => ({ value, label: value }))} placeholder="All record statuses" className="w-44" />
              <Select label="Approval status" value={venueFilters.approvalStatus} onChange={event => updateVenueFilter('approvalStatus', event.target.value)}
                options={venueFilterOptions.approvalStatuses.map(value => ({
                  value,
                  label: value === 'pending' ? 'Pending approval' : value,
                }))} placeholder="All approval statuses" className="w-48" />
              <Select label="WO status" value={venueFilters.workorderStatus} onChange={event => updateVenueFilter('workorderStatus', event.target.value)}
                options={venueFilterOptions.workorderStatuses.map(value => ({ value, label: value }))} placeholder="All WO statuses" className="w-44" />
              <span className="mb-0.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {filteredClientVenueRows.length} venues
              </span>
            </div>
            <div className="overflow-x-auto">
              <SortableTable className="w-full table-fixed text-sm">
                <thead><tr className="bg-gray-50">
                  {[
                    ['Exam', 'w-[14%]'],
                    ['Zone', 'w-[9%]'],
                    ['State', 'w-[11%]'],
                    ['City', 'w-[10%]'],
                    ['TC Code', 'w-[9%]'],
                    ['TC Name', 'w-[19%]'],
                    ['Record Status', 'w-[9%]'],
                    ['Approval Status', 'w-[10%]'],
                    ['WO Status', 'w-[9%]'],
                  ].map(([heading, width]) => (
                    <th key={heading} className={`px-3 py-2 text-left text-xs font-semibold text-gray-600 ${width}`}>{heading}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {venuePageRows.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No venues match these filters.</td></tr>
                  ) : venuePageRows.map(({ requirement, recordStatus, approvalStatus, workorderStatus }) => (
                    <tr key={requirement.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 break-words">{requirement.examName}</td>
                      <td className="px-3 py-2 break-words">{requirement.zone}</td>
                      <td className="px-3 py-2 break-words">{requirement.state}</td>
                      <td className="px-3 py-2 break-words">{requirement.city}</td>
                      <td className="px-3 py-2 break-all font-mono text-xs">{requirement.tcCode}</td>
                      <td className="max-w-0 px-3 py-2 whitespace-normal break-words [overflow-wrap:anywhere]" title={requirement.tcName}>
                        {requirement.tcName}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={recordStatus === 'Created' ? 'success' : 'warning'}>{recordStatus}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={
                          approvalStatus === 'approved' ? 'success'
                            : approvalStatus === 'returned' ? 'error'
                              : approvalStatus === 'pending' ? 'warning'
                                : 'neutral'
                        }>
                          {approvalStatus === 'pending' ? 'Pending approval' : approvalStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={
                          workorderStatus === 'Downloaded' ? 'success'
                            : workorderStatus === 'Pending' ? 'warning'
                              : 'neutral'
                        }>{workorderStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </SortableTable>
            </div>
            <TablePagination
              page={currentVenuePage}
              pageSize={PAGE_SIZE}
              totalItems={filteredClientVenueRows.length}
              onPageChange={setVenuePage}
            />
          </div>
        </div>
      )}

      {workorderRows.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">
            Workorder Download Status ({workorderRows.length})
          </div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['Client','Exam','Zone','City','TC Code','TC Name','Status','Downloaded On'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {workorderRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{req?.clientName || '—'}</td>
                    <td className="px-3 py-2">{req?.examName || '—'}</td>
                    <td className="px-3 py-2">{req?.zone || '—'}</td>
                    <td className="px-3 py-2">{req?.city || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode || '—'}</td>
                    <td className="px-3 py-2">{req?.tcName || '—'}</td>
                    <td className="px-3 py-2">
                      {inst.workOrderDownloadedAt ? (
                        <Badge variant="success">Downloaded</Badge>
                      ) : (
                        <Badge variant="warning">Not downloaded</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {inst.workOrderDownloadedAt
                        ? new Date(inst.workOrderDownloadedAt).toLocaleString('en-IN')
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-6">
        <div className="px-4 py-3 border-b font-semibold text-gray-800">Installation Type Comparison</div>
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            {['Type','Venues','Candidates','Cameras','Total Cost','Per Candidate'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(['Full Vendor', 'Partial Vendor'] as const).map(type => {
              const s = typeStats(type === 'Full Vendor' ? fullVendor : partialVendor);
              return (
                <tr key={type} className="border-t">
                  <td className="px-3 py-2 font-medium">{type}</td>
                  <td className="px-3 py-2">{s.venues}</td>
                  <td className="px-3 py-2">{s.candidates.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{s.cameras}</td>
                  <td className="px-3 py-2"><CostValue amount={s.cost} /></td>
                  <td className="px-3 py-2"><CostValue amount={s.perCandidate} /></td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <KPICard title="Proxy Provided" value={filtered.filter(i => i.proxyProvided).length} color="blue" />
        <KPICard title="Internet Provided" value={filtered.filter(i => i.internetProvided).length} color="green" />
        <KPICard title="Storage Provided" value={storageInsts.length} color="purple" />
        <KPICard title="Pen Drives" value={penDrives} color="orange" />
        <KPICard title="External HDDs" value={extHDDs} color="teal" />
      </div>

      {pending.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Pending Requirements ({pending.length})</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['Client','Exam','Zone','State','City','TC Code','TC Name'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendingRows.map(req => (
                <tr key={req.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{req.clientName}</td>
                  <td className="px-3 py-2">{req.examName}</td>
                  <td className="px-3 py-2">{req.zone}</td>
                  <td className="px-3 py-2">{req.state}</td>
                  <td className="px-3 py-2">{req.city}</td>
                  <td className="px-3 py-2 font-mono text-xs">{req.tcCode}</td>
                  <td className="px-3 py-2">{req.tcName}</td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
          <TablePagination page={pendingCurrentPage} pageSize={PAGE_SIZE} totalItems={pending.length} onPageChange={setPendingPage} />
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-500" /> Attention Required ({attentionItems.length})
          </div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['TC Code','TC Name','Issues','Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {attentionRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                const { totalCandidates } = getInstallationStats(inst, data.examDates);
                const issues = [
                  !inst.quotationFileId && 'Quotation missing',
                  totalCandidates === 0 && 'Zero candidates',
                  inst.cameraCount === 0 && 'Zero cameras',
                  inst.localVendorCost === 0 && 'Zero cost',
                  !inst.vendorId && 'Missing vendor',
                  (inst.storageProvided && !inst.storageType) && 'Storage details missing',
                ].filter(Boolean) as string[];
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">{req?.tcName}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {issues.map(issue => <Badge key={issue} variant="warning">{issue}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => navigate(`/installation/edit/${inst.id}`)} className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                        <Pencil size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
          <TablePagination page={attentionCurrentPage} pageSize={PAGE_SIZE} totalItems={attentionItems.length} onPageChange={setAttentionPage} />
        </div>
      )}
    </div>
  );
}
