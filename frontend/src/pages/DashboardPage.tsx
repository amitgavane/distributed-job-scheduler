import { useEffect, useState, useCallback, useRef } from 'react';
import { Activity, CheckCircle, Clock, Server, AlertTriangle, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from 'recharts';
import { api, MetricsSnapshot, ThroughputPoint, SystemEvent } from '../lib/api';
import { useApp } from '../context/AppContext';
import { StatCard, Card, Badge } from '../components/ui';
import { ChartBox } from '../components/ChartBox';
import { useWebSocket } from '../hooks/useWebSocket';
import { safeFormatTime } from '../utils/dates';
import { AUTHOR_LABEL } from '@codity/shared';

export function DashboardPage() {
  const { project } = useApp();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [m, t, e] = await Promise.all([
        api.getMetrics(),
        api.getThroughput(12),
        api.getEvents(15),
      ]);
      if (!mountedRef.current) return;
      setMetrics(m);
      setThroughput(Array.isArray(t) ? t : []);
      setEvents(Array.isArray(e) ? e : []);
    } catch {
      /* quiet */
    }
  }, []);

  useWebSocket({
    'job:completed': refresh,
    'job:created': refresh,
    'scheduler:tick': refresh,
    'job:dead_letter': refresh,
  });

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  const chartData = throughput.map((p) => ({
    time: safeFormatTime(p.hour, 'HH:mm', p.hour),
    completed: p.completed,
    failed: p.failed,
  }));
  const hasThroughputActivity = chartData.some((p) => p.completed > 0 || p.failed > 0);

  const barData = metrics?.queueHealth
    ? Object.entries(metrics.queueHealth).map(([name, s]) => ({
        name,
        completed: s.completed,
        failed: s.failed,
        deadLetter: s.deadLetter,
      }))
    : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-text-secondary text-sm">{project?.name ?? 'select a project'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="jobs/min" value={metrics?.jobsPerMinute ?? 0} icon={<Zap size={24} />} />
        <StatCard label="success %" value={`${metrics?.successRate ?? 0}%`} icon={<CheckCircle size={24} />} />
        <StatCard label="workers up" value={metrics?.activeWorkers ?? 0} icon={<Server size={24} />} />
        <StatCard label="avg latency" value={`${metrics?.avgLatencyMs ?? 0}ms`} icon={<Clock size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-medium mb-4 flex items-center gap-2"><Activity size={18} className="text-brand-500" />Throughput</h3>
          {!hasThroughputActivity ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-sm text-text-secondary">
              <p>no job history in the last 12 hours</p>
              <p className="text-xs">run <code className="px-1.5 py-0.5 bg-surface rounded">npm run db:seed -w backend</code> to load sample data</p>
            </div>
          ) : (
            <ChartBox height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={12} interval="preserveStartEnd" />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>}
                />
                <Line type="monotone" dataKey="completed" name="completed" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" name="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartBox>
          )}
        </Card>

        <Card>
          <h3 className="font-medium mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-warning" />Queues</h3>
          <div className="space-y-3">
            {(project?.queues || []).map((q) => {
              const health = metrics?.queueHealth?.[q.name];
              return (
                <div key={q.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{q.name}</p>
                    <p className="text-xs text-text-secondary">{health?.queued ?? 0} queued · {health?.running ?? 0} running</p>
                  </div>
                  <Badge status={q.status} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {barData.length > 0 && (
          <Card>
            <h3 className="font-medium mb-4">by queue</h3>
            <ChartBox height={200}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} />
                <Bar dataKey="completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="deadLetter" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartBox>
          </Card>
        )}

        <Card>
          <h3 className="font-medium mb-4">Recent events</h3>
          <div className="space-y-1 max-h-48 overflow-auto font-mono text-xs">
            {events.map((e) => (
              <div key={e.id} className="flex gap-2 py-1">
                <span className="text-text-secondary shrink-0">{safeFormatTime(e.createdAt, 'HH:mm:ss')}</span>
                <span className="text-brand-600">{e.type}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-text-secondary">no events yet</p>}
          </div>
        </Card>
      </div>

      <p className="text-xs text-text-secondary text-center">{AUTHOR_LABEL}</p>
    </div>
  );
}
