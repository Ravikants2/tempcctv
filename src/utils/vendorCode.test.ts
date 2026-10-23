import { describe, expect, it } from 'vitest';
import type { VendorMaster } from '../types';
import { createVendorCode, getVendorCode, isVendorCodeForZone, sameVendorName, sameZone } from './vendorCode';

const vendors: VendorMaster[] = [
  { id: 'vendor-1', vendorCode: 'North Zone-12345', zone: 'North Zone', vendorName: 'Vendor One', createdBy: 'admin', createdAt: '', updatedAt: '' },
];

describe('vendor IDs', () => {
  it('requires the selected zone and an exact five-digit suffix', () => {
    expect(isVendorCodeForZone('North Zone-12345', 'North Zone')).toBe(true);
    expect(isVendorCodeForZone('South Zone-12345', 'North Zone')).toBe(false);
    expect(isVendorCodeForZone('North Zone-1234', 'North Zone')).toBe(false);
  });

  it('generates unique zone-prefixed IDs and normalizes legacy IDs for display', () => {
    expect(createVendorCode('South Zone', vendors)).toMatch(/^South Zone-\d{5}$/);
    expect(getVendorCode({ ...vendors[0], vendorCode: 'VND-LEGACY' })).toMatch(/^North Zone-\d{5}$/);
  });

  it('matches zone and vendor names without regard to letter case or surrounding spaces', () => {
    expect(sameZone('  North Zone ', 'north zone')).toBe(true);
    expect(sameVendorName('Vendor One', 'vendor one')).toBe(true);
    expect(sameZone('North Zone', 'North-East Zone')).toBe(false);
  });
});
