import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Server,
  Archive,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, Project } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { AUTHOR_LABEL, AUTHOR_NAME, AUTHOR_REGISTRATION } from '@codity/shared';
import { IS_DEMO } from '../lib/isDemo';
import { DemoBanner } from './DemoBanner';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/jobs', icon: ListTodo, label: 'Jobs' },
  { to: '/queues', icon: Settings, label: 'Queues' },
  { to: '/workers', icon: Server, label: 'Workers' },
  { to: '/dead-letter', icon: Archive, label: 'DLQ' },
  { to: '/team', icon: Users, label: 'Team' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { organizations, orgId, projectId, setOrgId, setProjectId, role, refreshProject } = useApp();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);

  const { subscribe } = useWebSocket({
    'job:created': refreshProject,
    'job:completed': refreshProject,
    'job:claimed': refreshProject,
    'job:dead_letter': refreshProject,
    'scheduler:tick': refreshProject,
  });

  useEffect(() => {
    if (orgId) api.getProjects(orgId).then(setProjects);
  }, [orgId]);

  useEffect(() => {
    if (projectId) subscribe('subscribe:project', projectId);
  }, [projectId, subscribe]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-surface-raised border-r border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <h1 className="font-semibold">Job Scheduler</h1>
          <p className="text-xs text-text-secondary mt-1">{AUTHOR_NAME}</p>
          <p className="text-xs text-text-secondary">{AUTHOR_REGISTRATION}</p>
          {role && <p className="text-xs text-text-secondary mt-1">{role}</p>}
        </div>

        <div className="p-3 border-b border-border space-y-2">
          <select
            className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select
            className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <p className="text-xs text-text-secondary truncate">{user?.email}</p>
          <p className="text-[10px] text-text-secondary/80 mt-1">{AUTHOR_LABEL}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-danger mt-2"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col">
        {IS_DEMO && <DemoBanner />}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
