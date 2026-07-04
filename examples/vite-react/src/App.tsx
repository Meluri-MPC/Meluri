import { useState } from 'react';
import { VelumxMPC } from '@velumx/mpc';
import { useBalance, useTransactions, useSendTransaction } from '@velumx/mpc/react';

const velumx = new VelumxMPC({
  apiKey: import.meta.env.VITE_VELUMX_API_KEY || 'vx_sk_demo',
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

export default function App() {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try { const w = await velumx.login(); setWallet(w); } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  if (!wallet) {
    return (
      <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
        <h1>VelumX MPC + Vite + React</h1>
        <button onClick={handleLogin} disabled={loading} style={{ padding: '12px 24px', fontSize: 16 }}>
          {loading ? 'Loading...' : 'Login with VelumX'}
        </button>
        <p style={{ marginTop: 20, color: '#666' }}>
          Edit <code>src/App.tsx</code> and replace the demo auth with your own.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>VelumX MPC + Vite + React</h1>
      <Dashboard wallet={wallet} onLogout={async () => { await velumx.logout(); setWallet(null); }} />
    </main>
  );
}

function Dashboard({ wallet, onLogout }: { wallet: any; onLogout: () => void }) {
  const { balance } = useBalance(wallet.stxAddress);
  const { transactions: txs } = useTransactions(wallet.stxAddress, { pageSize: 10 });
  const { send: sendStx, isLoading: txSending, txId: txid } = useSendTransaction();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  const handleSend = async () => {
    try {
      await sendStx({ recipient, amount: String(Number(amount) * 1_000_000) });
      setRecipient(''); setAmount('');
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 20 }}>
        <p><strong>Address:</strong> {wallet.stxAddress}</p>
        <p><strong>Network:</strong> {wallet.network}</p>
        <p><strong>Balance:</strong> {balance ?? 'Loading...'} STX</p>
      </div>

      <h2>Send STX</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input placeholder="Recipient (SP2...)" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          style={{ flex: 1, padding: 8 }} />
        <input placeholder="Amount (STX)" value={amount} onChange={(e) => setAmount(e.target.value)}
          style={{ width: 120, padding: 8 }} type="number" />
        <button onClick={handleSend} style={{ padding: '8px 16px' }}>
          {txSending ? 'Sending...' : 'Send'}
        </button>
      </div>
      {txid && <p style={{ color: 'green' }}>Sent! TXID: {txid}</p>}

      <h2>Recent Transactions</h2>
      {txs?.length === 0 && <p>No transactions yet.</p>}
      {txs?.map((tx) => (
        <div key={tx.id} style={{ border: '1px solid #ddd', padding: 10, marginBottom: 8, borderRadius: 4 }}>
          <p><strong>{tx.type}</strong> — {tx.status}</p>
          <p style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>{tx.txid}</p>
        </div>
      ))}

      <button onClick={onLogout} style={{ marginTop: 20, padding: '8px 16px' }}>Logout</button>
    </div>
  );
}
