import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { BUILT_IN_ROLE_PERMISSIONS, userAssignedZones } from './permissions';
import { normalizeAppData } from './storage';

describe('userAssignedZones', () => {
  it('limits all-zone roles to the intersection of assigned group zones', () => {
    expect(userAssignedZones(
      { allZones: true, zones: [] },
      [
        { allZones: false, zones: ['East 1', 'East 2'] },
        { allZones: false, zones: ['East 1', 'North 1'] },
      ]
    )).toEqual({ allZones: false, zones: ['East 1'] });
  });

  it('preserves an all-zone role when its groups do not restrict zones', () => {
    expect(userAssignedZones(
      { allZones: true, zones: [] },
      [{ allZones: true, zones: [] }]
    )).toEqual({ allZones: true, zones: [] });
  });
});

describe('built-in least-privilege policies', () => {
  it('does not grant standard users approval, master-import, or deletion permissions', () => {
    expect(BUILT_IN_ROLE_PERMISSIONS.user).not.toContain('page:approvals');
    expect(BUILT_IN_ROLE_PERMISSIONS.user).not.toContain('requirements:import');
    expect(BUILT_IN_ROLE_PERMISSIONS.user).not.toContain('vendors:delete');
  });

  it('limits zonal users to the requirement, vendor, and record modules', () => {
    expect(BUILT_IN_ROLE_PERMISSIONS.zonal_user).toEqual([
      'page:requirements', 'page:vendors', 'page:records', 'records:create', 'records:edit',
    ]);
  });
});

describe('normalizeAppData', () => {
  it('routes legacy installations without approval metadata to first-stage review', () => {
    const user: User = {
      id: 'user-1', name: 'User', email: 'user@example.com', role: 'user',
    };
    const normalized = normalizeAppData({
      users: [user],
      installations: [{
        id: 'legacy-1', requirementId: 'requirement-1', installationType: 'Full Vendor',
        vendorId: 'vendor-1', cameraCount: 1, proxyProvided: false, internetProvided: false,
        storageProvided: false, localVendorCost: 100, createdBy: 'user-1', createdAt: '2026-01-01',
        updatedBy: 'user-1', updatedAt: '2026-01-01',
      }],
    });

    expect(normalized.installations[0].approvalStatus).toBe('pending');
    expect(normalized.installations[0].approvalStage).toBe('surveillance_head');
    expect(normalized.accessRoles).toEqual([]);
    expect(normalized.userGroups).toEqual([]);
  });

  it('preserves explicit final approvals and restores group memberships from group data', () => {
    const normalized = normalizeAppData({
      users: [{
        id: 'user-1', name: 'User', email: 'user@example.com', role: 'user',
      }],
      installations: [{
        id: 'approved-1', requirementId: 'requirement-1', installationType: 'Full Vendor',
        vendorId: 'vendor-1', cameraCount: 1, proxyProvided: false, internetProvided: false,
        storageProvided: false, localVendorCost: 100, createdBy: 'user-1', createdAt: '2026-01-01',
        updatedBy: 'user-1', updatedAt: '2026-01-01', approvalStatus: 'approved',
      }],
      userGroups: [{
        id: 'group-1', name: 'East', permissions: [], allZones: false, zones: ['East 1'],
        userIds: ['user-1'], createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }],
    });

    expect(normalized.installations[0].approvalStatus).toBe('approved');
    expect(normalized.installations[0].approvalStage).toBeUndefined();
    expect(normalized.users[0].groupIds).toEqual(['group-1']);
  });
});
