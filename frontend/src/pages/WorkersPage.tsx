import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Server, Cpu } from 'lucide-react';
import { api, Worker } from '../lib/api';
import { Badge, Card, Spinner, EmptyState } from '../components/ui';
import { WorkerDetailModal } from '../components/WorkerDetailModal';
import { useWebSocket } from '../hooks/useWebSocket';

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setWorkers(await api.getWorkers()); } finally { setLoading(false); }
  }, []);

  useWebSocket({ 'job:claimed': load, 'job:completed': load, 'worker:registered': load });

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Workers</h2>
        <p className="text-text-secondary text-sm">pollers registered with the API</p>
      </div>

      {loading ? <Spinner /> : workers.length === 0 ? (
        <EmptyState message="no workers online" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id} className="cursor-pointer hover:border-brand-500/50 transition-colors" onClick={() => setSelectedId(worker.id)}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface rounded-lg flex items-center justify-center">
                    <Server size={20} className="text-brand-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{worker.hostname}</p>
                    <p className="text-xs text-text-secondary font-mono">{worker.id.slice(0, 8)}</p>
                    {worker.shardKey && <p className="text-xs text-text-secondary">shard: {worker.shardKey}</p>}
                  </div>
                </div>
                <Badge status={worker.status} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Cpu size={14} className="text-text-secondary" />
                <span>{worker.activeJobs}/{worker.concurrency} jobs</span>
                <span className="text-text-secondary ml-auto">{formatDistanceToNow(new Date(worker.lastSeenAt), { addSuffix: true })}</span>
              </div>
              <div className="mt-3 w-full bg-surface rounded-full h-1.5">
                <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (worker.activeJobs / worker.concurrency) * 100)}%` }} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedId && <WorkerDetailModal workerId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
