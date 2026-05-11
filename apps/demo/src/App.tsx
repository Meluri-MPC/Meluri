import { useState, useCallback } from 'react';

const API_URL = 'https://meluri.onrender.com/api/v1';

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  contractAddress: string;
}

interface Wallet {
  userId: string;
  stxAddress: string;
  publicKey: string;
  network: string;
}

export default function App() {
  const [identifier, setIdentifier] = useState('');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState('');
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTxid, setLastTxid] = useState('');

  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenRecipient, setTokenRecipient] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [sendingToken, setSendingToken] = useState(false);

  const fetchAll = async (address: string) => {
    try {
      const res = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${address}/balances`);
      const data = await res.json();
      const raw = data?.stx?.balance || '0';
      setBalance((Number(raw) / 1_000_000).toString());

      const ft = (data?.fungible_tokens || {}) as Record<string, { balance: string; decimals: number; name: string; symbol: string }>;
      const tokenList: TokenBalance[] = Object.entries(ft)
        .filter(([, v]) => BigInt(v.balance) > 0n)
        .map(([contract, v]) => {
          const [addr, cname] = contract.split('::');
          const decimals = v.decimals || 6;
          const raw = v.balance;
          const display = (Number(raw) / Math.pow(10, decimals)).toString();
          return {
            symbol: v.symbol || '???',
            name: v.name || cname,
            balance: display,
            decimals,
            contractAddress: `${addr}.${cname}`,
          };
        });
      setTokens(tokenList);
    } catch {
      setBalance('0');
      setTokens([]);
    }
  };

  const handleCreateWallet = useCallback(async () => {
      if (!identifier.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/wallets/simple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: identifier.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data: Wallet = await res.json();
      setWallet(data);
      await fetchAll(data.stxAddress);
      setSuccess('Wallet created!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  const handleGetWallet = useCallback(async () => {
    if (!identifier.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/wallets/simple/${identifier.trim()}`);
      if (res.status === 404) throw new Error('Wallet not found. Create one first.');
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data: Wallet = await res.json();
      setWallet(data);
      await fetchAll(data.stxAddress);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [identifier]);

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
        body: JSON.stringify({ userId: identifier.trim(), recipient: sendRecipient.trim(), amount: Math.round(Number(sendAmount) * 1_000_000) }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data = await res.json();
      setLastTxid(data.txid);
      setSuccess(`Sent! txid: ${data.txid.slice(0, 20)}...`);
      setSendRecipient('');
      setSendAmount('');
      setTimeout(() => fetchAll(wallet!.stxAddress), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [sendRecipient, sendAmount, identifier, wallet]);

  const handleSendToken = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken || !tokenRecipient || !tokenAmount) return;
    setSendingToken(true);
    setError('');
    setSuccess('');
    try {
      const rawAmount = Math.round(Number(tokenAmount) * Math.pow(10, selectedToken.decimals)).toString();
      const res = await fetch(`${API_URL}/wallets/simple/send-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: identifier.trim(),
          contractId: selectedToken.contractAddress,
          recipient: tokenRecipient.trim(),
          amount: rawAmount,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      const data = await res.json();
      setLastTxid(data.txid);
      setSuccess(`Token sent! txid: ${data.txid.slice(0, 20)}...`);
      setTokenRecipient('');
      setTokenAmount('');
      setSelectedToken(null);
      setTimeout(() => fetchAll(wallet!.stxAddress), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingToken(false);
    }
  }, [selectedToken, tokenRecipient, tokenAmount, identifier, wallet]);

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
            <label>Email or Username</label>
            <input className="input" type="text" placeholder="you@example.com or myuser" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWallet()} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreateWallet} disabled={loading || !identifier.trim()}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
            <button className="btn btn-danger" onClick={handleGetWallet} disabled={loading || !identifier.trim()} style={{ padding: 14 }}>
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
            <div className="balance-stx">{balance} <span>STX</span></div>
            {tokens.map((t) => (
              <div key={t.contractAddress} style={{ marginTop: 6, fontSize: 14, color: '#a78bfa' }}>
                {t.balance} {t.symbol}
                <button
                  onClick={() => { setSelectedToken(t); setTokenAmount(''); setTokenRecipient(''); }}
                  style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  Send
                </button>
              </div>
            ))}
            <button className="btn btn-danger" onClick={() => fetchAll(wallet.stxAddress)} style={{ marginTop: 12, padding: 10, fontSize: 13 }}>
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
                <label>Amount (STX)</label>
                <input className="input" type="number" placeholder="1.0 = 1 STX" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
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

          {selectedToken && (
            <div className="card">
              <div className="card-title">Send {selectedToken.symbol}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                {selectedToken.name} — Balance: {selectedToken.balance}
              </div>
              <form onSubmit={handleSendToken}>
                <div className="input-group">
                  <label>Recipient</label>
                  <input className="input" type="text" placeholder="STX address" value={tokenRecipient} onChange={(e) => setTokenRecipient(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Amount ({selectedToken.symbol})</label>
                  <input className="input" type="number" placeholder={`${selectedToken.balance}`} value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={sendingToken || !tokenRecipient || !tokenAmount}>
                    {sendingToken ? 'Sending...' : 'Send'}
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => setSelectedToken(null)} style={{ padding: 14 }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <button className="btn btn-danger" onClick={() => { setWallet(null); setBalance(''); setTokens([]); setLastTxid(''); }}>
            Switch Account
          </button>
        </>
      )}
    </div>
  );
}
