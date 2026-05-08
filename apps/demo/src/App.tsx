import { useState, useCallback } from 'react';

const API_URL = 'https://meluri.onrender.com/api/v1';

interface Wallet {
  userId: string;
  stxAddress: string;
  publicKey: string;
  network: string;
}

export default function App() {
  const [userId, setUserId] = useState('');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTxid, setLastTxid] = useState('');

  const fetchBalance = async (address: string) => {
    try {
      const res = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${address}/balances`);
      const data = await res.json();
      setBalance(data?.stx?.balance || '0');
    } catch {
      setBalance('0');
    }
  };

  const handleCreateWallet = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/wallets/simple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data: Wallet = await res.json();
      setWallet(data);
      await fetchBalance(data.stxAddress);
      setSuccess('Wallet created!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleGetWallet = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/wallets/simple/${userId.trim()}`);
      if (res.status === 404) throw new Error('Wallet not found. Create one first.');
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data: Wallet = await res.json();
      setWallet(data);
      await fetchBalance(data.stxAddress);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleSendSTX = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendRecipient || !sendAmount) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/wallets/simple/send-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), recipient: sendRecipient.trim(), amount: Number(sendAmount) }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data = await res.json();
      setLastTxid(data.txid);
      setSuccess(`Sent! txid: ${data.txid.slice(0, 20)}...`);
      setSendRecipient('');
      setSendAmount('');
      setTimeout(() => fetchBalance(wallet!.stxAddress), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [sendRecipient, sendAmount, userId, wallet]);

  const explorerUrl = lastTxid ? `https://explorer.hiro.so/txid/${lastTxid}?chain=testnet` : '';

  return (
    <div className="app">
      <div className="header">
        <h1>Meluri Wallet</h1>
        <p>Simple custodial Stacks wallet — testnet</p>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {!wallet ? (
        <div className="card">
          <div className="input-group">
            <label>User ID</label>
            <input className="input" type="text" placeholder="Enter a username or ID" value={userId} onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWallet()} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreateWallet} disabled={loading || !userId.trim()}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
            <button className="btn btn-danger" onClick={handleGetWallet} disabled={loading || !userId.trim()} style={{ padding: 14 }}>
              Load
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-title">Wallet</div>
            <div className="address">{wallet.stxAddress}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>{wallet.userId}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Balance</div>
            <div className="balance-stx">
              {balance} <span>STX</span>
            </div>
            <button className="btn btn-danger" onClick={() => fetchBalance(wallet.stxAddress)} style={{ marginTop: 12, padding: 10, fontSize: 13 }}>
              Refresh
            </button>
          </div>

          <div className="card">
            <div className="card-title">Send STX</div>
            <form onSubmit={handleSendSTX}>
              <div className="input-group">
                <label>Recipient</label>
                <input className="input" type="text" placeholder="STX address" value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Amount (microSTX)</label>
                <input className="input" type="number" placeholder="1000000 = 1 STX" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={sending || !sendRecipient || !sendAmount}>
                {sending ? 'Sending...' : 'Send STX'}
              </button>
            </form>
            {lastTxid && (
              <div style={{ marginTop: 12 }}>
                <a href={explorerUrl} target="_blank" rel="noopener" className="tx-link">View on Explorer</a>
              </div>
            )}
          </div>

          <button className="btn btn-danger" onClick={() => { setWallet(null); setBalance(''); setLastTxid(''); }}>
            Switch User
          </button>
        </>
      )}
    </div>
  );
}
