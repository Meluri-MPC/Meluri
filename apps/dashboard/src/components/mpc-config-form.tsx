'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

export function MpcConfigForm({ apiKeyId }: { apiKeyId: string }) {
  const [appName, setAppName] = useState('');
  const [domains, setDomains] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    if (!appName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/mpc/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKeyId,
          appName: appName.trim(),
          allowedDomains: domains.split(',').map((d) => d.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('MPC provisioned! Refresh to see changes.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleProvision} className="flex gap-3 items-end">
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1">App Name</label>
        <input
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          placeholder="My DApp"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meluri-500"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1">Allowed Domains (comma-separated)</label>
        <input
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder="myapp.xyz, localhost:3000"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meluri-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !appName.trim()}
        className="px-4 py-2 bg-meluri-600 hover:bg-meluri-700 disabled:opacity-50 rounded-lg text-sm whitespace-nowrap"
      >
        {loading ? 'Provisioning...' : 'Provision MPC'}
      </button>
    </form>
  );
}
