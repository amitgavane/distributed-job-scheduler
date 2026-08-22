import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { Badge, Button, Card, Spinner } from './ui';

interface WorkerDetail {
  id: string;
  hostname: string;
  status: string;
  concurrency: number;
  activeJobs: number;
  shardKey?: string;
  heartbeats: { id: string; activeJobs: number; memoryMb?: number; createdAt: string }[];
  executions: { id: string; attempt: number; status: string; startedAt: string; durationMs?: number }[];
}

export function WorkerDetailModal({ workerId, onClose }: { workerId: string; onClose: () => void }) {
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWorker(workerId).then(setWorker).finally(() => setLoading(false));
  }, [workerId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between mb-4">
          <h3 className="font-semibold">Worker detail</h3>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {loading ? (
          <Spinner />
        ) : worker ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-text-secondary">Host</span><p>{worker.hostname}</p></div>
              <div><Badge status={worker.status} /></div>
              <div><span className="text-text-secondary">Jobs</span><p>{worker.activeJobs}/{worker.concurrency}</p></div>
              {worker.shardKey && <div><span className="text-text-secondary">Shard</span><p>{worker.shardKey}</p></div>}
            </div>
            <div>
              <p className="text-text-secondary mb-2">Recent heartbeats</p>
              <div className="space-y-1 max-h-32 overflow-auto font-mono text-xs">
                {worker.heartbeats.map((h) => (
                  <div key={h.id}>{format(new Date(h.createdAt), 'HH:mm:ss')} — {h.activeJobs} jobs {h.memoryMb ? `· ${h.memoryMb}MB` : ''}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-text-secondary mb-2">Recent executions</p>
              <div className="space-y-1">
                {worker.executions.map((e) => (
                  <div key={e.id} className="flex gap-2 items-center">
                    <Badge status={e.status} />
                    <span>#{e.attempt}</span>
                    {e.durationMs && <span className="text-text-secondary">{e.durationMs}ms</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-danger">Failed to load</p>
        )}
      </Card>
    </div>
  );
}
