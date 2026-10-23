import React, { createContext, useContext, useState } from 'react';
import type { DashboardFilters } from '../types';

interface FilterContextType {
  filters: DashboardFilters;
  setFilters: (f: DashboardFilters) => void;
  clearFilters: () => void;
}

const empty: DashboardFilters = { startDate: '', endDate: '', client: '', exam: '', zone: '', tcCode: '' };

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>(empty);
  const clearFilters = () => setFilters(empty);
  return (
    <FilterContext.Provider value={{ filters, setFilters, clearFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

// The provider and its matching hook intentionally share this context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
