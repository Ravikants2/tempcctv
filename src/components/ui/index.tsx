import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      {
        'bg-green-100 text-green-800': variant === 'success',
        'bg-yellow-100 text-yellow-800': variant === 'warning',
        'bg-red-100 text-red-800': variant === 'error',
        'bg-blue-100 text-blue-800': variant === 'info',
        'bg-gray-100 text-gray-700': variant === 'neutral',
      }
    )}>
      {children}
    </span>
  );
}

interface AlertProps {
  type: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  onClose?: () => void;
}

export function Alert({ type, children, onClose }: AlertProps) {
  const styles = {
    success: 'bg-green-50 border-green-400 text-green-800',
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    error: 'bg-red-50 border-red-400 text-red-800',
    info: 'bg-blue-50 border-blue-400 text-blue-800',
  };
  return (
    <div className={clsx('border-l-4 p-4 rounded-r-lg flex items-start gap-3', styles[type])} role="alert">
      <div className="flex-1 text-sm">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-60 hover:opacity-100" aria-label="Close">✕</button>
      )}
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  color?: string;
}

export function KPICard({ title, value, subtitle, onClick, icon, color = 'blue' }: KPICardProps) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50',
    green: 'border-green-500 bg-green-50',
    purple: 'border-purple-500 bg-purple-50',
    orange: 'border-orange-500 bg-orange-50',
    red: 'border-red-500 bg-red-50',
    teal: 'border-teal-500 bg-teal-50',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={clsx(
        'border-l-4 rounded-lg p-4 shadow-sm w-full text-left transition-shadow',
        colorMap[color] || colorMap.blue,
        onClick && 'hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500'
      )}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      aria-label={onClick ? `View details for ${title}` : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </Tag>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-xl shadow-xl w-full overflow-auto max-h-[90vh]', sizeMap[size])}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded" aria-label="Close modal">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', variant = 'danger' }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button
          onClick={onConfirm}
          className={clsx('px-4 py-2 text-sm text-white rounded-lg', variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800')}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
