import { useState } from 'react';
import { SortableTable } from '../../components/ui/SortableTable';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { KPICard } from '../../components/ui/index';
import { applyDashboardFilters, getDashboardKPIs, getInstallationStats } from '../../utils/calculations';
import { Building2, Calendar, Users, Camera, DollarSign, TrendingUp, Briefcase, BookOpen, Store } from 'lucide-react';
import { CostValue } from '../../components/ui/CostValue';
import { TablePagination } from '../../components/ui/TablePagination';

type DrillLevel = 'top' | 'client' | 'exam' | 'zone' | 'state' | 'city' | 'tc';
const PAGE_SIZE = 10;

interface DrillState {
  level: DrillLevel;
  client?: string;
  exam?: string;
  zone?: string;
  state?: string;
  city?: string;
}

export default function ExecutiveDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [drill, setDrill] = useState<DrillState>({ level: 'top' });
  const [kpiDetail, setKpiDetail] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);

  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);
  const kpis = getDashboardKPIs(filtered, data.requirements, data.vendors, data.examDates);

  // Client comparison
  const clientStats = [...new Set(data.requirements.map(r => r.clientName))].map(client => {
    const reqs = data.requirements.filter(r => r.clientName === client);
    const insts = filtered.filter(i => reqs.some(r => r.id === i.requirementId));
    const exams = [...new Set(reqs.map(r => r.examName))].length;
    const candidates = insts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
    const cost = insts.reduce((s, i) => s + i.localVendorCost, 0);
    return { client, exams, venues: insts.length, candidates, cost, perCandidate: candidates > 0 ? cost / candidates : 0 };
  }).filter(c => c.venues > 0);

  // Exam comparison
  const examStats = [...new Set(data.requirements.map(r => r.examName))].map(exam => {
    const reqs = data.requirements.filter(r => r.examName === exam);
    const insts = filtered.filter(i => reqs.some(r => r.id === i.requirementId));
    const clients = [...new Set(reqs.map(r => r.clientName))].length;
    const candidates = insts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
    const cost = insts.reduce((s, i) => s + i.localVendorCost, 0);
    return { exam, clients, venues: insts.length, candidates, cost, perCandidate: candidates > 0 ? cost / candidates : 0 };
  }).filter(e => e.venues > 0);

  const kpiCards = [
    { key: 'venues', title: 'Unique Venues', value: kpis.venues, icon: <Building2 size={24} />, color: 'blue' },
    { key: 'examDays', title: 'Unique Exam Days', value: kpis.examDays, icon: <Calendar size={24} />, color: 'green' },
    { key: 'candidates', title: 'Candidates', value: kpis.candidates.toLocaleString('en-IN'), icon: <Users size={24} />, color: 'purple' },
    { key: 'cameras', title: 'Cameras', value: kpis.cameras.toLocaleString('en-IN'), icon: <Camera size={24} />, color: 'orange' },
    { key: 'totalCost', title: 'Total Cost', value: <CostValue amount={kpis.totalCost} />, icon: <DollarSign size={24} />, color: 'red' },
    { key: 'perCandidateCost', title: 'Per Candidate Cost', value: <CostValue amount={kpis.perCandidateCost} />, icon: <TrendingUp size={24} />, color: 'teal' },
    { key: 'vendors', title: 'Vendors', value: kpis.vendors, icon: <Store size={24} />, color: 'blue' },
    { key: 'clients', title: 'Clients', value: kpis.clients, icon: <Briefcase size={24} />, color: 'green' },
    { key: 'exams', title: 'Exams', value: kpis.exams, icon: <BookOpen size={24} />, color: 'purple' },
  ];

  if (kpiDetail) {
    const detailInsts = filtered;
    const detailPageCount = Math.max(1, Math.ceil(detailInsts.length / PAGE_SIZE));
    const currentDetailPage = Math.min(detailPage, detailPageCount);
    const detailRows = detailInsts.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE);
    return (
      <div>
        <GlobalFilters />
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setKpiDetail(null)} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</button>
          <h2 className="text-lg font-bold capitalize">{kpiDetail.replace(/([A-Z])/g, ' $1')} Details</h2>
        </div>
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              {['Zone','State','City','TC Code','TC Name','Client','Exam','Exam Days','Candidates','Cost'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {detailRows.map(inst => {
                const req = data.requirements.find(r => r.id === inst.requirementId);
                const { examDays, totalCandidates } = getInstallationStats(inst, data.examDates);
                return (
                  <tr key={inst.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{req?.zone}</td><td className="px-3 py-2">{req?.state}</td>
                    <td className="px-3 py-2">{req?.city}</td><td className="px-3 py-2 font-mono text-xs">{req?.tcCode}</td>
                    <td className="px-3 py-2">{req?.tcName}</td><td className="px-3 py-2">{req?.clientName}</td>
                    <td className="px-3 py-2">{req?.examName}</td><td className="px-3 py-2 text-center">{examDays}</td>
                    <td className="px-3 py-2 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right"><CostValue amount={inst.localVendorCost} /></td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
          <TablePagination page={currentDetailPage} pageSize={PAGE_SIZE} totalItems={detailInsts.length} onPageChange={setDetailPage} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <h1 className="text-xl font-bold text-gray-900 mb-4">Executive Dashboard</h1>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {kpiCards.map(card => (
          <KPICard key={card.key} title={card.title} value={card.value} icon={card.icon}
            color={card.color} onClick={() => setKpiDetail(card.key)} />
        ))}
      </div>

      {/* Client Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Client Comparison</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['Client','Exams','Venues','Candidates','Total Cost','Per Candidate'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {clientStats.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">No data</td></tr>
                : clientStats.map(c => (
                  <tr key={c.client} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setDrill({ level: 'client', client: c.client })}>
                    <td className="px-3 py-2 font-medium text-blue-700">{c.client}</td>
                    <td className="px-3 py-2">{c.exams}</td><td className="px-3 py-2">{c.venues}</td>
                    <td className="px-3 py-2">{c.candidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2"><CostValue amount={c.cost} /></td>
                    <td className="px-3 py-2"><CostValue amount={c.perCandidate} /></td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
        </div>

        {/* Exam Comparison */}
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b font-semibold text-gray-800">Exam Comparison</div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['Exam','Clients','Venues','Candidates','Total Cost','Per Candidate'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {examStats.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">No data</td></tr>
                : examStats.map(e => (
                  <tr key={e.exam} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{e.exam}</td>
                    <td className="px-3 py-2">{e.clients}</td><td className="px-3 py-2">{e.venues}</td>
                    <td className="px-3 py-2">{e.candidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2"><CostValue amount={e.cost} /></td>
                    <td className="px-3 py-2"><CostValue amount={e.perCandidate} /></td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
        </div>
      </div>

      {/* Client Drill-down */}
      {drill.level !== 'top' && (
        <div className="bg-white border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setDrill({ level: 'top' })} className="text-blue-600 hover:underline text-sm">← Back</button>
            <span className="text-sm text-gray-500">Drill-down: {drill.client}</span>
          </div>
          <DrillDownTable data={data} filtered={filtered} drill={drill} setDrill={setDrill} />
        </div>
      )}
    </div>
  );
}

function DrillDownTable({ data, filtered, drill, setDrill }: {
  data: ReturnType<typeof useAuth>['data'];
  filtered: ReturnType<typeof useAuth>['data']['installations'];
  drill: DrillState;
  setDrill: (d: DrillState) => void;
}) {
  const getRows = () => {
    const reqs = data.requirements.filter(r => {
      if (drill.client && r.clientName !== drill.client) return false;
      if (drill.exam && r.examName !== drill.exam) return false;
      if (drill.zone && r.zone !== drill.zone) return false;
      if (drill.state && r.state !== drill.state) return false;
      if (drill.city && r.city !== drill.city) return false;
      return true;
    });
    const insts = filtered.filter(i => reqs.some(r => r.id === i.requirementId));

    if (drill.level === 'client') {
      const exams = [...new Set(reqs.map(r => r.examName))];
      return exams.map(exam => {
        const eInsts = insts.filter(i => data.requirements.find(r => r.id === i.requirementId)?.examName === exam);
        const candidates = eInsts.reduce((s, i) => s + data.examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0), 0);
        const cost = eInsts.reduce((s, i) => s + i.localVendorCost, 0);
        return { label: exam, venues: eInsts.length, candidates, cost, onClick: () => setDrill({ ...drill, level: 'exam', exam }) };
      });
    }
    return [];
  };

  const rows = getRows();
  return (
    <SortableTable className="w-full text-sm">
      <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Name</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Venues</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Candidates</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Cost</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t hover:bg-gray-50 cursor-pointer" onClick={r.onClick}>
            <td className="px-3 py-2 text-blue-700 font-medium">{r.label}</td>
            <td className="px-3 py-2">{r.venues}</td>
            <td className="px-3 py-2">{r.candidates.toLocaleString('en-IN')}</td>
            <td className="px-3 py-2"><CostValue amount={r.cost} /></td>
          </tr>
        ))}
      </tbody>
    </SortableTable>
  );
}
