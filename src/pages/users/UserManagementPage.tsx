import type React from 'react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, ConfirmDialog, Modal } from '../../components/ui/index';
import { SortableTable } from '../../components/ui/SortableTable';
import { TablePagination } from '../../components/ui/TablePagination';
import { ZONES, type AccessRole, type AppData, type Role, type User, type UserGroup } from '../../types';
import { PERMISSION_SECTIONS } from '../../utils/permissions';
import { Activity, KeyRound, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';

const roleOptions = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'sub_admin', label: 'Sub Admin' },
  { value: 'user', label: 'User' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'zonal_user', label: 'Zonal User' },
  { value: 'surveillance_head', label: 'Surveillance Head' },
  { value: 'enablement_head', label: 'Head of Enablement' },
  { value: 'custom', label: 'Custom access role' },
];
const PAGE_SIZE = 10;

function summarizeAuditEntry(entry: AppData['auditLogs'][number]): string {
  if (entry.action === 'LOGIN') return 'Signed in';
  if (entry.action === 'LOGOUT') return 'Signed out';
  if (entry.action === 'EXPORT') return `Exported ${entry.entityType}`;
  const noun = entry.entityType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (entry.action === 'CREATE') return `Created ${noun}`;
  if (entry.action === 'DELETE') return `Deleted ${noun}`;

  if (!entry.beforeJson || !entry.afterJson) return `Updated ${noun}`;
  try {
    const before = JSON.parse(entry.beforeJson) as Record<string, unknown>;
    const after = JSON.parse(entry.afterJson) as Record<string, unknown>;
    const changed = Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return changed.length > 0 ? `Updated ${noun}: ${changed.join(', ')}` : `Updated ${noun}`;
  } catch {
    return `Updated ${noun}`;
  }
}

function UserActivity({ data }: { data: AppData }) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const recent = data.auditLogs
    .filter(entry => Number.isFinite(Date.parse(entry.timestamp)))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 200);
  const userNames = new Map(data.users.map(user => [user.id, user.name]));
  const logins = recent.filter(entry => entry.action === 'LOGIN');
  const activeUsers = new Set(logins
    .filter(entry => Date.parse(entry.timestamp) >= sevenDaysAgo)
    .map(entry => entry.userId)).size;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Users', data.users.length],
          ['Sign-ins (recent 200 events)', logins.length],
          ['Users active in 7 days', activeUsers],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Activity size={16} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Recent sign-ins and changes</h2>
          <span className="ml-auto text-xs text-slate-500">Newest 200 events</span>
        </div>
        {recent.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No user activity has been recorded yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Activity</th>
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(entry => (
                <tr key={entry.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {userNames.get(entry.userId) || 'Deleted user'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{summarizeAuditEntry(entry)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {entry.entityId === entry.userId ? '—' : entry.entityId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function PermissionEditor({
  permissions,
  allZones,
  zones,
  onPermissionChange,
  onAllZonesChange,
  onZoneChange,
}: {
  permissions: string[];
  allZones: boolean;
  zones: string[];
  onPermissionChange: (permission: string, checked: boolean) => void;
  onAllZonesChange: (checked: boolean) => void;
  onZoneChange: (zone: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">Zone scope</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allZones} onChange={event => onAllZonesChange(event.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          All zones
        </label>
        {!allZones && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ZONES.map(zone => (
              <label key={zone} className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={zones.includes(zone)}
                  onChange={event => onZoneChange(zone, event.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                {zone}
              </label>
            ))}
          </div>
        )}
        {!allZones && zones.length === 0 && <p className="mt-2 text-xs text-amber-700">No zones selected means no venue data is accessible.</p>}
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">Workspace and feature access</legend>
        <p className="text-xs text-slate-500">Access is off by default. Choose only the pages and actions needed for this role/group.</p>
        {PERMISSION_SECTIONS.map(section => (
          <div key={section.id}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{section.label}</h4>
            <div className="space-y-1">
              {section.options.map(option => (
                <label key={option.key} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={permissions.includes(option.key)}
                    onChange={event => onPermissionChange(option.key, event.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span><strong className="font-medium text-slate-700">{option.label}</strong>
                    <span className="block text-xs text-slate-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

export default function UserManagementPage() {
  const {
    data, updateData, addAuditLog, can, currentUser, createUserAccount, changeUserPassword, reloadFromGitHub,
  } = useAuth();
  const [modal, setModal] = useState<'create' | 'password' | 'role' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', role: 'user' as Role, password: '', zone: '',
    customRoleId: '', groupIds: [] as string[],
  });
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('user');
  const [newZone, setNewZone] = useState('');
  const [newCustomRoleId, setNewCustomRoleId] = useState('');
  const [newGroupIds, setNewGroupIds] = useState<string[]>([]);
  const [accessTab, setAccessTab] = useState<'users' | 'roles' | 'groups' | 'activity'>('users');
  const [roleDraft, setRoleDraft] = useState<AccessRole | null>(null);
  const [groupDraft, setGroupDraft] = useState<UserGroup | null>(null);
  const [page, setPage] = useState(1);

  if (!can('manage_users')) {
    return <Alert type="error">Only a super admin can manage users.</Alert>;
  }
  const pageCount = Math.max(1, Math.ceil(data.users.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageUsers = data.users.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
    setForm({ name: '', email: '', role: 'user', password: '', zone: '', customRoleId: '', groupIds: [] });
    setNewPassword('');
    setNewRole('user');
    setNewZone('');
    setNewCustomRoleId('');
    setNewGroupIds([]);
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (name.length === 0 || email.length === 0 || form.password.length < 12) {
      setAlert({ type: 'error', message: 'Enter a name, valid email, and password with at least 12 characters.' });
      return;
    }
    if (form.role === 'zonal_user' && !form.zone) {
      setAlert({ type: 'error', message: 'Select the assigned zone for this zonal user.' });
      return;
    }
    if (form.role === 'custom' && !data.accessRoles.some(role => role.id === form.customRoleId)) {
      setAlert({ type: 'error', message: 'Select a configured custom access role.' });
      return;
    }
    if (data.users.some(user => user.email.toLowerCase() === email)) {
      setAlert({ type: 'error', message: 'A user with this email already exists.' });
      return;
    }

    const user: User = {
      id: uuidv4(),
      name,
      email,
      role: form.role,
      zone: form.role === 'zonal_user' ? form.zone : undefined,
      customRoleId: form.role === 'custom' ? form.customRoleId : undefined,
      groupIds: form.groupIds,
    };
    try {
      await createUserAccount(user, form.password);
      await reloadFromGitHub();
      closeModal();
      setAlert({ type: 'success', message: 'User created.' });
    } catch (error) {
      setAlert({ type: 'error', message: (error as Error).message });
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser || newPassword.length < 12) {
      setAlert({ type: 'error', message: 'Password must contain at least 12 characters.' });
      return;
    }
    try {
      await changeUserPassword(selectedUser.id, newPassword);
      await reloadFromGitHub();
      closeModal();
      setAlert({ type: 'success', message: `Password updated for ${selectedUser.name}.` });
    } catch (error) {
      setAlert({ type: 'error', message: (error as Error).message });
    }
  };

  const changeRole = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;
    if (selectedUser.id === currentUser?.id) {
      setAlert({ type: 'error', message: 'You cannot change your own role.' });
      return;
    }
    const remainingAdmins = data.users.filter(user => user.role === 'super_admin' && user.id !== selectedUser.id);
    if (selectedUser.role === 'super_admin' && newRole !== 'super_admin' && remainingAdmins.length === 0) {
      setAlert({ type: 'error', message: 'At least one super admin must remain.' });
      return;
    }
    const updatedRoleUser = {
      ...selectedUser,
      role: newRole,
      zone: newRole === 'zonal_user' ? newZone : undefined,
      customRoleId: newRole === 'custom' ? newCustomRoleId : undefined,
      groupIds: newGroupIds,
    };
    if (newRole === 'zonal_user' && !newZone) {
      setAlert({ type: 'error', message: 'Select the zone for this zonal user.' });
      return;
    }
    if (newRole === 'custom' && !data.accessRoles.some(role => role.id === newCustomRoleId)) {
      setAlert({ type: 'error', message: 'Select a configured custom access role.' });
      return;
    }
    updateData(previous => ({
      ...previous,
      users: previous.users.map(user => user.id === selectedUser.id ? updatedRoleUser : user),
      userGroups: previous.userGroups.map(group => ({
        ...group,
        userIds: newGroupIds.includes(group.id)
          ? [...new Set([...group.userIds, selectedUser.id])]
          : group.userIds.filter(userId => userId !== selectedUser.id),
      })),
    }));
    addAuditLog('UPDATE', 'User', selectedUser.id,
      { role: selectedUser.role, zone: selectedUser.zone },
      { role: updatedRoleUser.role, zone: updatedRoleUser.zone });
    closeModal();
    setAlert({ type: 'success', message: `Role updated for ${selectedUser.name}.` });
  };

  const confirmDelete = () => {
    if (!deleteUser) return;
    const remainingAdmins = data.users.filter(user => user.role === 'super_admin' && user.id !== deleteUser.id);
    if (deleteUser.id === currentUser?.id || remainingAdmins.length === 0) {
      setAlert({ type: 'error', message: 'You cannot delete your own account or the last super admin.' });
      setDeleteUser(null);
      return;
    }
    updateData(previous => ({
      ...previous,
      users: previous.users.filter(user => user.id !== deleteUser.id),
      userGroups: previous.userGroups.map(group => ({
        ...group,
        userIds: group.userIds.filter(userId => userId !== deleteUser.id),
      })),
    }));
    addAuditLog('DELETE', 'User', deleteUser.id, deleteUser, undefined);
    setAlert({ type: 'success', message: `Deleted ${deleteUser.name}.` });
    setDeleteUser(null);
  };

  const saveRole = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roleDraft?.name.trim()) {
      setAlert({ type: 'error', message: 'Enter a name for the access role.' });
      return;
    }
    const now = new Date().toISOString();
    const savedRole = { ...roleDraft, name: roleDraft.name.trim(), updatedAt: now };
    const isNew = !data.accessRoles.some(role => role.id === roleDraft.id);
    updateData(previous => ({
      ...previous,
      accessRoles: !isNew
        ? previous.accessRoles.map(role => role.id === roleDraft.id ? savedRole : role)
        : [...previous.accessRoles, savedRole],
    }));
    addAuditLog(isNew ? 'CREATE' : 'UPDATE', 'AccessRole', savedRole.id, undefined, savedRole);
    setRoleDraft(null);
    setAlert({ type: 'success', message: `Access role "${savedRole.name}" saved.` });
  };

  const saveGroup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groupDraft?.name.trim()) {
      setAlert({ type: 'error', message: 'Enter a name for the user group.' });
      return;
    }
    const now = new Date().toISOString();
    const savedGroup = { ...groupDraft, name: groupDraft.name.trim(), updatedAt: now };
    const isNew = !data.userGroups.some(group => group.id === groupDraft.id);
    updateData(previous => ({
      ...previous,
      userGroups: !isNew
        ? previous.userGroups.map(group => group.id === groupDraft.id ? savedGroup : group)
        : [...previous.userGroups, savedGroup],
      users: previous.users.map(user => ({
        ...user,
        groupIds: savedGroup.userIds.includes(user.id)
          ? [...new Set([...(user.groupIds || []), savedGroup.id])]
          : (user.groupIds || []).filter(groupId => groupId !== savedGroup.id),
      })),
    }));
    addAuditLog(isNew ? 'CREATE' : 'UPDATE', 'UserGroup', savedGroup.id, undefined, savedGroup);
    setGroupDraft(null);
    setAlert({ type: 'success', message: `Group "${savedGroup.name}" saved.` });
  };

  const toggleZone = (zone: string, checked: boolean, target: 'role' | 'group') => {
    if (target === 'role') {
      setRoleDraft(previous => previous ? {
        ...previous,
        zones: checked ? [...new Set([...previous.zones, zone])] : previous.zones.filter(item => item !== zone),
      } : previous);
    } else {
      setGroupDraft(previous => previous ? {
        ...previous,
        zones: checked ? [...new Set([...previous.zones, zone])] : previous.zones.filter(item => item !== zone),
      } : previous);
    }
  };

  const togglePermission = (permission: string, checked: boolean, target: 'role' | 'group') => {
    if (target === 'role') {
      setRoleDraft(previous => previous ? {
        ...previous,
        permissions: checked ? [...new Set([...previous.permissions, permission])] : previous.permissions.filter(item => item !== permission),
      } : previous);
    } else {
      setGroupDraft(previous => previous ? {
        ...previous,
        permissions: checked ? [...new Set([...previous.permissions, permission])] : previous.permissions.filter(item => item !== permission),
      } : previous);
    }
  };

  const startNewRole = () => {
    const now = new Date().toISOString();
    setRoleDraft({ id: uuidv4(), name: '', permissions: [], allZones: false, zones: [], createdAt: now, updatedAt: now });
  };

  const startNewGroup = () => {
    const now = new Date().toISOString();
    setGroupDraft({ id: uuidv4(), name: '', permissions: [], allZones: false, zones: [], userIds: [], createdAt: now, updatedAt: now });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Access control</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create accounts, manage roles, change passwords, and remove access.</p>
        </div>
        {accessTab === 'users' && <Button onClick={() => { setAlert(null); setModal('create'); }}><Plus size={14} /> Create User</Button>}
        {accessTab === 'roles' && <Button onClick={startNewRole}><Plus size={14} /> Create Role</Button>}
        {accessTab === 'groups' && <Button onClick={startNewGroup}><Plus size={14} /> Create Group</Button>}
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert></div>}

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {([
          ['users', 'Users'],
          ['roles', 'Access roles'],
          ['groups', 'Groups'],
          ['activity', 'User activity'],
        ] as const).map(([tab, label]) => (
          <button key={tab} type="button" onClick={() => { setAccessTab(tab); setRoleDraft(null); setGroupDraft(null); }}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${accessTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {accessTab === 'users' && <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <SortableTable className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">
            {['Name', 'Email', 'Role', 'Groups', 'Last sign-in', 'Actions'].map(label => (
              <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">{label}</th>
            ))}
          </tr></thead>
          <tbody>
            {pageUsers.map(user => (
              <tr key={user.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3 capitalize">
                  {user.role.replace('_', ' ')}
                  {user.role === 'zonal_user' && user.zone && <span className="ml-2 text-xs text-slate-500">· {user.zone}</span>}
                  {user.customRoleId && <span className="ml-2 text-xs text-slate-500">· {data.accessRoles.find(role => role.id === user.customRoleId)?.name || 'Missing role'}</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {(user.groupIds || []).map(groupId => data.userGroups.find(group => group.id === groupId)?.name).filter(Boolean).join(', ') || '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={user.id === currentUser?.id}
                      onClick={() => {
                        setAlert(null);
                        setSelectedUser(user);
                        setNewRole(user.role);
                        setNewZone(user.zone || '');
                        setNewCustomRoleId(user.customRoleId || '');
                        setNewGroupIds(user.groupIds || []);
                        setModal('role');
                      }}>
                      Change role
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setAlert(null); setSelectedUser(user); setModal('password'); }}>
                      <KeyRound size={13} /> Change password
                    </Button>
                    <Button variant="danger" size="sm" disabled={user.id === currentUser?.id}
                      onClick={() => setDeleteUser(user)} aria-label={`Delete ${user.name}`}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={data.users.length} onPageChange={setPage} />
      </div>}

      {accessTab === 'activity' && <UserActivity data={data} />}

      {accessTab === 'roles' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.5fr)]">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">Configured access roles</h2>
            {data.accessRoles.length === 0 && <p className="text-sm text-slate-500">No custom roles yet. Roles start with no access; select only required pages and actions.</p>}
            <div className="space-y-2">
              {data.accessRoles.map(role => (
                <button key={role.id} type="button" onClick={() => setRoleDraft(role)}
                  className={`w-full rounded-lg border p-3 text-left hover:border-blue-300 ${roleDraft?.id === role.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                  <span className="flex items-center gap-2 font-medium text-slate-800"><ShieldCheck size={15} />{role.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{role.permissions.length} permissions · {role.allZones ? 'All zones' : `${role.zones.length} zones`}</span>
                  <span className="block text-xs text-slate-500">{data.users.filter(user => user.customRoleId === role.id).length} assigned user(s)</span>
                </button>
              ))}
            </div>
          </section>
          {roleDraft ? (
            <form onSubmit={saveRole} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900">{data.accessRoles.some(role => role.id === roleDraft.id) ? 'Edit access role' : 'Create access role'}</h2>
              <Input label="Role name" value={roleDraft.name}
                onChange={event => setRoleDraft(previous => previous ? { ...previous, name: event.target.value } : previous)}
                placeholder="e.g. Regional Finance Reviewer" required />
              <PermissionEditor permissions={roleDraft.permissions} allZones={roleDraft.allZones} zones={roleDraft.zones}
                onPermissionChange={(permission, checked) => togglePermission(permission, checked, 'role')}
                onAllZonesChange={checked => setRoleDraft(previous => previous ? { ...previous, allZones: checked } : previous)}
                onZoneChange={(zone, checked) => toggleZone(zone, checked, 'role')} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setRoleDraft(null)}>Cancel</Button>
                <Button type="submit">Save Role</Button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">Create a role or choose one to configure its permissions and zone access.</div>
          )}
        </div>
      )}

      {accessTab === 'groups' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.5fr)]">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">User groups</h2>
            {data.userGroups.length === 0 && <p className="text-sm text-slate-500">No groups yet. Group permissions and zones further restrict each member's assigned role.</p>}
            <div className="space-y-2">
              {data.userGroups.map(group => (
                <button key={group.id} type="button" onClick={() => setGroupDraft(group)}
                  className={`w-full rounded-lg border p-3 text-left hover:border-blue-300 ${groupDraft?.id === group.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                  <span className="flex items-center gap-2 font-medium text-slate-800"><Users size={15} />{group.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{group.userIds.length} user(s) · {group.permissions.length} permissions</span>
                  <span className="block text-xs text-slate-500">{group.allZones ? 'All zones' : `${group.zones.length} zones`}</span>
                </button>
              ))}
            </div>
          </section>
          {groupDraft ? (
            <form onSubmit={saveGroup} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900">{data.userGroups.some(group => group.id === groupDraft.id) ? 'Edit group' : 'Create group'}</h2>
              <Input label="Group name" value={groupDraft.name}
                onChange={event => setGroupDraft(previous => previous ? { ...previous, name: event.target.value } : previous)}
                placeholder="e.g. East Zone Requirement Editors" required />
              <fieldset className="rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">Group members</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.users.filter(user => user.role !== 'super_admin').map(user => (
                    <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={groupDraft.userIds.includes(user.id)}
                        onChange={event => setGroupDraft(previous => previous ? {
                          ...previous,
                          userIds: event.target.checked
                            ? [...new Set([...previous.userIds, user.id])]
                            : previous.userIds.filter(userId => userId !== user.id),
                        } : previous)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      {user.name} <span className="text-xs text-slate-500">({user.email})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <PermissionEditor permissions={groupDraft.permissions} allZones={groupDraft.allZones} zones={groupDraft.zones}
                onPermissionChange={(permission, checked) => togglePermission(permission, checked, 'group')}
                onAllZonesChange={checked => setGroupDraft(previous => previous ? { ...previous, allZones: checked } : previous)}
                onZoneChange={(zone, checked) => toggleZone(zone, checked, 'group')} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setGroupDraft(null)}>Cancel</Button>
                <Button type="submit">Save Group</Button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">Create a group or choose one to configure members, permissions, and zones.</div>
          )}
        </div>
      )}

      <Modal open={modal === 'create'} onClose={closeModal} title="Create User">
        <form onSubmit={createUser} className="flex flex-col gap-3">
          <Input label="Full name" value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} required />
          <Select label="Role" value={form.role} options={roleOptions}
            onChange={event => setForm(previous => ({ ...previous, role: event.target.value as Role }))} />
          {form.role === 'custom' && (
            <Select label="Custom access role" value={form.customRoleId}
              options={data.accessRoles.map(role => ({ value: role.id, label: role.name }))}
              placeholder="Select role"
              onChange={event => setForm(previous => ({ ...previous, customRoleId: event.target.value }))} required />
          )}
          {form.role === 'zonal_user' && (
            <Select label="Assigned zone" value={form.zone} options={ZONES.map(zone => ({ value: zone, label: zone }))}
              placeholder="Select zone" onChange={event => setForm(previous => ({ ...previous, zone: event.target.value }))} required />
          )}
          {data.userGroups.length > 0 && (
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Groups (optional additional restrictions)</legend>
              <div className="space-y-2">
                {data.userGroups.map(group => (
                  <label key={group.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.groupIds.includes(group.id)}
                      onChange={event => setForm(previous => ({
                        ...previous,
                        groupIds: event.target.checked
                          ? [...new Set([...previous.groupIds, group.id])]
                          : previous.groupIds.filter(id => id !== group.id),
                      }))}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    {group.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Input label="Temporary password" type="password" minLength={12} value={form.password}
            onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Create User</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'password'} onClose={closeModal} title={`Change password${selectedUser ? ` — ${selectedUser.name}` : ''}`}>
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <Input label="New password" type="password" minLength={12} value={newPassword}
            onChange={event => setNewPassword(event.target.value)} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Update Password</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'role'} onClose={closeModal} title={`Change role${selectedUser ? ` — ${selectedUser.name}` : ''}`}>
        <form onSubmit={changeRole} className="flex flex-col gap-3">
          <Select label="Access role" value={newRole} options={roleOptions}
            onChange={event => setNewRole(event.target.value as Role)} />
          {newRole === 'custom' && (
            <Select label="Custom access role" value={newCustomRoleId}
              options={data.accessRoles.map(role => ({ value: role.id, label: role.name }))}
              placeholder="Select role"
              onChange={event => setNewCustomRoleId(event.target.value)} required />
          )}
          {newRole === 'zonal_user' && (
            <Select label="Assigned zone" value={newZone} options={ZONES.map(zone => ({ value: zone, label: zone }))}
              placeholder="Select zone" onChange={event => setNewZone(event.target.value)} required />
          )}
          {data.userGroups.length > 0 && (
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Groups (additional restrictions)</legend>
              <div className="space-y-2">
                {data.userGroups.map(group => (
                  <label key={group.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={newGroupIds.includes(group.id)}
                      onChange={event => setNewGroupIds(previous => event.target.checked
                        ? [...new Set([...previous, group.id])]
                        : previous.filter(id => id !== group.id))}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    {group.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Update Role</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteUser} title="Delete User"
        message={deleteUser ? `Delete access for ${deleteUser.name}?` : ''}
        onConfirm={confirmDelete} onCancel={() => setDeleteUser(null)} />
    </div>
  );
}
