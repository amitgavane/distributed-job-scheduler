import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Input } from '../components/ui';
import { AUTHOR_LABEL, AUTHOR_NAME, AUTHOR_REGISTRATION } from '@codity/shared';
import { IS_DEMO, DEMO_GITHUB_URL } from '../lib/isDemo';
import { DemoBanner } from '../components/DemoBanner';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(IS_DEMO ? 'admin@test.local' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (IS_DEMO && isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {IS_DEMO && <DemoBanner />}
      <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Job Scheduler</h1>
          <p className="text-text-secondary text-sm mt-2">{AUTHOR_NAME}</p>
          <p className="text-text-secondary text-xs">{AUTHOR_REGISTRATION}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-xs text-text-secondary text-center mt-6">
          {IS_DEMO ? (
            <>
              Visual demo — any email/password works.{' '}
              <a href={DEMO_GITHUB_URL} className="text-brand-600 underline" target="_blank" rel="noreferrer">
                Full app on GitHub
              </a>
            </>
          ) : (
            <>{AUTHOR_LABEL} · demo: admin@test.local / password123</>
          )}
        </p>
      </Card>
      </div>
    </div>
  );
}
