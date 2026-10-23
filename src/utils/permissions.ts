export interface PermissionOption {
  key: string;
  label: string;
  description: string;
}

export interface PermissionSection {
  id: string;
  label: string;
  options: PermissionOption[];
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: 'dashboards',
    label: 'Dashboards',
    options: [
      { key: 'page:dashboard.executive', label: 'Executive Dashboard', description: 'KPIs and client/exam comparisons' },
      { key: 'page:dashboard.financial', label: 'Finance Dashboard', description: 'Installation cost and financial summaries' },
      { key: 'page:dashboard.operations', label: 'Operations Dashboard', description: 'Operational and exam schedule summaries' },
      { key: 'page:dashboard.vendor', label: 'Vendor Dashboard', description: 'Vendor performance and cost summaries' },
      { key: 'page:dashboard.venue', label: 'Venue Dashboard', description: 'Venue costs, cameras, and zone analysis' },
    ],
  },
  {
    id: 'requirements',
    label: 'Requirements',
    options: [
      { key: 'page:requirements', label: 'View requirements', description: 'Browse and filter venue requirements' },
      { key: 'requirements:manage', label: 'Add or edit requirements', description: 'Create venue records' },
      { key: 'requirements:import', label: 'Import requirements', description: 'Upload requirement files' },
      { key: 'requirements:delete', label: 'Delete requirements', description: 'Remove unused requirement records' },
    ],
  },
  {
    id: 'vendors',
    label: 'Vendors',
    options: [
      { key: 'page:vendors', label: 'View vendors', description: 'Browse and filter the vendor master' },
      { key: 'vendors:manage', label: 'Add or edit vendors', description: 'Create vendor records' },
      { key: 'vendors:import', label: 'Import vendors', description: 'Upload vendor files' },
      { key: 'vendors:delete', label: 'Delete vendors', description: 'Remove unused vendor records' },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    options: [
      { key: 'page:records', label: 'View records', description: 'Browse installation records and quotations' },
      { key: 'records:create', label: 'Create installation records', description: 'Submit a new quote for approval' },
      { key: 'records:edit', label: 'Edit returned records', description: 'Update a quote returned by an approver' },
      { key: 'records:bulk', label: 'Bulk upload records', description: 'Import installation records' },
    ],
  },
  {
    id: 'approvals',
    label: 'Approvals',
    options: [
      { key: 'page:approvals', label: 'View approval queue', description: 'Review quote and approval history' },
      { key: 'approvals:surveillance', label: 'Surveillance Head decisions', description: 'Approve or return first-stage quotes' },
      { key: 'approvals:enablement', label: 'Head of Enablement decisions', description: 'Approve or return final-stage quotes' },
    ],
  },
  {
    id: 'other',
    label: 'Other workspace areas',
    options: [
      { key: 'page:chat', label: 'AI Chat', description: 'Ask questions about accessible records' },
      { key: 'workspace:backup', label: 'Download backup', description: 'Download accessible workspace data; restore is Super Admin-only' },
    ],
  },
];

export const PERMISSION_OPTIONS = PERMISSION_SECTIONS.flatMap(section => section.options);
export const ALL_PERMISSION_KEYS = PERMISSION_OPTIONS.map(option => option.key);

export const BUILT_IN_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [...ALL_PERMISSION_KEYS],
  sub_admin: ALL_PERMISSION_KEYS.filter(key =>
    !['page:users', 'requirements:delete', 'vendors:delete'].includes(key)
  ),
  user: [
    'page:dashboard.executive', 'page:dashboard.financial', 'page:dashboard.operations',
    'page:dashboard.vendor', 'page:dashboard.venue', 'page:requirements',
    'page:vendors', 'page:records', 'page:chat',
    'records:create', 'records:edit', 'workspace:backup',
  ],
  viewer: [
    'page:dashboard.executive', 'page:dashboard.financial', 'page:dashboard.operations',
    'page:dashboard.venue', 'page:vendors', 'page:chat',
  ],
  zonal_user: [
    'page:requirements', 'page:vendors', 'page:records',
    'records:create', 'records:edit',
  ],
  surveillance_head: ['page:approvals', 'approvals:surveillance'],
  enablement_head: ['page:approvals', 'approvals:enablement'],
};

export function userAssignedZones(role: { allZones: boolean; zones: string[] }, groups: Array<{ allZones: boolean; zones: string[] }>): {
  allZones: boolean;
  zones: string[];
} {
  const scopedGroups = groups.filter(group => !group.allZones);
  if (role.allZones && scopedGroups.length === 0) return { allZones: true, zones: [] };
  if (role.allZones) {
    return {
      allZones: false,
      zones: scopedGroups[0].zones.filter(zone => scopedGroups.every(group => group.zones.includes(zone))),
    };
  }
  if (scopedGroups.length === 0) return { allZones: false, zones: role.zones };
  return {
    allZones: false,
    zones: role.zones.filter(zone => scopedGroups.every(group => group.zones.includes(zone))),
  };
}
