import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, MapPin, Store } from 'lucide-react';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { CostValue } from '../../components/ui/CostValue';
import { TablePagination } from '../../components/ui/TablePagination';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { applyDashboardFilters } from '../../utils/calculations';
import { normalizeExamDate } from '../../utils/dates';
import { buildVenueInsights, type InsightDimension, type InsightComparison } from '../../utils/insights';

const PAGE_SIZE = 10;

const dimensionLabels: Record<InsightDimension, string> = {
  city: 'City',
  state: 'State',
  vendor: 'Vendor',
};

function percentage(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function comparisonSpread(rows: InsightComparison[]) {
  const comparable = rows.filter(row => row.candidates > 0);
  if (comparable.length < 2) return null;
  const highest = comparable[0];
  const lowest = comparable[comparable.length - 1];
  if (lowest.costPerCandidate <= 0) return null;
  return {
    highest,
    lowest,
    difference: highest.costPerCandidate - lowest.costPerCandidate,
    differencePercent: ((highest.costPerCandidate - lowest.costPerCandidate) / lowest.costPerCandidate) * 100,
  };
}

export default function InsightsDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [dimension, setDimension] = useState<InsightDimension>('city');
  const [comparisonPage, setComparisonPage] = useState(1);
  const [deviationPage, setDeviationPage] = useState(1);
  const [observationPage, setObservationPage] = useState(1);
  const filteredInstallations = useMemo(() =>
    applyDashboardFilters(data.installations, data.requirements, data.examDates, filters),
  [data.installations, data.requirements, data.examDates, filters]);
  const filteredInstallationIds = useMemo(() => new Set(filteredInstallations.map(installation => installation.id)),
    [filteredInstallations]);
  const filteredExamDates = useMemo(() => data.examDates.filter(date => {
    if (!filteredInstallationIds.has(date.installationRecordId)) return false;
    const examDate = normalizeExamDate(date.examDate) || date.examDate;
    return (!filters.startDate || examDate >= filters.startDate) &&
      (!filters.endDate || examDate <= filters.endDate);
  }), [data.examDates, filteredInstallationIds, filters.startDate, filters.endDate]);
  const filteredObservations = useMemo(() => data.postExamObservations.filter(observation =>
    filteredInstallationIds.has(observation.installationRecordId) &&
    (!filters.startDate || (normalizeExamDate(observation.examDate) || observation.examDate) >= filters.startDate) &&
    (!filters.endDate || (normalizeExamDate(observation.examDate) || observation.examDate) <= filters.endDate)
  ), [data.postExamObservations, filteredInstallationIds, filters.startDate, filters.endDate]);
  const insights = useMemo(() => buildVenueInsights(
    filteredInstallations,
    data.requirements,
    data.vendors,
    filteredExamDates,
    filteredObservations,
    data.observationSeverities || [],
    data.observationTypes || []
  ), [
    filteredInstallations,
    data.requirements,
    data.vendors,
    filteredExamDates,
    filteredObservations,
    data.observationSeverities,
    data.observationTypes,
  ]);
  const comparisonRows = insights.comparisons[dimension];
  const spread = comparisonSpread(comparisonRows);
  const maxCostPerCandidate = Math.max(1, ...comparisonRows.map(row => row.costPerCandidate));
  const comparisonPageCount = Math.max(1, Math.ceil(comparisonRows.length / PAGE_SIZE));
  const currentComparisonPage = Math.min(comparisonPage, comparisonPageCount);
  const visibleComparisons = comparisonRows.slice(
    (currentComparisonPage - 1) * PAGE_SIZE,
    currentComparisonPage * PAGE_SIZE
  );
  const deviationPageCount = Math.max(1, Math.ceil(insights.venueDeviations.length / PAGE_SIZE));
  const currentDeviationPage = Math.min(deviationPage, deviationPageCount);
  const visibleDeviations = insights.venueDeviations.slice(
    (currentDeviationPage - 1) * PAGE_SIZE,
    currentDeviationPage * PAGE_SIZE
  );
  const observationPageCount = Math.max(1, Math.ceil(insights.observations.length / PAGE_SIZE));
  const currentObservationPage = Math.min(observationPage, observationPageCount);
  const visibleObservations = insights.observations.slice(
    (currentObservationPage - 1) * PAGE_SIZE,
    currentObservationPage * PAGE_SIZE
  );
  const summaryCards = [
    { label: 'Venues in scope', value: insights.venueCount, icon: Building2 },
    { label: 'Vendors in scope', value: insights.vendorCount, icon: Store },
    { label: 'Installation records', value: insights.installationCount, icon: MapPin },
    { label: 'Observations', value: insights.observationCount, icon: AlertTriangle },
    { label: 'Total installation cost', value: <CostValue amount={insights.totalCost} /> },
    { label: 'Cost per candidate', value: <CostValue amount={insights.totalCandidates ? insights.candidateCost / insights.totalCandidates : 0} /> },
    { label: 'High severity', value: insights.highSeverityCount, icon: AlertTriangle },
  ];

  return (
    <div>
      <GlobalFilters />
      <div className="mb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Venue and vendor analysis</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Insights</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compare costs across locations and vendors, spot venue-level differences, and prioritize post-exam observations.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
              {Icon && <Icon size={16} className="shrink-0 text-blue-600" aria-hidden="true" />}
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </div>

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="cost-comparison-heading">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="cost-comparison-heading" className="font-semibold text-slate-900">Cost comparison</h2>
          <p className="mt-1 text-xs text-slate-500">
            Weighted cost per candidate and average installation cost for each group in the selected reporting scope.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Compare cost by">
            {(Object.keys(dimensionLabels) as InsightDimension[]).map(option => (
              <button key={option} type="button" aria-pressed={dimension === option}
                onClick={() => { setDimension(option); setComparisonPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  dimension === option ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}>
                By {dimensionLabels[option]}
              </button>
            ))}
          </div>
        </div>
        {spread && (
          <p className="border-b border-slate-100 bg-blue-50 px-4 py-2 text-sm text-blue-950">
            {dimensionLabels[dimension]} cost range: <strong>{spread.highest.name}</strong> is{' '}
            <strong><CostValue amount={spread.difference} /></strong> per candidate ({percentage(spread.differencePercent)}) above{' '}
            <strong>{spread.lowest.name}</strong>.
          </p>
        )}
        {comparisonRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No installation data matches the selected filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{dimensionLabels[dimension]}</th>
                    <th className="px-4 py-3">Venues</th>
                    <th className="px-4 py-3">Records</th>
                    <th className="px-4 py-3">Avg. record cost</th>
                    <th className="px-4 py-3">Cost / candidate</th>
                    <th className="px-4 py-3">Observations</th>
                    <th className="px-4 py-3">High severity</th>
                    <th className="px-4 py-3">Relative cost</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleComparisons.map(row => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-3">{row.venues}</td>
                      <td className="px-4 py-3">{row.installations}</td>
                      <td className="px-4 py-3"><CostValue amount={row.averageInstallationCost} /></td>
                      <td className="px-4 py-3 font-semibold"><CostValue amount={row.costPerCandidate} /></td>
                      <td className="px-4 py-3">{row.observations}</td>
                      <td className="px-4 py-3">
                        {row.highSeverityObservations > 0
                          ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">{row.highSeverityObservations}</span>
                          : '0'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-600"
                              style={{ width: `${Math.max(3, (row.costPerCandidate / maxCostPerCandidate) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">
                            {maxCostPerCandidate > 0 ? `${((row.costPerCandidate / maxCostPerCandidate) * 100).toFixed(0)}%` : '0%'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentComparisonPage} pageSize={PAGE_SIZE}
              totalItems={comparisonRows.length} onPageChange={setComparisonPage} />
          </>
        )}
      </section>

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="venue-deviations-heading">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="venue-deviations-heading" className="font-semibold text-slate-900">Venue differences within the same city</h2>
          <p className="mt-1 text-xs text-slate-500">
            Each venue’s cost per candidate compared with the weighted average of other venues in its city and state. No fixed alert threshold is applied.
          </p>
        </div>
        {insights.venueDeviations.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            At least two venues with candidate counts in a city are needed for a comparison.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Venue</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Vendor(s)</th>
                    <th className="px-4 py-3">Venue cost / candidate</th>
                    <th className="px-4 py-3">Other venues average</th>
                    <th className="px-4 py-3">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDeviations.map(row => (
                    <tr key={`${row.state}-${row.city}-${row.tcCode}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-blue-700">{row.tcCode}</span>
                        <span className="ml-2">{row.tcName}</span>
                      </td>
                      <td className="px-4 py-3">{row.city}, {row.state}</td>
                      <td className="px-4 py-3">{row.vendorNames.join(', ')}</td>
                      <td className="px-4 py-3"><CostValue amount={row.costPerCandidate} /></td>
                      <td className="px-4 py-3"><CostValue amount={row.peerCostPerCandidate} /></td>
                      <td className={`px-4 py-3 font-semibold ${row.difference > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {row.difference > 0 ? '+' : ''}<CostValue amount={row.difference} />
                        <span className="ml-1 text-xs">({percentage(row.differencePercent)})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentDeviationPage} pageSize={PAGE_SIZE}
              totalItems={insights.venueDeviations.length} onPageChange={setDeviationPage} />
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="observation-insights-heading">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="observation-insights-heading" className="font-semibold text-slate-900">Post-exam observations</h2>
          <p className="mt-1 text-xs text-slate-500">
            Highest severity first, then newest. {insights.observationCount} observation{insights.observationCount === 1 ? '' : 's'} in scope.
          </p>
        </div>
        {insights.observations.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No observations match the selected filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Observation type</th>
                    <th className="px-4 py-3">Venue</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleObservations.map(({ observation, tcCode, tcName, city, state, vendorName, severityName, severityColor, observationType }) => (
                    <tr key={observation.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          severityColor === 'red' ? 'bg-red-100 text-red-800'
                            : severityColor === 'amber' ? 'bg-amber-100 text-amber-800'
                              : severityColor === 'green' ? 'bg-green-100 text-green-800'
                                : 'bg-slate-100 text-slate-700'
                        }`}>{severityName}</span>
                      </td>
                      <td className="px-4 py-3">{observationType}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-blue-700">{tcCode}</span><br />{tcName}</td>
                      <td className="px-4 py-3">{city}, {state}</td>
                      <td className="px-4 py-3">{vendorName}</td>
                      <td className="max-w-sm whitespace-pre-wrap px-4 py-3">{observation.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentObservationPage} pageSize={PAGE_SIZE}
              totalItems={insights.observations.length} onPageChange={setObservationPage} />
          </>
        )}
      </section>
    </div>
  );
}
