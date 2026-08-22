import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api, JobDetail } from '../lib/api';
import { Badge, Button, Card, Spinner } from './ui';

export function JobDetailModal({
  jobId,
  onClose,
}: {
  jobId: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getJob(jobId).then(setJob).finally(() => setLoading(false));
  }, [jobId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Job Details</h3>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {loading ? (
          <Spinner />
        ) : job ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-secondary">ID</p>
                <p className="font-mono text-xs break-all">{job.id}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <Badge status={job.status} />
              </div>
              <div>
                <p className="text-text-secondary">Handler</p>
                <p className="font-mono">{job.handler}</p>
              </div>
              <div>
                <p className="text-text-secondary">Attempts</p>
                <p>{job.attempt}/{job.maxAttempts}</p>
              </div>
            </div>

            <div>
              <p className="text-text-secondary text-sm mb-1">Payload</p>
              <pre className="bg-surface p-3 rounded-lg text-xs font-mono overflow-auto">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>

            {job.lastError && (
              <div>
                <p className="text-text-secondary text-sm mb-1">Last Error</p>
                <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg">{job.lastError}</p>
              </div>
            )}

            {job.deadLetter?.failureSummary && (
              <div>
                <p className="text-text-secondary text-sm mb-1">failure note</p>
                <p className="text-sm bg-surface p-3 rounded-lg">{job.deadLetter.failureSummary}</p>
              </div>
            )}

            <div>
              <p className="text-text-secondary text-sm mb-2">Execution History</p>
              <div className="space-y-2">
                {job.executions.map((exec) => (
                  <div key={exec.id} className="flex items-center gap-3 text-sm bg-surface p-2 rounded-lg">
                    <Badge status={exec.status} />
                    <span>Attempt {exec.attempt}</span>
                    {exec.durationMs && <span className="text-text-secondary">{exec.durationMs}ms</span>}
                    {exec.error && <span className="text-danger truncate">{exec.error}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-text-secondary text-sm mb-2">Logs</p>
              <div className="space-y-1 max-h-48 overflow-auto font-mono text-xs">
                {job.logs.map((log) => (
                  <div key={log.id} className="flex gap-2 py-1">
                    <span className="text-text-secondary shrink-0">
                      {format(new Date(log.createdAt), 'HH:mm:ss')}
                    </span>
                    <span className={
                      log.level === 'ERROR' ? 'text-danger' :
                      log.level === 'WARN' ? 'text-warning' : 'text-text-secondary'
                    }>
                      [{log.level}]
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-danger">Failed to load job</p>
        )}
      </Card>
    </div>
  );
}
