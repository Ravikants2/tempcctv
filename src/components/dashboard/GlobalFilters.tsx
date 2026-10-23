import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { Input, Select } from '../ui/FormFields';

export function GlobalFilters() {
  const { data } = useAuth();
  const { filters, setFilters, clearFilters } = useFilters();

  const clients = [...new Set(data.requirements.map(r => r.clientName))].sort();
  const exams = [...new Set(
    data.requirements
      .filter(r => !filters.client || r.clientName === filters.client)
      .map(r => r.examName)
  )].sort();
  const zones = [...new Set(data.requirements.map(r => r.zone))].sort();
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Dashboard filters</h2>
          <p className="mt-0.5 text-xs text-slate-500">Update the reporting period and scope.</p>
        </div>
        <button type="button" onClick={clearFilters} className="text-xs font-medium text-blue-700 hover:text-blue-900">
          Reset
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Start Date"
          type="date"
          value={filters.startDate}
          onChange={e => setFilters({ ...filters, startDate: e.target.value })}
          className="w-36"
        />
        <Input
          label="End Date"
          type="date"
          value={filters.endDate}
          onChange={e => setFilters({ ...filters, endDate: e.target.value })}
          className="w-36"
        />
        <Select
          label="Client"
          value={filters.client}
          onChange={e => setFilters({ ...filters, client: e.target.value, exam: '' })}
          options={clients.map(c => ({ value: c, label: c }))}
          placeholder="All Clients"
          className="w-44"
        />
        <Select
          label="Exam"
          value={filters.exam}
          onChange={e => setFilters({ ...filters, exam: e.target.value })}
          options={exams.map(e => ({ value: e, label: e }))}
          placeholder="All Exams"
          className="w-44"
        />
        <Select
          label="Zone"
          value={filters.zone}
          onChange={e => setFilters({ ...filters, zone: e.target.value })}
          options={zones.map(z => ({ value: z, label: z }))}
          placeholder="All Zones"
          className="w-36"
        />
        <Input
          label="TC Code"
          value={filters.tcCode || ''}
          onChange={e => setFilters({ ...filters, tcCode: e.target.value.replace(/\D/g, '') })}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Numbers only"
          className="w-40"
        />
      </div>
    </div>
  );
}
