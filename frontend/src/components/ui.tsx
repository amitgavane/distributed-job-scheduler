import clsx from 'clsx';
import { ReactNode } from 'react';

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={clsx('bg-surface-raised border border-border rounded-xl p-5', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: 'bg-info/20 text-info',
    SCHEDULED: 'bg-brand-50 text-brand-700',
    CLAIMED: 'bg-warning/20 text-warning',
    RUNNING: 'bg-warning/20 text-warning',
    COMPLETED: 'bg-success/20 text-success',
    FAILED: 'bg-danger/20 text-danger',
    DEAD_LETTER: 'bg-danger/30 text-danger',
    CANCELLED: 'bg-text-secondary/20 text-text-secondary',
    ACTIVE: 'bg-success/20 text-success',
    PAUSED: 'bg-warning/20 text-warning',
    ONLINE: 'bg-success/20 text-success',
    OFFLINE: 'bg-danger/20 text-danger',
    DRAINING: 'bg-warning/20 text-warning',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono',
        colors[status] || 'bg-surface-overlay text-text-secondary'
      )}
    >
      {status}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-secondary text-sm">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
          {sub && <p className="text-text-secondary text-xs mt-1">{sub}</p>}
        </div>
        {icon && <div className="text-brand-500 opacity-60">{icon}</div>}
      </div>
    </Card>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white',
    secondary: 'bg-surface-overlay hover:bg-border text-text-primary border border-border',
    danger: 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30',
    ghost: 'hover:bg-surface-overlay text-text-secondary',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && <label className="block text-sm text-text-secondary mb-1">{label}</label>}
      <input
        {...props}
        className={clsx(
          'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
          props.className
        )}
      />
    </div>
  );
}

export function Select({
  label,
  children,
  ...props
}: { label?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      {label && <label className="block text-sm text-text-secondary mb-1">{label}</label>}
      <select
        {...props}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
      >
        {children}
      </select>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-text-secondary">
      <p>{message}</p>
    </div>
  );
}
