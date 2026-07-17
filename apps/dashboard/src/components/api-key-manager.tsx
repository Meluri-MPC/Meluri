'use client';

import { useState } from 'react';
import { Plus, Copy, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Key {
  id: string; name: string; keyPrefix: string; status: string; lastUsedAt: string | null; createdAt: string;
  mpcOrg?: { appName: string; walletCount: number } | null;
}

export function ApiKeyManager({ developerId, initialKeys }: { developerId: string; initialKeys: Key[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keys, setKeys] = useState<Key[]>(initialKeys);

  async function handleCreate() {
    if (!name.trim() || keys.filter((k) => k.status === 'Active').length >= 5) return;
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setNewKey(data.rawKey);
      setKeys([data, ...keys]);
      setName('');
      setShowCreate(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke');
      setKeys(keys.map((k) => (k.id === keyId ? { ...k, status: 'Revoked' } : k)));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        disabled={keys.filter((k) => k.status === 'Active').length >= 5}
        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-white/90 text-black disabled:opacity-40 rounded-[14px] text-sm font-medium transition-colors"
      >
        <Plus size={16} /> New Key
      </button>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Create API Key</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Key name (e.g. production, staging)"
              className="w-full bg-[#111111] border border-white/[0.08] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-white/20 text-white placeholder:text-white/25"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white/80 rounded-[14px] transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !name.trim()} className="px-4 py-2 bg-white hover:bg-white/90 text-black disabled:opacity-40 rounded-[14px] text-sm font-medium transition-colors">
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newKey && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-6 w-[28rem]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-emerald-400">API Key Created</h2>
              <button onClick={() => setNewKey(null)}><X size={20} className="text-white/40" /></button>
            </div>
            <p className="text-sm text-white/60 mb-3">Copy this key now. You won&apos;t be able to see it again.</p>
            <div className="bg-black border border-white/[0.08] rounded-lg p-3 flex items-center justify-between mb-4">
              <code className="text-sm text-white/80 break-all mr-2">{newKey}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); toast.success('Copied!'); }}
                className="p-1.5 hover:bg-white/[0.06] rounded"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-white/40" />}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="w-full py-2 bg-white/[0.06] hover:bg-white/[0.10] rounded-[14px] text-sm text-white/80 transition-colors">I&apos;ve saved my key</button>
          </div>
        </div>
      )}
    </>
  );
}
