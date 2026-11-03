import type { StorageUnit } from '../types';

export const STORAGE_QUANTITIES = Array.from({ length: 10 }, (_, index) => index + 1);

export const STORAGE_SIZE_OPTIONS: Array<{ label: string; size: number; unit: StorageUnit }> = [
  { label: '32 GB', size: 32, unit: 'GB' },
  { label: '64 GB', size: 64, unit: 'GB' },
  { label: '128 GB', size: 128, unit: 'GB' },
  { label: '256 GB', size: 256, unit: 'GB' },
  { label: '512 GB', size: 512, unit: 'GB' },
  { label: '1 TB', size: 1, unit: 'TB' },
  { label: '2 TB', size: 2, unit: 'TB' },
  { label: '4 TB', size: 4, unit: 'TB' },
  { label: '8 TB', size: 8, unit: 'TB' },
];
