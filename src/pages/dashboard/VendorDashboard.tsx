import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { KPICard } from '../../components/ui/index';
import { Input, Select } from '../../components/ui/FormFields';
import { applyDashboardFilters, getInstallationStats, safeDiv, getUniqueExamDays } from '../../utils/calculations';
import { Store } from 'lucide-react';
import { CostValue } from '../../components/ui/CostValue';
import { TablePagination } from '../../components/ui/TablePagination';
import { getVendorCode } from '../../utils/vendorCode';
import { normalizeExamDate } from '../../utils/dates';

const PAGE_SIZE = 10;

export default function VendorDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [vendorFilter, setVendorFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [drillVendorId, setDrillVendorId] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);

  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);

  const vendorOptions = data.vendors.map(v => ({ value: v.id, label: v.vendorName }));

  const vendorStats = data.vendors
    .filter(v => !vendorFilter || v.id === vendorFilter)
    .map(vendor => {
      let insts = filtered.filter(i => i.vendorId === vendor.id);
      if (startDate || endDate) {
        insts = insts.filter(i => {
          const dates = data.examDates.filter(d => d.installationRecordId === i.id)
            .map(d => normalizeExamDate(d.examDate) || d.examDate);
          if (startDate && !dates.some(d => d >= startDate)) return false;
          if (endDate && !dates.some(d => d <= endDate)) return false;
          return true;
        });
      }
      const reqs = insts.map(i => data.requirements.find(r => r.id === i.requirementId)!).filter(Boolean);
      const clients = [...new Set(reqs.map(r => r.clientName))].length;
      const exams = [...new Set(reqs.map(r => r.examName))].length;
      const zones = [...new Set(reqs.map(r => r.zone))].length;
      const candidates = insts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
      const cameras = insts.reduce((s, i) => s + i.cameraCount, 0);
      const cost = insts.reduce((s, i) => s + i.localVendorCost, 0);
      const uniqueDays = getUniqueExamDays(insts, data.examDates).length;
      return { vendor, venues: insts.length, clients, exams, zones, candidates, cameras, cost, perCandidate: safeDiv(cost, candidates), uniqueDays, insts };
    })
    .filter(v => v.venues > 0);

  const totalVendors = vendorStats.length;
  const totalVenues = vendorStats.reduce((s, v) => s + v.venues, 0);
  const totalCost = vendorStats.reduce((s, v) => s + v.cost, 0);

  const drillVendor = drillVendorId ? vendorStats.find(v => v.vendor.id === drillVendorId) : null;
  const summaryPageCount = Math.max(1, Math.ceil(vendorStats.length / PAGE_SIZE));
  const currentSummaryPage = Math.min(summaryPage, summaryPageCount);
  const summaryRows = vendorStats.slice((currentSummaryPage - 1) * PAGE_SIZE, currentSummaryPage * PAGE_SIZE);

  if (drillVendor) {
    const detailPageCount = Math.max(1, Math.ceil(drillVendor.insts.length / PAGE_SIZE));
    const currentDetailPage = Math.min(detailPage, detailPageCount);
    const detailRows = drillVendor.insts.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE);
    return (
      <div>
        <GlobalFilters />
        <button onClick={() => setDrillVendorId(null)} className="text-blue-600 hover:underline text-sm mb-4 block">← Back to Vendor Dashboard</button>
        <h2 className="text-lg font-bold mb-4">Vendor: {drillVendor.vendor.vendorName} <span className="font-mono text-sm font-normal text-gray-500">({getVendorCode(drillVendor.vendor)})</span></h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <KPICard title="Venues" value={drillVendor.venues} color="blue" />
          <KPICard title="Candidates" value={drillVendor.candidates.toLocaleString('en-IN')} color="purple" />
          <KPICard title="Total Cost" value={<CostValue amount={drillVendor.cost} />} color="red" />
          <KPICard title="Per Candidate" value={<CostValue amount={drillVendor.perCandidate} />} color="teal" />
        </div>
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              {['Client','Exam','Zone','State','City','TC Code','TC Name','Exam Days','Candidates','Cost'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {detailRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                const { examDays, totalCandidates } = getInstallationStats(inst, data.examDates);
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{req?.clientName}</td>
                    <td className="px-3 py-2">{req?.examName}</td>
                    <td className="px-3 py-2">{req?.zone}</td>
                    <td className="px-3 py-2">{req?.state}</td>
                    <td className="px-3 py-2">{req?.city}</td>
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">{req?.tcName}</td>
                    <td className="px-3 py-2 text-center">{examDays}</td>
                    <td className="px-3 py-2 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right"><CostValue amount={inst.localVendorCost} /></td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
          <TablePagination page={currentDetailPage} pageSize={PAGE_SIZE} totalItems={drillVendor.insts.length} onPageChange={setDetailPage} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <h1 className="text-xl font-bold text-gray-900 mb-4">Vendor Dashboard</h1>

      <div className="flex flex-wrap gap-3 mb-6 bg-white border rounded-xl p-4 shadow-sm">
        <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
        <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
        <Select label="Vendor" value={vendorFilter}         onChange={e => { setVendorFilter(e.target.value); setSummaryPage(1); }}
          options={vendorOptions} placeholder="All Vendors" className="w-48" />
        {(vendorFilter || startDate || endDate) && (
          <button className="self-end text-sm text-blue-600 hover:underline pb-2" onClick={() => { setVendorFilter(''); setStartDate(''); setEndDate(''); }}>Clear</button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <KPICard title="Active Vendors" value={totalVendors} icon={<Store size={20} />} color="blue" />
        <KPICard title="Total Venues" value={totalVenues} color="green" />
        <KPICard title="Total Cost" value={<CostValue amount={totalCost} />} color="red" />
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold text-gray-800">Vendor Summary</div>
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            {['Vendor ID','Vendor','Clients','Exams','Zones','Venues','Exam Days','Candidates','Cameras','Total Cost','Per Candidate'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vendorStats.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No vendor data for selected filters.</td></tr>
            ) : summaryRows.map(v => (
              <tr key={v.vendor.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setDrillVendorId(v.vendor.id)}>
                <td className="px-3 py-2 font-mono text-xs">{getVendorCode(v.vendor)}</td>
                <td className="px-3 py-2 font-medium text-blue-700">{v.vendor.vendorName}</td>
                <td className="px-3 py-2">{v.clients}</td>
                <td className="px-3 py-2">{v.exams}</td>
                <td className="px-3 py-2">{v.zones}</td>
                <td className="px-3 py-2">{v.venues}</td>
                <td className="px-3 py-2">{v.uniqueDays}</td>
                <td className="px-3 py-2">{v.candidates.toLocaleString('en-IN')}</td>
                <td className="px-3 py-2">{v.cameras}</td>
                <td className="px-3 py-2"><CostValue amount={v.cost} /></td>
                <td className="px-3 py-2"><CostValue amount={v.perCandidate} /></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <TablePagination page={currentSummaryPage} pageSize={PAGE_SIZE} totalItems={vendorStats.length} onPageChange={setSummaryPage} />
      </div>
    </div>
  );
}
