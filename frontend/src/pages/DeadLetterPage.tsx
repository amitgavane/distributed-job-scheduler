import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { RotateCcw } from 'lucide-react';
import { api, DeadLetterEntry } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, Select, Spinner, EmptyState } from '../components/ui';
import { Pagination } from '../components/Pagination';

const DLQ_QUEUE_PREFERENCE = [
  'webhooks',
  'stripe-events',
  'default',
  'emails',
  'dunning',
  'etl',
  'reports',
];

function pickDefaultDlqQueue(queues: { id: string; name: string }[]) {
  for (const name of DLQ_QUEUE_PREFERENCE) {
    const match = queues.find((q) => q.name === name);
    if (match) return match.id;
  }
  return queues[0]?.id ?? '';
}

export function DeadLetterPage() {
  const { project, canMutate } = useApp();
  const queues = project?.queues || [];
  const [selectedQueue, setSelectedQueue] = useState('');
  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // NEW: State to handle the bulk replay loading UX
  const [isReplayingAll, setIsReplayingAll] = useState(false);

  const load = useCallback(async () => {
    if (!selectedQueue) return;
    setLoading(true);
    try {
      const result = await api.getDeadLetter(selectedQueue, {
        page: String(page),
        limit: '10',
      });
      setEntries(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [selectedQueue, page]);

  // NEW: Function to handle the bulk replay action safely
  const handleReplayAll = async () => {
    if (!selectedQueue) return;
    
    // Optional: Add a confirmation dialog for safety in production
    if (!window.confirm(`Are you sure you want to replay all ${total} failed jobs in this queue?`)) return;

    setIsReplayingAll(true);
    try {
      // Call our new Phase 6 API endpoint
      await api.bulkRetryDeadLetter(selectedQueue);
      // Reload the page to show the empty DLQ
      await load();
    } catch (error) {
      console.error('Failed to replay all jobs:', error);
      alert('Failed to process bulk replay. Please check the logs.');
    } finally {
      setIsReplayingAll(false);
    }
  };

  useEffect(() => {
    if (!queues.length) {
      setSelectedQueue('');
      return;
    }
    setSelectedQueue((prev) => {
      if (prev && queues.some((q) => q.id === prev)) return prev;
      return pickDefaultDlqQueue(queues);
    });
  }, [queues]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dead letter queue</h2>
          <p className="text-text-secondary text-sm">jobs that won't retry anymore</p>
        </div>
      </div>

      {}
      <div className="flex items-center justify-between bg-surface p-4 rounded-lg border border-border">
        <div className="w-64">
          <Select value={selectedQueue} onChange={(e) => { setSelectedQueue(e.target.value); setPage(1); }}>
            {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </Select>
        </div>
        
        {}
        {canMutate && entries.length > 0 && (
          <Button 
            onClick={handleReplayAll} 
            disabled={isReplayingAll || loading}
          >
            <RotateCcw size={16} className={`inline mr-2 ${isReplayingAll ? 'animate-spin' : ''}`} />
            {isReplayingAll ? 'Replaying...' : `Replay All (${total})`}
          </Button>
        )}
      </div>

      {loading ? <Spinner /> : entries.length === 0 ? (
        <EmptyState message="nothing here yet" />
      ) : (
        <>
          <div className="space-y-4">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-sm">{entry.handler}</span>
                      <Badge status="DEAD_LETTER" />
                      <span className="text-xs text-text-secondary">{entry.totalAttempts} attempts</span>
                    </div>
                    <p className="text-danger text-sm mb-2">{entry.lastError}</p>
                    {entry.failureSummary && (
                      <div className="bg-surface p-3 rounded-lg text-sm mb-2">
                        <p className="text-text-secondary text-xs mb-1">notes</p>
                        {entry.failureSummary}
                      </div>
                    )}
                    <p className="text-xs text-text-secondary">{format(new Date(entry.failedAt), 'MMM d yyyy HH:mm')}</p>
                  </div>
                  {canMutate && (
                    <Button variant="secondary" onClick={() => api.retryJob(entry.jobId).then(load)}>
                      <RotateCcw size={16} className="inline mr-1" />Retry
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}