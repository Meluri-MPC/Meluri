'use client';

import { useState } from 'react';
import { VelumxMPC } from '@velumx/mpc';
import { useBalance, useTransactions } from '@velumx/mpc/react';

const velumx = new VelumxMPC({
  apiKey: process.env.NEXT_PUBLIC_VELUMX_API_KEY || 'vx_sk_demo',
  auth: {
    async getSession() {
      const s = localStorage.getItem('velumx_demo_session');
      return s ? JSON.parse(s) : null;
    },
    async login() {
      const session = { userId: `demo-${Date.now()}`, sessionToken: 'demo-token' };
      localStorage.setItem('velumx_demo_session', JSON.stringify(session));
      return session;
    },
    async logout() {
      localStorage.removeItem('velumx_demo_session');
    },
  },
  network: 'testnet',
});

export function WalletSection() {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try { const w = await velumx.login(); setWallet(w); } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  if (!wallet) {
    return (
      <div>
        <button onClick={handleLogin} disabled={loading} style={{ padding: '12px 24px', fontSize: 16 }}>
          {loading ? 'Loading...' : 'Login with VelumX'}
        </button>
      </div>
    );
  }

  return <WalletData wallet={wallet} onLogout={() => { velumx.logout(); setWallet(null); }} />;
}

function WalletData({ wallet, onLogout }: { wallet: any; onLogout: () => void }) {
  const { data: balance } = useBalance({ address: wallet.stxAddress });
  const { data: txData } = useTransactions({ address: wallet.stxAddress, limit: 10 });

  return (
    <div>
      <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 20 }}>
        <p><strong>Address:</strong> {wallet.stxAddress}</p>
        <p><strong>Network:</strong> {wallet.network}</p>
        <p><strong>Balance:</strong> {balance?.stx ?? 'Loading...'} STX</p>
      </div>

      <h2>Recent Transactions</h2>
      {txData?.length === 0 && <p>No transactions yet.</p>}
      {txData?.map((tx) => (
        <div key={tx.id} style={{ border: '1px solid #ddd', padding: 10, marginBottom: 8, borderRadius: 4 }}>
          <p><strong>{tx.type}</strong> — {tx.status}</p>
          <p style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>{tx.txid}</p>
        </div>
      ))}

      <button onClick={onLogout} style={{ marginTop: 20, padding: '8px 16px' }}>Logout</button>
    </div>
  );
}
