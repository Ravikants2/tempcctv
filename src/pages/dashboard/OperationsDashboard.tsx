import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { KPICard, Badge } from '../../components/ui/index';
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

  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);
  const completion = getRequirementCompletion(data.requirements, data.installations, filters);
  const allReqs = completion.requirements;
  const pending = completion.pending;
  const completionPct = allReqs.length > 0 ? Math.round((completion.completed.length / allReqs.length) * 100) : 0;

  const withQuotation = filtered.filter(i => i.quotationFileId).length;
  const withoutQuotation = filtered.length - withQuotation;

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <KPICard title="Required Venues" value={allReqs.length} icon={<CheckCircle size={20} />} color="blue" />
        <KPICard title="Completed" value={completion.completed.length} icon={<CheckCircle size={20} />} color="green" />
        <KPICard title="Pending" value={pending.length} icon={<Clock size={20} />} color="orange" onClick={() => setKpiDetail('pending')} />
        <KPICard title="Completion %" value={`${completionPct}%`} icon={<CheckCircle size={20} />} color="teal" />
        <KPICard title="Quotation Available" value={withQuotation} icon={<FileText size={20} />} color="green" />
        <KPICard title="Quotation Missing" value={withoutQuotation} icon={<AlertTriangle size={20} />} color="red" onClick={() => setKpiDetail('attention')} />
      </div>

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
