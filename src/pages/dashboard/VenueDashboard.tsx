import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { Button } from '../../components/ui/Button';
import { SortableTable } from '../../components/ui/SortableTable';
import type { TableSort } from '../../components/ui/SortableTable';
import { CostValue } from '../../components/ui/CostValue';
import { applyDashboardFilters, getPhysicalVenueKey, safeDiv } from '../../utils/calculations';
import { TablePagination } from '../../components/ui/TablePagination';
import { ArrowLeft, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { formatExamDate, normalizeExamDate } from '../../utils/dates';
import { getVendorCode } from '../../utils/vendorCode';

const PAGE_SIZE = 10;
type VenueMetric = 'days' | 'candidates' | 'cameras' | 'cost' | 'perCandidate' | 'vendors';

interface VenueSummary {
  key: string;
  zone: string;
  state: string;
  tcCode: string;
  tcName: string;
  installations: ReturnType<typeof applyDashboardFilters>;
  days: number;
  candidates: number;
  cameras: number;
  cost: number;
  perCandidate: number;
  vendors: string[];
}

export default function VenueDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [selected, setSelected] = useState<{ key: string; metric: VenueMetric } | null>(null);
  const [page, setPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [venueSort, setVenueSort] = useState<TableSort>(null);
  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);

  const groups = new Map<string, VenueSummary>();
  filtered.forEach(installation => {
    const requirement = data.requirements.find(row => row.id === installation.requirementId);
    if (!requirement) return;
    const key = getPhysicalVenueKey(requirement);
    let venue = groups.get(key);
    if (!venue) {
      venue = {
        key,
        zone: requirement.zone,
        state: requirement.state,
        tcCode: requirement.tcCode,
        tcName: requirement.tcName,
        installations: [],
        days: 0,
        candidates: 0,
        cameras: 0,
        cost: 0,
        perCandidate: 0,
        vendors: [],
      };
      groups.set(key, venue);
    }
    venue.installations.push(installation);
  });
  const allVenues = Array.from(groups.values()).map(venue => {
    const installationIds = new Set(venue.installations.map(row => row.id));
    const schedule = data.examDates.filter(row => installationIds.has(row.installationRecordId));
    const candidates = schedule.reduce((total, row) => total + row.scheduledCandidates, 0);
    const cost = venue.installations.reduce((total, row) => total + row.localVendorCost, 0);
    const vendorIds = [...new Set(venue.installations.map(row => row.vendorId))];
    return {
      ...venue,
      days: new Set(schedule.map(row => normalizeExamDate(row.examDate) || row.examDate)).size,
      candidates,
      cameras: venue.installations.reduce((total, row) => total + row.cameraCount, 0),
      cost,
      perCandidate: safeDiv(cost, candidates),
      vendors: vendorIds,
    };
  }).sort((left, right) => left.zone.localeCompare(right.zone) || left.state.localeCompare(right.state) || left.tcCode.localeCompare(right.tcCode));
  const dayOptions = [...new Set(allVenues.map(venue => venue.days))].sort((left, right) => left - right);
  const venues = selectedDays.length
    ? allVenues.filter(venue => selectedDays.includes(venue.days))
    : allVenues;
  const sortedVenues = venueSort
    ? [...venues].sort((left, right) => {
      const leftValues = [left.zone, left.state, left.tcCode, left.tcName, left.days, left.candidates, left.cameras, left.cost, left.perCandidate, left.vendors.length];
      const rightValues = [right.zone, right.state, right.tcCode, right.tcName, right.days, right.candidates, right.cameras, right.cost, right.perCandidate, right.vendors.length];
      const leftValue = leftValues[venueSort.column];
      const rightValue = rightValues[venueSort.column];
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return venueSort.direction === 'asc' ? result : -result;
    })
    : venues;
  const totalCandidates = venues.reduce((total, venue) => total + venue.candidates, 0);
  const totalCost = venues.reduce((total, venue) => total + venue.cost, 0);
  const totalCameras = venues.reduce((total, venue) => total + venue.cameras, 0);
  const totalVendors = new Set(venues.flatMap(venue => venue.vendors)).size;
  const totalDays = new Set(venues.flatMap(venue => venue.installations.flatMap(installation =>
    data.examDates.filter(row => row.installationRecordId === installation.id)
      .map(row => normalizeExamDate(row.examDate) || row.examDate)
  ))).size;
  const zoneSummaries = Array.from(venues.reduce((zones, venue) => {
    const zone = zones.get(venue.zone) || { zone: venue.zone, venues: 0, candidates: 0, cameras: 0, cost: 0, vendors: new Set<string>() };
    zone.venues++;
    zone.candidates += venue.candidates;
    zone.cameras += venue.cameras;
    zone.cost += venue.cost;
    venue.vendors.forEach(vendorId => zone.vendors.add(vendorId));
    zones.set(venue.zone, zone);
    return zones;
  }, new Map<string, { zone: string; venues: number; candidates: number; cameras: number; cost: number; vendors: Set<string> }>()).values())
    .sort((left, right) => right.cost - left.cost);
  const topCostVenues = [...venues].sort((left, right) => right.cost - left.cost).slice(0, 10);
  const topPerCandidateVenues = [...venues].filter(venue => venue.candidates > 0)
    .sort((left, right) => right.perCandidate - left.perCandidate).slice(0, 10);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(venues.length / PAGE_SIZE)));
  const pageRows = sortedVenues.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedVenue = selected ? venues.find(venue => venue.key === selected.key) : undefined;
  const detailPageCount = selectedVenue ? Math.max(1, Math.ceil(selectedVenue.installations.length / PAGE_SIZE)) : 1;
  const currentDetailPage = Math.min(detailPage, detailPageCount);
  const detailInstallations = selectedVenue
    ? selectedVenue.installations.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE)
    : [];

  const metricButton = (venue: VenueSummary, metric: VenueMetric, content: ReactNode, title?: string) => (
    <button type="button" className="font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
      onClick={() => { setSelected({ key: venue.key, metric }); setDetailPage(1); }}
      title={title}
      aria-label={`Show ${metric} details for ${venue.tcCode}`}>
      {content}
    </button>
  );

  if (selectedVenue && selected) {
    const label: Record<VenueMetric, string> = {
      days: 'Temporary CCTV days',
      candidates: 'Scheduled candidates',
      cost: 'Cost incurred',
      perCandidate: 'Cost per candidate',
      vendors: 'Vendors assigned',
      cameras: 'Camera details',
    };
    const vendorDetails = selected.metric === 'vendors'
      ? selectedVenue.vendors.map(vendorId => {
        const vendor = data.vendors.find(row => row.id === vendorId);
        const installations = selectedVenue.installations.filter(row => row.vendorId === vendorId);
        return {
          vendorId: vendor ? getVendorCode(vendor) : vendorId,
          name: vendor?.vendorName || 'Unknown vendor',
          installations: installations.length,
          cameras: installations.reduce((total, row) => total + row.cameraCount, 0),
          cost: installations.reduce((total, row) => total + row.localVendorCost, 0),
          candidates: installations.reduce((total, installation) =>
            total + data.examDates.filter(row => row.installationRecordId === installation.id)
              .reduce((sum, row) => sum + row.scheduledCandidates, 0), 0),
        };
      })
      : [];

    return (
      <div>
        <GlobalFilters />
        <Button variant="primary" size="sm" className="mb-4 shadow-md" onClick={() => setSelected(null)}><ArrowLeft size={14} /> Back to Venue Dashboard</Button>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">{selectedVenue.tcName} <span className="font-mono text-base text-gray-500">({selectedVenue.tcCode})</span></h1>
          <p className="text-sm text-gray-500">{selectedVenue.zone} · {selectedVenue.state} · {label[selected.metric]}</p>
        </div>
        {selected.metric === 'vendors' ? (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <SortableTable className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
                {['Vendor ID', 'Vendor Name', 'Installations', 'Cameras', 'Candidates', 'Cost Incurred'].map(heading => <th key={heading} className="px-4 py-3">{heading}</th>)}
              </tr></thead>
              <tbody>{vendorDetails.map(vendor => (
                <tr key={vendor.vendorId} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{vendor.vendorId}</td>
                  <td className="px-4 py-3">{vendor.name}</td>
                  <td className="px-4 py-3">{vendor.installations}</td>
                  <td className="px-4 py-3">{vendor.cameras}</td>
                  <td className="px-4 py-3">{vendor.candidates.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><CostValue amount={vendor.cost} /></td>
                </tr>
              ))}</tbody>
            </SortableTable>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <SortableTable className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
                {['Client', 'Exam', 'Vendor ID', 'Vendor', 'Exam Dates', 'CCTV Days', 'Candidates', 'Camera Count', 'Cost Incurred', 'Per Candidate'].map(heading => <th key={heading} className="px-3 py-3">{heading}</th>)}
              </tr></thead>
              <tbody>{detailInstallations.map(installation => {
                const requirement = data.requirements.find(row => row.id === installation.requirementId);
                const vendor = data.vendors.find(row => row.id === installation.vendorId);
                const dates = data.examDates.filter(row => row.installationRecordId === installation.id);
                const candidates = dates.reduce((total, row) => total + row.scheduledCandidates, 0);
                return (
                  <tr key={installation.id} className="border-t">
                    <td className="px-3 py-3">{requirement?.clientName}</td>
                    <td className="px-3 py-3">{requirement?.examName}</td>
                    <td className="px-3 py-3 font-mono text-xs">{vendor ? getVendorCode(vendor) : installation.vendorId}</td>
                    <td className="px-3 py-3">{vendor?.vendorName || 'Unknown vendor'}</td>
                    <td className="px-3 py-3 text-xs">{[...new Set(dates.map(row => row.examDate))]
                      .sort((left, right) => (normalizeExamDate(left) || left).localeCompare(normalizeExamDate(right) || right))
                      .map(formatExamDate).join(', ')}</td>
                    <td className="px-3 py-3">{new Set(dates.map(row => formatExamDate(row.examDate))).size}</td>
                    <td className="px-3 py-3">{candidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">{installation.cameraCount}</td>
                    <td className="px-3 py-3"><CostValue amount={installation.localVendorCost} /></td>
                    <td className="px-3 py-3"><CostValue amount={safeDiv(installation.localVendorCost, candidates)} /></td>
                  </tr>
                );
              })}</tbody>
            </SortableTable>
            <TablePagination page={currentDetailPage} pageSize={PAGE_SIZE} totalItems={selectedVenue.installations.length} onPageChange={setDetailPage} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Venue performance</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Venue Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Select a metric to inspect the venue’s underlying schedules and costs.</p>
        </div>
        {selected && <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close details <ChevronUp size={14} /></Button>}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Venues', value: venues.length },
          { label: 'Temporary CCTV Days', value: totalDays },
          { label: 'Scheduled Candidates', value: totalCandidates.toLocaleString('en-IN') },
          { label: 'Cameras Installed', value: totalCameras.toLocaleString('en-IN') },
          { label: 'Total Cost', value: <CostValue amount={totalCost} /> },
          { label: 'Active Vendors', value: totalVendors },
        ].map(metric => (
          <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{metric.value}</p>
          </div>
        ))}
      </div>
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Venue filters">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-800">Temporary CCTV days</h2>
            <span className="text-xs text-slate-500">Select one or more day counts</span>
          </div>
          {selectedDays.length > 0 && (
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
              onClick={() => { setSelectedDays([]); setPage(1); }}>
              <X size={13} /> Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {dayOptions.map(days => (
            <label key={days} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              selectedDays.includes(days) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}>
              <input type="checkbox" checked={selectedDays.includes(days)}
                onChange={event => {
                  setSelectedDays(previous => event.target.checked
                    ? [...previous, days].sort((left, right) => left - right)
                    : previous.filter(value => value !== days));
                  setPage(1);
                }}
                className="accent-blue-700" />
              {days} {days === 1 ? 'day' : 'days'}
            </label>
          ))}
          {dayOptions.length === 0 && <p className="text-sm text-slate-500">No CCTV day data is available for the selected dashboard filters.</p>}
        </div>
        {selectedDays.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">{venues.length} venues match the selected day counts.</p>
        )}
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <SortableTable className="w-full text-sm" sort={venueSort} onSortChange={sort => { setVenueSort(sort); setPage(1); }}>
          <thead><tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
            {['Zone', 'State', 'TC Code', 'TC Name', 'Temporary CCTV Days', 'Scheduled Candidates', 'Camera Count', 'Cost Incurred', 'Cost per Candidate', 'Vendors'].map(heading => (
              <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>
            ))}
          </tr></thead>
          <tbody>
            {pageRows.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No venue data for the selected filters.</td></tr>
              : pageRows.map(venue => (
                <tr key={venue.key} className="border-t hover:bg-sky-50/50">
                  {(() => {
                    const schedule = venue.installations.flatMap(installation =>
                      data.examDates.filter(row => row.installationRecordId === installation.id)
                    );
                    const dateCandidates = new Map<string, number>();
                    schedule.forEach(row => {
                      const date = formatExamDate(row.examDate);
                      dateCandidates.set(date, (dateCandidates.get(date) || 0) + row.scheduledCandidates);
                    });
                    const dateDetails = Array.from(dateCandidates.entries()).sort((left, right) =>
                      (normalizeExamDate(left[0]) || left[0]).localeCompare(normalizeExamDate(right[0]) || right[0])
                    );
                    const vendorDetails = venue.vendors.map(vendorId => {
                      const vendor = data.vendors.find(row => row.id === vendorId);
                      return vendor ? `${getVendorCode(vendor)} — ${vendor.vendorName}` : vendorId;
                    });
                    const cameraDetails = venue.installations.map(installation => {
                      const vendor = data.vendors.find(row => row.id === installation.vendorId);
                      return `${vendor?.vendorName || 'Unknown vendor'}: ${installation.cameraCount} cameras`;
                    });
                    return <>
                  <td className="px-3 py-3">{venue.zone}</td>
                  <td className="px-3 py-3">{venue.state}</td>
                  <td className="px-3 py-3 font-mono text-xs">{venue.tcCode}</td>
                  <td className="px-3 py-3 font-medium">{venue.tcName}</td>
                  <td className="px-3 py-3">{metricButton(venue, 'days', venue.days, dateDetails.map(([date]) => date).join(', ') || 'No exam dates recorded')} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'candidates', venue.candidates.toLocaleString('en-IN'), dateDetails.map(([date, count]) => `${date}: ${count.toLocaleString('en-IN')} candidates`).join('\n') || 'No candidates scheduled')} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'cameras', venue.cameras.toLocaleString('en-IN'), cameraDetails.join('\n') || 'No camera details')} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'cost', <CostValue amount={venue.cost} />)}</td>
                  <td className="px-3 py-3">{metricButton(venue, 'perCandidate', <CostValue amount={venue.perCandidate} />)}</td>
                  <td className="px-3 py-3">{metricButton(venue, 'vendors', venue.vendors.length, vendorDetails.join('\n') || 'No vendors assigned')} <ChevronDown size={12} className="inline text-blue-500" /></td>
                    </>;
                  })()}
                </tr>
              ))}
          </tbody>
        </SortableTable>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={venues.length} onPageChange={setPage} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-slate-900">Top 10 venues by total cost</h2>
            <p className="mt-1 text-xs text-slate-500">Highest cumulative vendor cost in the selected date and venue filters.</p>
          </div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
              {['Rank', 'Zone', 'TC Code', 'Venue', 'Cost', 'Candidates'].map(heading => <th key={heading} className="px-3 py-2">{heading}</th>)}
            </tr></thead>
            <tbody>{topCostVenues.map((venue, index) => (
              <tr key={venue.key} className="border-t">
                <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{venue.zone}</td>
                <td className="px-3 py-2 font-mono text-xs">{venue.tcCode}</td>
                <td className="px-3 py-2">{metricButton(venue, 'cost', venue.tcName)}</td>
                <td className="px-3 py-2"><CostValue amount={venue.cost} /></td>
                <td className="px-3 py-2">{venue.candidates.toLocaleString('en-IN')}</td>
              </tr>
            ))}</tbody>
          </SortableTable>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-slate-900">Top 10 venues by cost per candidate</h2>
            <p className="mt-1 text-xs text-slate-500">Excludes venues with no scheduled candidates.</p>
          </div>
          <SortableTable className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
              {['Rank', 'Zone', 'TC Code', 'Venue', 'Per Candidate', 'Total Cost'].map(heading => <th key={heading} className="px-3 py-2">{heading}</th>)}
            </tr></thead>
            <tbody>{topPerCandidateVenues.map((venue, index) => (
              <tr key={venue.key} className="border-t">
                <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{venue.zone}</td>
                <td className="px-3 py-2 font-mono text-xs">{venue.tcCode}</td>
                <td className="px-3 py-2">{metricButton(venue, 'perCandidate', venue.tcName)}</td>
                <td className="px-3 py-2"><CostValue amount={venue.perCandidate} /></td>
                <td className="px-3 py-2"><CostValue amount={venue.cost} /></td>
              </tr>
            ))}</tbody>
          </SortableTable>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">Zone performance analysis</h2>
          <p className="mt-1 text-xs text-slate-500">Compare candidate volume, camera coverage, vendor count, and spending by zone.</p>
        </div>
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
            {['Zone', 'Venues', 'Candidates', 'Cameras', 'Vendors', 'Total Cost', 'Cost per Candidate'].map(heading => <th key={heading} className="px-3 py-2">{heading}</th>)}
          </tr></thead>
          <tbody>{zoneSummaries.map(zone => (
            <tr key={zone.zone} className="border-t">
              <td className="px-3 py-2 font-medium">{zone.zone}</td><td className="px-3 py-2">{zone.venues}</td>
              <td className="px-3 py-2">{zone.candidates.toLocaleString('en-IN')}</td><td className="px-3 py-2">{zone.cameras.toLocaleString('en-IN')}</td>
              <td className="px-3 py-2">{zone.vendors.size}</td><td className="px-3 py-2"><CostValue amount={zone.cost} /></td>
              <td className="px-3 py-2"><CostValue amount={safeDiv(zone.cost, zone.candidates)} /></td>
            </tr>
          ))}</tbody>
        </SortableTable>
      </div>
    </div>
  );
}
