import type { VendorMaster } from '../types';

export function sameZone(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

export function sameVendorName(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

export function isVendorCodeForZone(code: string, zone: string): boolean {
  const prefix = zone.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}-\\d{5}$`, 'i').test(code.trim());
}

export function getVendorCode(vendor: VendorMaster): string {
  if (vendor.vendorCode && isVendorCodeForZone(vendor.vendorCode, vendor.zone)) return vendor.vendorCode;
  let hash = 0;
  for (let index = 0; index < vendor.id.length; index++) {
    hash = (hash * 31 + vendor.id.charCodeAt(index)) % 90000;
  }
  return `${vendor.zone.trim()}-${String(hash + 10000).padStart(5, '0')}`;
}

export function createVendorCode(zone: string, vendors: VendorMaster[]): string {
  const prefix = zone.trim();
  if (!prefix) return '';
  const existingCodes = new Set(vendors.map(getVendorCode).map(code => code.toLowerCase()));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = Math.floor(10000 + Math.random() * 90000);
    const code = `${prefix}-${suffix}`;
    if (!existingCodes.has(code.toLowerCase())) return code;
  }
  throw new Error(`Unable to generate a unique vendor ID for ${prefix}.`);
}
