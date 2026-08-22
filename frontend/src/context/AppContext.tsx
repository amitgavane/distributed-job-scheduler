import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, Organization, ProjectDetail } from '../lib/api';
import { useAuth } from './AuthContext';
import { IS_DEMO } from '../lib/isDemo';
import { DEMO_ORG_ID, DEMO_PROJECT_BILLING } from '../demo/fixtures';

interface AppContextType {
  organizations: Organization[];
  orgId: string;
  projectId: string;
  project: ProjectDetail | null;
  role: string;
  setOrgId: (id: string) => void;
  setProjectId: (id: string) => void;
  refresh: () => Promise<void>;
  refreshProject: () => Promise<void>;
  loading: boolean;
  canMutate: boolean;
  isAdmin: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEY = 'scheduler-context';

function clearStoredContext() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgIdState] = useState('');
  const [projectId, setProjectIdState] = useState('');
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const membership = organizations.find((o) => o.id === orgId);
  const role = membership?.role ?? (loading ? '' : 'VIEWER');
  const canMutate = !IS_DEMO && ['MEMBER', 'ADMIN', 'OWNER'].includes(role);
  const isAdmin = ['ADMIN', 'OWNER'].includes(role);

  const persist = (oid: string, pid: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ orgId: oid, projectId: pid }));
  };

  const resetState = useCallback(() => {
    setOrganizations([]);
    setOrgIdState('');
    setProjectIdState('');
    setProject(null);
  }, []);

  const setOrgId = (id: string) => {
    setOrgIdState(id);
    setProjectIdState('');
    setProject(null);
    persist(id, '');

    api.getProjects(id).then((projects) => {
      const first = projects[0]?.id || '';
      if (first) {
        setProjectIdState(first);
        persist(id, first);
        api.getProject(first).then(setProject).catch(() => setProject(null));
      }
    });
  };

  const setProjectId = (id: string) => {
    setProjectIdState(id);
    persist(orgId, id);
  };

  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    try {
      setProject(await api.getProject(projectId));
    } catch {
      setProject(null);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      resetState();
      setLoading(false);
      return;
    }

    try {
      const orgs = await api.getOrganizations();
      setOrganizations(orgs);

      const stored = localStorage.getItem(STORAGE_KEY);
      let selectedOrg = orgs[0]?.id || '';
      let selectedProject = '';

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (orgs.some((o) => o.id === parsed.orgId)) selectedOrg = parsed.orgId;
        } catch {
          clearStoredContext();
        }
      } else if (IS_DEMO) {
        selectedOrg = DEMO_ORG_ID;
      }

      if (selectedOrg) {
        const projects = await api.getProjects(selectedOrg);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (projects.some((p) => p.id === parsed.projectId)) selectedProject = parsed.projectId;
          } catch {
            /* ignore */
          }
        }
        if (!selectedProject && projects.length) selectedProject = projects[0].id;
        if (IS_DEMO && projects.some((p) => p.id === DEMO_PROJECT_BILLING)) {
          selectedProject = DEMO_PROJECT_BILLING;
        }

        setOrgIdState(selectedOrg);
        setProjectIdState(selectedProject);
        persist(selectedOrg, selectedProject);

        if (selectedProject) {
          setProject(await api.getProject(selectedProject));
        } else {
          setProject(null);
        }
      } else {
        setOrgIdState('');
        setProjectIdState('');
        setProject(null);
      }
    } catch {
      resetState();
      clearStoredContext();
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, resetState]);

  useEffect(() => {
    if (!isAuthenticated) {
      resetState();
      clearStoredContext();
      setLoading(false);
      return;
    }

    setLoading(true);
    refresh();
  }, [isAuthenticated, refresh, resetState]);

  useEffect(() => {
    if (!projectId || loading) return;
    api.getProject(projectId).then(setProject).catch(() => setProject(null));
  }, [projectId, loading]);

  return (
    <AppContext.Provider
      value={{
        organizations,
        orgId,
        projectId,
        project,
        role,
        setOrgId,
        setProjectId,
        refresh,
        refreshProject,
        loading,
        canMutate,
        isAdmin,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
