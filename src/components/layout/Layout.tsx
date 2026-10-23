import React, { useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { exportBackup, importBackup } from '../../utils/storage';
import { PageExportActions } from './PageExportActions';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FileText, Users, ClipboardList, TrendingUp,
  Wrench, LogOut, Menu, X, ChevronDown, RefreshCw,
  Download, Upload, Cloud, CloudOff, Loader2, CheckCircle2, AlertCircle,
  MessageCircle, UserCog,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard/executive',  label: 'Dashboard',         icon: LayoutDashboard, permission: 'page:dashboard.executive' },
  { to: '/dashboard/financial',  label: 'Finance',            icon: TrendingUp,      permission: 'page:dashboard.financial' },
  { to: '/dashboard/operations', label: 'Operations',         icon: Wrench,          permission: 'page:dashboard.operations' },
  { to: '/dashboard/vendor',     label: 'Vendor Dashboard',   icon: Users,           permission: 'page:dashboard.vendor' },
  { to: '/dashboard/venue',      label: 'Venue Dashboard',    icon: LayoutDashboard, permission: 'page:dashboard.venue' },
  { to: '/requirements',         label: 'Requirements',       icon: FileText,        permission: 'page:requirements' },
  { to: '/vendors',              label: 'Vendors',             icon: Users,           permission: 'page:vendors' },
  { to: '/records',              label: 'Records',             icon: ClipboardList,   permission: 'page:records' },
  { to: '/approvals',            label: 'Approvals',           icon: CheckCircle2,    permission: 'page:approvals' },
  { to: '/chat',                 label: 'AI Chat',             icon: MessageCircle,   permission: 'page:chat' },
  { to: '/users',                label: 'User Management',     icon: UserCog,         permission: 'manage_users' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, data, syncStatus, syncError, isGitHub, reloadFromGitHub, updateData, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const visibleNavItems = navItems.filter(item => can(item.permission));

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const restored = await importBackup(file);
      updateData(() => restored);
    } catch { alert('Invalid backup file.'); }
    e.target.value = '';
  };

  const SyncIcon = () => {
    if (!isGitHub) return <span title="Secure Worker API not configured"><CloudOff size={14} className="text-white/40" /></span>;
    if (syncStatus === 'loading') return <Loader2 size={14} className="text-white/70 animate-spin" />;
    if (syncStatus === 'saving')  return <Loader2 size={14} className="text-yellow-300 animate-spin" />;
    if (syncStatus === 'saved')   return <CheckCircle2 size={14} className="text-green-300" />;
    if (syncStatus === 'error')   return <span title={syncError}><AlertCircle size={14} className="text-red-300" /></span>;
    return <span title="Synced with GitHub"><Cloud size={14} className="text-white/60" /></span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-slate-950 text-white sticky top-0 z-40 border-b border-white/10 shadow-xl shadow-slate-950/10">
        <div className="max-w-screen-2xl mx-auto px-4 h-[68px] flex items-center justify-between gap-4">

          {/* Left: hamburger + title */}
          <div className="flex items-center gap-2 min-w-0">
            <button className="md:hidden p-1 rounded focus:outline-none focus:ring-2 focus:ring-white shrink-0"
              onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-blue-950/40">
              <LayoutDashboard size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight sm:text-base">iON CCTV</span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400 sm:block">Operations workspace</span>
            </span>
          </div>

          {/* Right: sync + user menu */}
          <div className="flex items-center gap-2 shrink-0">
            <SyncIcon />
            {isGitHub && (
              <button onClick={reloadFromGitHub} title="Reload from GitHub"
                className="p-1 rounded text-white/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white">
                <RefreshCw size={13} />
              </button>
            )}

            {/* User dropdown */}
            <div className="relative">
              <button onClick={() => setUserMenuOpen(v => !v)} aria-expanded={userMenuOpen} aria-haspopup="true"
                className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white rounded px-1.5 py-1">
                <span className="hidden sm:inline max-w-[80px] truncate">{currentUser?.name}</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs capitalize hidden sm:inline">
                  {currentUser?.role.replace('_', ' ')}
                </span>
                <ChevronDown size={11} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border py-1 z-50"
                  onBlur={() => setUserMenuOpen(false)}>
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-gray-800">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{currentUser?.role.replace('_', ' ')}</p>
                  </div>
                  {can('export_data') && (
                    <>
                      <button onClick={() => { exportBackup(data); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                        <Download size={13} /> Download Backup
                      </button>
                      {can('manage_access') && (
                        <label className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                          <Upload size={13} /> Restore Backup
                          <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                        </label>
                      )}
                    </>
                  )}
                  <div className="border-t mt-1">
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                      <LogOut size={13} /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden border-t border-white/10 bg-slate-900/80 md:block">
          <nav className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-1.5 px-4 py-2" aria-label="Main navigation">
            {visibleNavItems.map(item => (
              <NavLink key={item.to} to={item.to} end
                className={({ isActive }) => clsx(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                  isActive
                    ? 'border-sky-300/40 bg-sky-400/15 text-sky-100 shadow-sm'
                    : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.08] hover:text-white'
                )}>
                <item.icon size={14} />{item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-white/20 px-3 py-2 flex flex-col gap-0.5" aria-label="Mobile navigation">
            {visibleNavItems.map(item => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                  isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
                )}>
                <item.icon size={15} />{item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Sync error banner */}
        {syncStatus === 'error' && (
          <div className="bg-red-600 text-white text-xs px-4 py-1 flex items-center gap-2">
            <AlertCircle size={12} />
            Secure sync error: {syncError} — the server may not have saved this change.
          </div>
        )}
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-7 sm:px-6 lg:px-8">
        <PageExportActions />
        {children}
      </main>
    </div>
  );
}
