import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button, Card, Input, Select } from '../components/ui';
import { api, OrgMember } from '../lib/api';

export function TeamPage() {
  const { orgId, isAdmin } = useApp();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<OrgMember[]>([]);

  const load = () => api.getOrgMembers(orgId).then(setMembers).catch(() => setMembers([]));

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const invite = async () => {
    setError('');
    setMsg('');
    try {
      await api.inviteMember(orgId, email, role);
      setMsg(`Invited ${email} as ${role}`);
      setEmail('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="text-text-secondary text-sm">who has access and what they can do</p>
      </div>

      <Card>
        <h3 className="font-medium mb-3">Members</h3>
        <div className="space-y-2 mb-6">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm py-2 border-b border-border/50">
              <div>
                <p className="font-medium">{m.user.name}</p>
                <p className="text-text-secondary text-xs">{m.user.email}</p>
              </div>
              <span className="text-xs bg-surface px-2 py-1 rounded">{m.role}</span>
            </div>
          ))}
        </div>

        <h3 className="font-medium mb-3">Role cheat sheet</h3>
        <ul className="text-sm text-text-secondary space-y-1 mb-4">
          <li><strong>OWNER</strong> — everything</li>
          <li><strong>ADMIN</strong> — projects, queues, invites</li>
          <li><strong>MEMBER</strong> — create and manage jobs</li>
          <li><strong>VIEWER</strong> — read only</li>
        </ul>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              {['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
            <Button onClick={invite} className="col-span-2">Invite member</Button>
          </div>
        ) : (
          <p className="text-text-secondary text-sm">need admin to invite people</p>
        )}

        {msg && <p className="text-success text-sm mt-3">{msg}</p>}
        {error && <p className="text-danger text-sm mt-3">{error}</p>}
      </Card>
    </div>
  );
}
