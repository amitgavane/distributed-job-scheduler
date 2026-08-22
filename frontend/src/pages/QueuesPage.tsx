import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Plus, Pencil } from 'lucide-react';
import { api, Queue, RetryPolicy } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, Input, Spinner, StatCard } from '../components/ui';
import { QueueEditModal } from '../components/QueueEditModal';

export function QueuesPage() {
  const { project, projectId, canMutate, refreshProject } = useApp();
  const queues = project?.queues || [];
  const [policies, setPolicies] = useState<RetryPolicy[]>([]);
  const [stats, setStats] = useState<Record<string, Awaited<ReturnType<typeof api.getQueueStats>>>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [newQueue, setNewQueue] = useState({ name: '', description: '', concurrency: '5', priority: '0', shardKey: '', rateLimit: '' });

  const load = useCallback(async () => {
    if (!projectId || !queues.length) return;
    const pols = await api.getRetryPolicies();
    setPolicies(pols);
    const queueStats = await Promise.all(queues.map((q) => api.getQueueStats(q.id)));
    const map: typeof stats = {};
    queues.forEach((q, i) => { map[q.id] = queueStats[i]; });
    setStats(map);
  }, [projectId, queues]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    await api.createQueue({
      projectId,
      name: newQueue.name,
      description: newQueue.description,
      concurrency: parseInt(newQueue.concurrency, 10),
      priority: parseInt(newQueue.priority, 10),
      shardKey: newQueue.shardKey || undefined,
      rateLimitPerMin: newQueue.rateLimit ? parseInt(newQueue.rateLimit, 10) : undefined,
      retryPolicyId: policies[0]?.id,
    });
    setShowCreate(false);
    await refreshProject();
    load();
  };

  if (!project) return <Spinner />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Queues</h2>
          <p className="text-text-secondary text-sm">concurrency, retries, rate limits</p>
        </div>
        {canMutate && (
          <Button onClick={() => setShowCreate(true)}><Plus size={16} className="inline mr-1" />New queue</Button>
        )}
      </div>

      {showCreate && (
        <Card>
          <h3 className="font-medium mb-4">Create queue</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={newQueue.name} onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value })} />
            <Input label="Description" value={newQueue.description} onChange={(e) => setNewQueue({ ...newQueue, description: e.target.value })} />
            <Input label="Concurrency" type="number" value={newQueue.concurrency} onChange={(e) => setNewQueue({ ...newQueue, concurrency: e.target.value })} />
            <Input label="Priority" type="number" value={newQueue.priority} onChange={(e) => setNewQueue({ ...newQueue, priority: e.target.value })} />
            <Input label="Shard key" value={newQueue.shardKey} onChange={(e) => setNewQueue({ ...newQueue, shardKey: e.target.value })} />
            <Input label="Rate limit/min" type="number" value={newQueue.rateLimit} onChange={(e) => setNewQueue({ ...newQueue, rateLimit: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleCreate}>Create</Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {queues.map((queue) => {
          const qStats = stats[queue.id];
          return (
            <Card key={queue.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{queue.name}</h3>
                    <Badge status={queue.status} />
                    {queue.shardKey && <span className="text-xs text-text-secondary">shard:{queue.shardKey}</span>}
                  </div>
                  {queue.description && <p className="text-text-secondary text-sm mt-1">{queue.description}</p>}
                </div>
                {canMutate && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditQueue(queue)}><Pencil size={14} className="inline mr-1" />Edit</Button>
                    {queue.status === 'ACTIVE' ? (
                      <Button variant="secondary" onClick={() => api.pauseQueue(queue.id).then(refreshProject)}><Pause size={14} className="inline mr-1" />Pause</Button>
                    ) : (
                      <Button variant="secondary" onClick={() => api.resumeQueue(queue.id).then(refreshProject)}><Play size={14} className="inline mr-1" />Resume</Button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 text-sm mb-2">
                <span>priority: {queue.priority}</span>
                <span>concurrency: {queue.concurrency}</span>
                <span>rate: {queue.rateLimitPerMin || '∞'}/min</span>
                <span>retry: {queue.retryPolicy?.name || 'default'}</span>
              </div>
              {qStats && (
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard label="Queued" value={qStats.queued} />
                  <StatCard label="Running" value={qStats.running} />
                  <StatCard label="Done" value={qStats.completed} />
                  <StatCard label="Failed" value={qStats.failed} />
                  <StatCard label="DLQ" value={qStats.deadLetter} />
                  <StatCard label="/min" value={qStats.throughputPerMinute} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {editQueue && (
        <QueueEditModal queue={editQueue} policies={policies} onClose={() => setEditQueue(null)} onSaved={() => { refreshProject(); load(); }} />
      )}
    </div>
  );
}
