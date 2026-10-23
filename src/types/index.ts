export type ApprovalStage = 'surveillance_head' | 'enablement_head';
export type ApprovalStatus = 'pending' | 'returned' | 'approved';
export type Role = 'super_admin' | 'sub_admin' | 'user' | 'viewer' | 'zonal_user' | ApprovalStage | 'custom';

export const ZONES = [
  'East 1', 'East 2', 'North 1', 'North 2', 'North 3', 'North 4',
  'South 1', 'South 2', 'West 1', 'West 2',
] as const;

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  zone?: string;
  customRoleId?: string;
  groupIds?: string[];
  lastLoginAt?: string;
}

export interface AccessRole {
  id: string;
  name: string;
  permissions: string[];
  allZones: boolean;
  zones: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserGroup {
  id: string;
  name: string;
  permissions: string[];
  allZones: boolean;
  zones: string[];
  userIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RequirementMaster {
  id: string;
  zone: string;
  state: string;
  city: string;
  tcCode: string;
  tcName: string;
  clientName: string;
  examName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorMaster {
  id: string;
  vendorCode?: string;
  zone: string;
  vendorName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type InstallationType = 'Full Vendor' | 'Partial Vendor';
export type StorageType = 'Pen Drive' | 'External HDD';
export type StorageUnit = 'GB' | 'TB';

export interface InstallationRecord {
  id: string;
  requirementId: string;
  installationType: InstallationType;
  vendorId: string;
  cameraCount: number;
  proxyProvided: boolean;
  internetProvided: boolean;
  storageProvided: boolean;
  storageType?: StorageType;
  storageQuantity?: number;
  storageSize?: number;
  storageUnit?: StorageUnit;
  localVendorCost: number;
  minimumCost?: number;
  remarks?: string;
  quotationFileId?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  approvalStatus?: ApprovalStatus;
  approvalStage?: ApprovalStage;
}

export interface QuoteRevision {
  id: string;
  installationRecordId: string;
  createdAt: string;
  createdBy: string;
  remarks?: string;
  vendorId: string;
  localVendorCost: number;
  minimumCost?: number;
  quotationFileId?: string;
  installationType: InstallationType;
  cameraCount: number;
  totalCandidates: number;
  examDates: Array<{ examDate: string; scheduledCandidates: number }>;
}

export interface ApprovalEvent {
  id: string;
  installationRecordId: string;
  stage: ApprovalStage;
  action: 'approved' | 'sent_back';
  userId: string;
  remarks: string;
  exception?: boolean;
  quoteRevisionId: string;
  createdAt: string;
}

export interface BlanketApproval {
  id: string;
  clientName: string;
  examName: string;
  stage: ApprovalStage;
  userId: string;
  remarks: string;
  installationRecordIds: string[];
  createdAt: string;
}

export interface ExamDateDetail {
  id: string;
  installationRecordId: string;
  examDate: string;
  scheduledCandidates: number;
}

export interface QuotationFile {
  id: string;
  installationRecordId: string;
  originalFileName: string;
  dataUrl: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'LOGIN' | 'LOGOUT';

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  beforeJson?: string;
  afterJson?: string;
  timestamp: string;
}

export interface AppData {
  users: User[];
  requirements: RequirementMaster[];
  vendors: VendorMaster[];
  installations: InstallationRecord[];
  examDates: ExamDateDetail[];
  quotations: QuotationFile[];
  quoteRevisions: QuoteRevision[];
  approvalEvents: ApprovalEvent[];
  blanketApprovals: BlanketApproval[];
  accessRoles: AccessRole[];
  userGroups: UserGroup[];
  auditLogs: AuditLog[];
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  client: string;
  exam: string;
  zone: string;
  tcCode?: string;
}
