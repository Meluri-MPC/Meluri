import { useEffect, useState, useCallback, useRef } from 'react';
import { MeluriMPC, type MeluriMPCAuth, type MPCWallet } from '@meluri/mpc';

const API_KEY = 'ml_f0c3da33e3fe08583ef8ec79c8e899b58aa0f0894cecf5d4d01500051b9cbc0a';
const BACKEND_URL = 'https://meluri.onrender.com/api/v1';
const CLERK_KEY = 'pk_test_Z2xhZC1oZW4tODguY2xlcmsuYWNjb3VudHMuZGV2JA';
const NETWORK = 'testnet' as const;

let meluri: MeluriMPC | null = null;

function getClerk(): any {
  return (window as any).Clerk;
}

function createAuth(): MeluriMPCAuth {
  return {
    async login() {
      const clerk = getClerk();
      if (!clerk) throw new Error('Clerk not loaded');
      if (!clerk.user) await clerk.openSignIn();
      return { userId: clerk.user.id, sessionToken: await clerk.session?.getToken() ?? '' };
    },
    async logout() {
      const clerk = getClerk();
      if (clerk?.user) await clerk.signOut();
    },
    async getSession() {
      const clerk = getClerk();
      if (!clerk?.user) return { userId: '', sessionToken: '' };
      return { userId: clerk.user.id, sessionToken: await clerk.session?.getToken() ?? '' };
    },
  };
}

function getMeluri() {
  if (!meluri) {
    meluri = new MeluriMPC({ apiKey: API_KEY, auth: createAuth(), network: NETWORK, backendUrl: BACKEND_URL });
  }
  return meluri;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [wallet, setWallet] = useState<MPCWallet | null>(null);
  const [balance, setBalance] = useState<{ stx: string; tokens: Array<{ symbol: string; balance: string }> }>({ stx: '0', tokens: [] });
  const [session, setSession] = useState<{ remainingMinutes: number } | null>(null);

  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [lastTxid, setLastTxid] = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleLogin = useCallback(async () => {
    clearMessages();
    const clerk = (window as any).Clerk;
    if (!clerk) return setError('Clerk not loaded');
    await clerk.openSignIn({ afterSignInUrl: window.location.href, afterSignUpUrl: window.location.href });
  }, []);

  const handleLogout = useCallback(async () => {
    const clerk = (window as any).Clerk;
    if (clerk?.user) await clerk.signOut();
    setWallet(null);
    setBalance({ stx: '0', tokens: [] });
    setSession(null);
    setLastTxid('');
    meluri = null;
  }, []);

  const refreshBalance = async (w?: MPCWallet) => {
    try {
      const b = await getMeluri().getBalance();
      setBalance(b);
    } catch {}
  };

  const handleCreateSession = useCallback(async () => {
    clearMessages();
    try {
      const s = await getMeluri().createSession(30);
      setSession(s);
      setSuccess('Session created — gasless tx unlocked for 30 minutes');
    } catch (e: any) {
      setError(e.message || 'Failed to create session');
    }
  }, []);

  const handleSendSTX = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!sendRecipient || !sendAmount) return;

    setSending(true);
    try {
      const result = await getMeluri().sendSTX({
        recipient: sendRecipient.trim(),
        amount: Number(sendAmount),
      });
      setLastTxid(result.txid);
      setSuccess(`Sent! txid: ${result.txid.slice(0, 20)}...`);
      setSendRecipient('');
      setSendAmount('');
      await refreshBalance();
      const s = getMeluri().getSessionStatus();
      if (s) setSession(s as any);
    } catch (e: any) {
      setError(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }, [sendRecipient, sendAmount]);

  // Init Clerk on mount — restores session after OAuth redirect
  useEffect(() => {
    if (document.getElementById('clerk-script')) return;
    const script = document.createElement('script');
    script.id = 'clerk-script';
    script.src = `https://glad-hen-88.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', CLERK_KEY);
    script.onload = async () => {
      const Clerk = (window as any).Clerk;
      if (!Clerk) { setError('Clerk failed to load'); setLoading(false); return; }
      await Clerk.load();
      if (Clerk.user) {
        try {
          setLoading(true);
          const w = await getMeluri().getWallet();
          setWallet(w);
          await refreshBalance(w);
          const ss = getMeluri().getSessionStatus();
          if (ss) setSession(ss as any);
        } catch (e: any) {
          setError(e.message || 'Failed to load wallet');
        }
      }
      setLoading(false);
    };
    script.onerror = () => { setError('Failed to load Clerk'); setLoading(false); };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

  const explorerUrl = lastTxid ? `https://explorer.hiro.so/txid/${lastTxid}?chain=testnet` : '';

  return (
    <div className="app">
      <div className="header">
        <h1>Meluri MPC Demo</h1>
        <p>Sign in with Google — get a Stacks wallet instantly</p>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {loading ? (
        <div className="loading"><div className="spinner" />Loading...</div>
      ) : !wallet ? (
        <button className="btn btn-primary" onClick={handleLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
          Sign in with Google
        </button>
      ) : (
        <>
          <div className="card">
            <div className="user-info">
              <div>
                <div className="user-email">Stacks Wallet</div>
                <div className="address">{wallet.stxAddress}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Balance</div>
            <div className="balance-stx">
              {balance.stx} <span>STX</span>
            </div>
            {balance.tokens.map((t) => (
              <div key={t.symbol} style={{ marginTop: 8, fontSize: 14, color: '#9ca3af' }}>
                {t.balance} {t.symbol}
              </div>
            ))}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" onClick={refreshBalance} style={{ width: '50%', padding: 10, fontSize: 13 }}>
                Refresh
              </button>
              {!session ? (
                <button className="btn btn-primary" onClick={handleCreateSession} style={{ width: '50%', padding: 10, fontSize: 13 }}>
                  Unlock Gasless Tx
                </button>
              ) : (
                <div style={{ width: '50%', padding: 10, fontSize: 12, color: '#4ade80', textAlign: 'center' }}>
                  Gasless active ({session.remainingMinutes}m)
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Send STX</div>
            <form onSubmit={handleSendSTX}>
              <div className="input-group">
                <label>Recipient Address</label>
                <input
                  className="input"
                  type="text"
                  placeholder="STX address or .btc name"
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Amount (microSTX)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="1000000 = 1 STX"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={sending || !sendRecipient || !sendAmount}>
                {sending ? <><div className="spinner" />Sending...</> : `Send STX`}
              </button>
            </form>
            {lastTxid && (
              <div style={{ marginTop: 12 }}>
                <a href={explorerUrl} target="_blank" rel="noopener" className="tx-link">
                  View on Explorer
                </a>
              </div>
            )}
          </div>

          <button className="btn btn-danger" onClick={handleLogout}>
            Sign Out
          </button>
        </>
      )}
    </div>
  );
}
