import { useState } from 'react';
import { Button, Input, Select } from './ui';
import { api, Queue, RetryPolicy } from '../lib/api';

interface Props {
  queue: Queue;
  policies: RetryPolicy[];
  onClose: () => void;
  onSaved: () => void;
}

export function QueueEditModal({ queue, policies, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: queue.name,
    description: queue.description || '',
    priority: String(queue.priority),
    concurrency: String(queue.concurrency),
    rateLimitPerMin: queue.rateLimitPerMin ? String(queue.rateLimitPerMin) : '',
    shardKey: queue.shardKey || '',
    retryPolicyId: queue.retryPolicy?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      await api.updateQueue(queue.id, {
        name: form.name,
        description: form.description,
        priority: parseInt(form.priority, 10),
        concurrency: parseInt(form.concurrency, 10),
        rateLimitPerMin: form.rateLimitPerMin ? parseInt(form.rateLimitPerMin, 10) : undefined,
        shardKey: form.shardKey || undefined,
        retryPolicyId: form.retryPolicyId || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Edit queue: {queue.name}</h3>
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Priority" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <Input label="Concurrency" type="number" value={form.concurrency} onChange={(e) => setForm({ ...form, concurrency: e.target.value })} />
          <Input label="Rate limit / min" type="number" value={form.rateLimitPerMin} onChange={(e) => setForm({ ...form, rateLimitPerMin: e.target.value })} />
          <Input label="Shard key" value={form.shardKey} onChange={(e) => setForm({ ...form, shardKey: e.target.value })} />
          <Select label="Retry policy" value={form.retryPolicyId} onChange={(e) => setForm({ ...form, retryPolicyId: e.target.value })}>
            <option value="">Default</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.strategy})</option>
            ))}
          </Select>
        </div>
        {error && <p className="text-danger text-sm mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <Button onClick={save} disabled={loading}>Save</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
