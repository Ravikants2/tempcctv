import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { User, AppData, AuditAction } from '../types';
import {
  changeManagedUserPassword,
  createManagedUser,
  getInitialData,
  isGitHubConfigured,
  loadData,
  loginUser,
  logoutUser,
  recordExportAudit,
  restoreSession,
  saveData,
} from '../utils/storage';
import { BUILT_IN_ROLE_PERMISSIONS, userAssignedZones } from '../utils/permissions';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

interface AuthContextType {
  currentUser: User | null;
  data: AppData;
  syncStatus: SyncStatus;
  syncError: string;
  isGitHub: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  createUserAccount: (user: User, password: string) => Promise<User>;
  changeUserPassword: (userId: string, password: string) => Promise<void>;
  updateData: (updater: (prev: AppData) => AppData) => void;
  addAuditLog: (action: AuditAction, entityType: string, entityId: string, before?: unknown, after?: unknown) => void;
  can: (action: string) => boolean;
  reloadFromGitHub: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(getInitialData());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGeneration = useRef(0);
  const signedInUser = currentUser ? data.users.find(user => user.id === currentUser.id) || currentUser : null;
  const assignedGroups = useMemo(() => signedInUser && signedInUser.role !== 'super_admin'
    ? data.userGroups.filter(group => (signedInUser.groupIds || []).includes(group.id) || group.userIds.includes(signedInUser.id))
    : [], [signedInUser, data.userGroups]);
  const customRole = signedInUser?.customRoleId
    ? data.accessRoles.find(role => role.id === signedInUser.customRoleId)
    : undefined;
  const rolePolicy = useMemo(() => signedInUser?.role === 'custom'
    ? customRole
    : signedInUser
      ? {
          allZones: signedInUser.role !== 'zonal_user',
          zones: signedInUser.role === 'zonal_user' && signedInUser.zone ? [signedInUser.zone] : [],
          permissions: BUILT_IN_ROLE_PERMISSIONS[signedInUser.role] || [],
        }
      : undefined, [signedInUser, customRole]);
  const zonePolicy = useMemo(() => rolePolicy
    ? userAssignedZones(rolePolicy, assignedGroups)
    : { allZones: false, zones: [] as string[] }, [rolePolicy, assignedGroups]);
  const visibleData = useMemo(() => {
    if (!signedInUser || zonePolicy.allZones) return data;
    const requirements = data.requirements.filter(requirement => zonePolicy.zones.includes(requirement.zone));
    const requirementIds = new Set(requirements.map(requirement => requirement.id));
    const installations = data.installations.filter(record => requirementIds.has(record.requirementId));
    const installationIds = new Set(installations.map(record => record.id));
    return {
      ...data,
      requirements,
      vendors: data.vendors.filter(vendor => zonePolicy.zones.includes(vendor.zone)),
      installations,
      examDates: data.examDates.filter(date => installationIds.has(date.installationRecordId)),
      quotations: data.quotations.filter(quotation => installationIds.has(quotation.installationRecordId)),
      quoteRevisions: data.quoteRevisions.filter(revision => installationIds.has(revision.installationRecordId)),
      approvalEvents: data.approvalEvents.filter(event => installationIds.has(event.installationRecordId)),
      blanketApprovals: data.blanketApprovals.map(approval => ({
        ...approval,
        installationRecordIds: approval.installationRecordIds.filter(id => installationIds.has(id)),
      })).filter(approval => approval.installationRecordIds.length > 0),
    };
  }, [data, signedInUser, zonePolicy]);

  // Load data on mount
  useEffect(() => {
    setSyncStatus('loading');
    restoreSession().then(async user => {
      if (!user) {
        setData(getInitialData());
        setSyncStatus('idle');
        return;
      }
      setCurrentUser(user);
      const loaded = await loadData();
      setData(loaded);
      setSyncStatus('idle');
    }).catch(e => {
      setSyncStatus('error');
      setSyncError((e as Error).message);
    });
  }, []);

  const reloadFromGitHub = useCallback(async () => {
    setSyncStatus('loading');
    setSyncError('');
    try {
      const loaded = await loadData();
      setData(loaded);
      setSyncStatus('idle');
    } catch (e) {
      setSyncStatus('error');
      setSyncError((e as Error).message);
    }
  }, []);

  const updateData = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => {
      const next = updater(prev);
      const generation = ++saveGeneration.current;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSyncStatus('saving');
      saveTimer.current = setTimeout(() => {
        void saveData(next).then(saved => {
          if (generation !== saveGeneration.current) return;
          setData(saved);
          setSyncStatus('saved');
          setTimeout(() => {
            if (generation === saveGeneration.current) setSyncStatus('idle');
          }, 2000);
        }).catch(error => {
          if (generation !== saveGeneration.current) return;
          setSyncStatus('error');
          setSyncError((error as Error).message);
        });
      }, 800);
      return next;
    });
  }, []);

  const addAuditLog = useCallback((
    action: AuditAction, entityType: string, entityId: string,
    before?: unknown, after?: unknown
  ) => {
    if (action === 'EXPORT') {
      void recordExportAudit(entityType, entityId).then(setData).catch(error => {
        setSyncStatus('error');
        setSyncError((error as Error).message);
      });
      return;
    }
    setData(prev => {
      const next = {
        ...prev,
        auditLogs: [...prev.auditLogs, {
          id: uuidv4(),
          userId: currentUser?.id || 'system',
          action, entityType, entityId,
          beforeJson: before ? JSON.stringify(before) : undefined,
          afterJson: after ? JSON.stringify(after) : undefined,
          timestamp: new Date().toISOString(),
        }],
      };
      return next;
    });
  }, [currentUser]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const user = await loginUser(email, password);
      setSyncStatus('loading');
      const loaded = await loadData();
      setData(loaded);
      setCurrentUser(user);
      setSyncError('');
      setSyncStatus('idle');
      return true;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401) return false;
      if (currentUser === null) await logoutUser();
      setSyncStatus('error');
      setSyncError((error as Error).message);
      throw error;
    }
  }, [currentUser]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setCurrentUser(null);
      setData(getInitialData());
      setSyncStatus('idle');
    }
  }, []);

  const createUserAccount = useCallback((user: User, password: string) => (
    createManagedUser(user, password)
  ), []);

  const changeUserPassword = useCallback((userId: string, password: string) => (
    changeManagedUserPassword(userId, password)
  ), []);

  const can = useCallback((action: string): boolean => {
    if (!signedInUser) return false;
    const isSuperAdmin = signedInUser.role === 'super_admin';
    if (action === 'manage_users' || action === 'manage_access') return isSuperAdmin;

    const rolePermissions = signedInUser.role === 'custom'
      ? customRole?.permissions || []
      : BUILT_IN_ROLE_PERMISSIONS[signedInUser.role] || [];
    const permissionForAction: Record<string, string[]> = {
      create_installation: ['records:create'],
      edit_installation: ['records:edit'],
      upload_requirements: ['requirements:import'],
      delete_requirements: ['requirements:delete'],
      manage_requirements: ['requirements:manage'],
      upload_vendors: ['vendors:import'],
      delete_vendors: ['vendors:delete'],
      manage_vendors: ['vendors:manage'],
      bulk_records: ['records:bulk'],
      view_approvals: ['page:approvals'],
      approve_surveillance: ['approvals:surveillance'],
      approve_enablement: ['approvals:enablement'],
      view_dashboard: ['page:dashboard.executive', 'page:dashboard.financial', 'page:dashboard.operations', 'page:dashboard.vendor', 'page:dashboard.venue'],
      export_data: ['workspace:backup'],
    };
    const requested = permissionForAction[action] || [action];
    const hasRolePermission = requested.some(permission => rolePermissions.includes(permission));
    if (!hasRolePermission) return false;
    if (assignedGroups.length > 0 && !requested.some(permission =>
      assignedGroups.every(group => group.permissions.includes(permission))
    )) return false;
    return true;
  }, [signedInUser, customRole, assignedGroups]);

  return (
    <AuthContext.Provider value={{
      currentUser: signedInUser, data: visibleData, syncStatus, syncError,
      isGitHub: isGitHubConfigured(),
      login, logout, createUserAccount, changeUserPassword, updateData, addAuditLog, can, reloadFromGitHub,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// The provider and its matching hook intentionally share this context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
