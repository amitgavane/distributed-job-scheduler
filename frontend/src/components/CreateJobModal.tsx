import { useState } from 'react';
import { Button, Input, Select } from './ui';
import { api } from '../lib/api';

const HANDLERS = ['echo', 'sleep', 'fail', 'random_fail', 'process_data', 'send_email', 'http_request'];

interface Props {
  queueId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateJobModal({ queueId, onClose, onCreated }: Props) {
  const [type, setType] = useState('immediate');
  const [handler, setHandler] = useState('echo');
  const [payload, setPayload] = useState('{"message":"hello"}');
  const [delayMs, setDelayMs] = useState('5000');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cron, setCron] = useState('*/5 * * * *');
  const [batchItems, setBatchItems] = useState('[{"id":1},{"id":2}]');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [dependsOn, setDependsOn] = useState('');
  const [priority, setPriority] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const base: Record<string, unknown> = {
        queueId,
        handler,
        priority: parseInt(priority, 10),
      };
      if (idempotencyKey) base.idempotencyKey = idempotencyKey;
      if (dependsOn.trim()) base.dependsOn = dependsOn.split(',').map((s) => s.trim());

      if (type === 'batch') {
        await api.createJob('batch', { ...base, items: JSON.parse(batchItems) });
      } else if (type === 'delayed') {
        await api.createJob('delayed', { ...base, delayMs: parseInt(delayMs, 10), payload: JSON.parse(payload) });
      } else if (type === 'scheduled') {
        await api.createJob('scheduled', {
          ...base,
          scheduledAt: new Date(scheduledAt).toISOString(),
          payload: JSON.parse(payload),
        });
      } else if (type === 'recurring') {
        await api.createJob('recurring', { ...base, cronExpression: cron, payload: JSON.parse(payload) });
      } else {
        await api.createJob('immediate', { ...base, payload: JSON.parse(payload) });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-raised border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Create job</h3>

        <div className="space-y-3">
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="immediate">Immediate</option>
            <option value="delayed">Delayed</option>
            <option value="scheduled">Scheduled</option>
            <option value="recurring">Recurring (cron)</option>
            <option value="batch">Batch</option>
          </Select>

          <Select label="Handler" value={handler} onChange={(e) => setHandler(e.target.value)}>
            {HANDLERS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </Select>

          {type !== 'batch' && (
            <Input label="Payload (JSON)" value={payload} onChange={(e) => setPayload(e.target.value)} />
          )}
          {type === 'batch' && (
            <Input label="Batch items (JSON array)" value={batchItems} onChange={(e) => setBatchItems(e.target.value)} />
          )}
          {type === 'delayed' && (
            <Input label="Delay (ms)" type="number" value={delayMs} onChange={(e) => setDelayMs(e.target.value)} />
          )}
          {type === 'scheduled' && (
            <Input label="Scheduled at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          )}
          {type === 'recurring' && (
            <Input label="Cron expression" value={cron} onChange={(e) => setCron(e.target.value)} />
          )}

          <Input label="Priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <Input label="Idempotency key (optional)" value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} />
          <Input label="Depends on job IDs (comma-separated)" value={dependsOn} onChange={(e) => setDependsOn(e.target.value)} />
        </div>

        {error && <p className="text-danger text-sm mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <Button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
