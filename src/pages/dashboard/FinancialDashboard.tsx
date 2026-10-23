import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { KPICard } from '../../components/ui/index';
import { applyDashboardFilters, getDashboardKPIs, getInstallationStats, safeDiv } from '../../utils/calculations';
import { DollarSign, Building2, Camera, Users, TrendingUp } from 'lucide-react';
import { CostValue } from '../../components/ui/CostValue';
import { TablePagination } from '../../components/ui/TablePagination';

const PAGE_SIZE = 10;
const TOP_LIST_PAGE_SIZE = 5;

export default function FinancialDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [kpiDetail, setKpiDetail] = useState<string | null>(null);
  const [drillZone, setDrillZone] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [variancePage, setVariancePage] = useState(1);
  const [zonePage, setZonePage] = useState(1);
  const [zoneSummaryPage, setZoneSummaryPage] = useState(1);
  const [topCostPage, setTopCostPage] = useState(1);
  const [topCandidatePage, setTopCandidatePage] = useState(1);

  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);
  const kpis = getDashboardKPIs(filtered, data.requirements, data.vendors, data.examDates);

  // Top 10 highest cost venues
  const top10Cost = [...filtered]
    .map(inst => {
      const req = data.requirements.find(r => r.id === inst.requirementId);
      const { totalCandidates } = getInstallationStats(inst, data.examDates);
      return { inst, req, totalCandidates };
    })
    .sort((a, b) => b.inst.localVendorCost - a.inst.localVendorCost)
    .slice(0, 10);

  // Top 10 highest per-candidate cost
  const top10PerCandidate = [...filtered]
    .map(inst => {
      const req = data.requirements.find(r => r.id === inst.requirementId);
      const { totalCandidates } = getInstallationStats(inst, data.examDates);
      const perCandidate = safeDiv(inst.localVendorCost, totalCandidates);
      return { inst, req, totalCandidates, perCandidate };
    })
    .filter(r => r.totalCandidates > 0)
    .sort((a, b) => b.perCandidate - a.perCandidate)
    .slice(0, 10);

  // Min cost variance
  const variance = filtered
    .filter(i => i.minimumCost !== undefined)
    .map(inst => {
      const req = data.requirements.find(r => r.id === inst.requirementId);
      return { inst, req, variance: inst.localVendorCost - (inst.minimumCost || 0) };
    });

  // Zone stats
  const zones = [...new Set(data.requirements.map(r => r.zone))];
  const zoneStats = zones.map(zone => {
    const reqs = data.requirements.filter(r => r.zone === zone);
    const insts = filtered.filter(i => reqs.some(r => r.id === i.requirementId));
    const candidates = insts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
    const cost = insts.reduce((s, i) => s + i.localVendorCost, 0);
    const cities = [...new Set(reqs.filter(r => insts.some(i => i.requirementId === r.id)).map(r => r.city))].length;
    return { zone, venues: insts.length, candidates, cost, perCandidate: safeDiv(cost, candidates), cities };
  }).filter(z => z.venues > 0);
  const zoneInsts = drillZone
    ? filtered.filter(i => data.requirements.find(r => r.id === i.requirementId)?.zone === drillZone)
    : [];
  const variancePageCount = Math.max(1, Math.ceil(variance.length / PAGE_SIZE));
  const currentVariancePage = Math.min(variancePage, variancePageCount);
  const varianceRows = variance.slice((currentVariancePage - 1) * PAGE_SIZE, currentVariancePage * PAGE_SIZE);
  const zonePageCount = Math.max(1, Math.ceil(zoneInsts.length / PAGE_SIZE));
  const currentZonePage = Math.min(zonePage, zonePageCount);
  const zoneRows = zoneInsts.slice((currentZonePage - 1) * PAGE_SIZE, currentZonePage * PAGE_SIZE);
  const currentZoneSummaryPage = Math.min(zoneSummaryPage, Math.max(1, Math.ceil(zoneStats.length / PAGE_SIZE)));
  const zoneSummaryRows = zoneStats.slice(
    (currentZoneSummaryPage - 1) * PAGE_SIZE,
    currentZoneSummaryPage * PAGE_SIZE
  );
  const currentTopCostPage = Math.min(topCostPage, Math.max(1, Math.ceil(top10Cost.length / TOP_LIST_PAGE_SIZE)));
  const topCostRows = top10Cost.slice(
    (currentTopCostPage - 1) * TOP_LIST_PAGE_SIZE,
    currentTopCostPage * TOP_LIST_PAGE_SIZE
  );
  const currentTopCandidatePage = Math.min(topCandidatePage, Math.max(1, Math.ceil(top10PerCandidate.length / TOP_LIST_PAGE_SIZE)));
  const topCandidateRows = top10PerCandidate.slice(
    (currentTopCandidatePage - 1) * TOP_LIST_PAGE_SIZE,
    currentTopCandidatePage * TOP_LIST_PAGE_SIZE
  );

  if (kpiDetail) {
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(detailPage, pageCount);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    return (
      <div>
        <GlobalFilters />
        <button onClick={() => setKpiDetail(null)} className="text-blue-600 hover:underline text-sm mb-4 block">← Back to Dashboard</button>
        <h2 className="text-lg font-bold mb-4 capitalize">{kpiDetail.replace(/([A-Z])/g, ' $1')} Details</h2>
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              {['Zone','TC Code','TC Name','Candidates','Cost','Per Candidate'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pageRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                const { totalCandidates } = getInstallationStats(inst, data.examDates);
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{req?.zone}</td>
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">
                      {req?.tcName}
                      {req && <span className="ml-1 text-xs font-normal text-slate-500">({req.state}, {req.city})</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right"><CostValue amount={inst.localVendorCost} /></td>
                    <td className="px-3 py-2 text-right"><CostValue amount={safeDiv(inst.localVendorCost, totalCandidates)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
          <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setDetailPage} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <h1 className="text-xl font-bold text-gray-900 mb-4">Financial Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { key: 'totalCost', title: 'Total Cost', value: <CostValue amount={kpis.totalCost} />, icon: <DollarSign size={20} />, color: 'red' },
          { key: 'costPerVenue', title: 'Cost per Venue', value: <CostValue amount={kpis.costPerVenue} />, icon: <Building2 size={20} />, color: 'blue' },
          { key: 'costPerCamera', title: 'Cost per Camera', value: <CostValue amount={kpis.costPerCamera} />, icon: <Camera size={20} />, color: 'orange' },
          { key: 'candidatesPerCamera', title: 'Candidates/Camera', value: kpis.candidatesPerCamera.toFixed(1), icon: <Users size={20} />, color: 'purple' },
          { key: 'perCandidateCost', title: 'Per Candidate Cost', value: <CostValue amount={kpis.perCandidateCost} />, icon: <TrendingUp size={20} />, color: 'teal' },
          { key: 'venues', title: 'Venues', value: kpis.venues, icon: <Building2 size={20} />, color: 'green' },
        ].map(card => (
          <KPICard key={card.key} title={card.title} value={card.value} icon={card.icon} color={card.color} onClick={() => setKpiDetail(card.key)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top 10 Cost */}
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Top 10 Highest Cost Venues</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">TC Code</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">TC Name</th><th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Cost</th></tr></thead>
            <tbody>
              {top10Cost.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">No data</td></tr>
                : topCostRows.map(({ inst, req }) => (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">
                      {req?.tcName}
                      {req && <span className="ml-1 text-xs font-normal text-slate-500">({req.state}, {req.city})</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium"><CostValue amount={inst.localVendorCost} /></td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
          <TablePagination
            page={currentTopCostPage}
            pageSize={TOP_LIST_PAGE_SIZE}
            totalItems={top10Cost.length}
            onPageChange={setTopCostPage}
          />
        </div>

        {/* Top 10 Per Candidate */}
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Top 10 Highest Per Candidate Cost</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">TC Code</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">TC Name</th><th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Per Candidate</th></tr></thead>
            <tbody>
              {top10PerCandidate.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">No data</td></tr>
                : topCandidateRows.map(({ inst, req, perCandidate }) => (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">{req?.tcName}</td>
                    <td className="px-3 py-2 text-right font-medium"><CostValue amount={perCandidate} /></td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
          <TablePagination
            page={currentTopCandidatePage}
            pageSize={TOP_LIST_PAGE_SIZE}
            totalItems={top10PerCandidate.length}
            onPageChange={setTopCandidatePage}
          />
        </div>
      </div>

      {/* Min Cost Variance */}
      {variance.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Minimum Cost vs Actual Cost Variance</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['TC Code','TC Name','Actual Cost','Minimum Cost','Variance'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {varianceRows.map(({ inst, req, variance: v }) => (
                <tr key={inst.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                  <td className="px-3 py-2">{req?.tcName}</td>
                  <td className="px-3 py-2 text-right"><CostValue amount={inst.localVendorCost} /></td>
                  <td className="px-3 py-2 text-right"><CostValue amount={inst.minimumCost || 0} /></td>
                  <td className={`px-3 py-2 text-right font-medium ${v > 0 ? 'text-red-600' : 'text-green-600'}`}><CostValue amount={v} /></td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
          <TablePagination
            page={currentVariancePage}
            pageSize={PAGE_SIZE}
            totalItems={variance.length}
            onPageChange={setVariancePage}
          />
        </div>
      )}

      {/* Zone-wise Costing */}
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold text-gray-800">Zone-wise Costing</div>
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            {['Zone','Venues','Cities','Candidates','Total Cost','Per Candidate'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {zoneStats.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">No data</td></tr>
              : zoneSummaryRows.map(z => (
                <tr key={z.zone} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setDrillZone(z.zone)}>
                  <td className="px-3 py-2 font-medium text-blue-700">{z.zone}</td>
                  <td className="px-3 py-2">{z.venues}</td>
                  <td className="px-3 py-2">{z.cities}</td>
                  <td className="px-3 py-2">{z.candidates.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2"><CostValue amount={z.cost} /></td>
                  <td className="px-3 py-2"><CostValue amount={z.perCandidate} /></td>
                </tr>
              ))}
          </tbody>
        </SortableTable>
        <TablePagination
          page={currentZoneSummaryPage}
          pageSize={PAGE_SIZE}
          totalItems={zoneStats.length}
          onPageChange={setZoneSummaryPage}
        />
      </div>

      {drillZone && (
        <div className="mt-4 bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <button onClick={() => setDrillZone(null)} className="text-blue-600 hover:underline text-sm">← Back</button>
            <span className="font-semibold">Zone: {drillZone} — Venue Details</span>
          </div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['State','City','TC Code','TC Name','Candidates','Cost','Per Candidate'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {zoneRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                const { totalCandidates } = getInstallationStats(inst, data.examDates);
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{req?.state}</td><td className="px-3 py-2">{req?.city}</td>
                    <td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td><td className="px-3 py-2">{req?.tcName}</td>
                    <td className="px-3 py-2 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right"><CostValue amount={inst.localVendorCost} /></td>
                    <td className="px-3 py-2 text-right"><CostValue amount={safeDiv(inst.localVendorCost, totalCandidates)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
          <TablePagination
            page={currentZonePage}
            pageSize={PAGE_SIZE}
            totalItems={zoneInsts.length}
            onPageChange={setZonePage}
          />
        </div>
      )}
    </div>
  );
}
