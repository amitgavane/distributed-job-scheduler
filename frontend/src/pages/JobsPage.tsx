import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { RefreshCw, RotateCcw, XCircle, Eye, Plus, Search } from 'lucide-react';
import { api, Job } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, Select, Spinner, EmptyState } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { CreateJobModal } from '../components/CreateJobModal';
import { JobDetailModal } from '../components/JobDetailModal';
import { useWebSocket } from '../hooks/useWebSocket';

export function JobsPage() {
  const { project, canMutate } = useApp();
  const queues = project?.queues || [];
  const [selectedQueue, setSelectedQueue] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // NEW: Search state and debounce state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // NEW: Debounce effect prevents spamming the API while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400); // Wait 400ms after last keystroke
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadJobs = useCallback(async () => {
    if (!selectedQueue) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      
      // NEW: Append search parameter if it exists
      if (debouncedSearch) params.search = debouncedSearch;
      
      const result = await api.getJobs(selectedQueue, params);
      setJobs(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [selectedQueue, statusFilter, page, debouncedSearch]);

  useWebSocket({ 
    'job:created': loadJobs, 
    'job:completed': loadJobs, 
    'job:claimed': loadJobs, 
    'job:dead_letter': loadJobs 
  });

  useEffect(() => {
    if (!queues.length) {
      setSelectedQueue('');
      return;
    }
    const stripe = queues.find(
      (q) => q.name === 'stripe-events' || q.name.startsWith('stripe')
    );
    setSelectedQueue((prev) => {
      if (prev && queues.some((q) => q.id === prev)) return prev;
      return (stripe ?? queues[0]).id;
    });
  }, [queues]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Jobs</h2>
          <p className="text-text-secondary text-sm">{project?.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadJobs}><RefreshCw size={16} className="inline mr-1" />Refresh</Button>
          {canMutate && selectedQueue && (
            <Button onClick={() => setShowCreate(true)}><Plus size={16} className="inline mr-1" />New job</Button>
          )}
        </div>
      </div>

      {/* UPDATED: Added Search Bar to the filter row */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[250px] relative">
          <label className="block text-xs font-medium text-text-secondary mb-1">Search Jobs</label>
          <Search className="absolute left-3 top-[28px] text-text-secondary" size={16} />
          <input
            type="text"
            placeholder="Search by ID or Handler..."
            className="w-full pl-9 pr-4 py-2 bg-transparent border border-border rounded-md text-sm focus:outline-none focus:border-primary transition-colors"
            value={searchQuery}
            onChange={(e) => { 
              setSearchQuery(e.target.value); 
              setPage(1); // Reset to page 1 on new search
            }}
          />
        </div>
        <Select label="Queue" value={selectedQueue} onChange={(e) => { setSelectedQueue(e.target.value); setPage(1); }}>
          {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </Select>
        <Select label="Status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All</option>
          {['QUEUED', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>

      {loading ? <Spinner /> : jobs.length === 0 ? (
        <EmptyState message={debouncedSearch ? "No jobs match your search" : "No jobs in this queue"} />
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3">Handler</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="px-4 py-3 font-mono text-xs">{job.handler}</td>
                  <td className="px-4 py-3"><Badge status={job.status} /></td>
                  <td className="px-4 py-3 text-text-secondary">{job.type}</td>
                  <td className="px-4 py-3">{job.attempt}/{job.maxAttempts}</td>
                  <td className="px-4 py-3">{job.durationMs ? `${job.durationMs}ms` : '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{format(new Date(job.createdAt), 'MMM d HH:mm')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedJobId(job.id)} className="p-1.5 hover:bg-surface-overlay rounded"><Eye size={16} /></button>
                      {canMutate && ['FAILED', 'DEAD_LETTER'].includes(job.status) && (
                        <button onClick={() => api.retryJob(job.id).then(loadJobs)} className="p-1.5 hover:bg-surface-overlay rounded"><RotateCcw size={16} /></button>
                      )}
                      {canMutate && !['COMPLETED', 'DEAD_LETTER', 'CANCELLED'].includes(job.status) && (
                        <button onClick={() => api.cancelJob(job.id).then(loadJobs)} className="p-1.5 hover:bg-surface-overlay rounded"><XCircle size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4 mt-2">
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
          </div>
        </Card>
      )}

      {showCreate && selectedQueue && (
        <CreateJobModal queueId={selectedQueue} onClose={() => setShowCreate(false)} onCreated={loadJobs} />
      )}
      {selectedJobId && <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />}
    </div>
  );
}