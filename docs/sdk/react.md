# React Integration

VelumX MPC provides React hooks and components for easy wallet integration.

## Setup

```bash
pnpm add @velumx/mpc react react-dom
```

```tsx
// app.tsx
import { WalletProvider } from '@velumx/mpc/react';
import { VelumxMPC } from '@velumx/mpc';

const velumx = new VelumxMPC({
  apiKey: 'vx_sk_...',
  auth: { /* your auth */ },
});

function App() {
  return (
    <WalletProvider>
      <YourApp />
    </WalletProvider>
  );
}
```

## Components

### WalletButton

A ready-to-use connect/disconnect button.

```tsx
import { WalletButton } from '@velumx/mpc/react';

function Navbar() {
  return <WalletButton
    onConnect={(address) => console.log('Connected:', address)}
    onDisconnect={() => console.log('Disconnected')}
  />;
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onConnect` | `(address: string) => void` | — | Called on successful connection |
| `onDisconnect` | `() => void` | — | Called on disconnection |
| `className` | `string` | — | Custom CSS class |
| `label` | `string` | `"Connect Wallet"` | Button text |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Button size |

### WalletModal

A modal for wallet discovery and connection.

```tsx
import { WalletModal } from '@velumx/mpc/react';

function Page() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Connect</button>
      <WalletModal
        open={open}
        onClose={() => setOpen(false)}
        onConnect={(address, connectorId) => console.log(address, connectorId)}
      />
    </>
  );
}
```

### SendForm

An STX transfer form with validation.

```tsx
import { SendForm } from '@velumx/mpc/react';

function TransferPage() {
  return <SendForm
    onSend={(params) => console.log('Sending:', params)}
    network="testnet"
  />;
}
```

### TransactionList

Displays a list of transactions with status badges.

```tsx
import { TransactionList } from '@velumx/mpc/react';

function History() {
  return <TransactionList
    address="SP2..."
    limit={20}
  />;
}
```

### NetworkBadge

Shows the current network (mainnet/testnet) with a colored badge.

```tsx
import { NetworkBadge } from '@velumx/mpc/react';

<NetworkBadge network="testnet" />
```

### QRCode

Generates a QR code for address sharing or deep links.

```tsx
import { QRCode, CopyAddressButton } from '@velumx/mpc/react';

<QRCode address="SP2..." size={200} />
<CopyAddressButton address="SP2..." />
```

## Hooks

### useWallet

Core wallet state hook.

```tsx
import { useWallet } from '@velumx/mpc/react';

function WalletInfo() {
  const { wallet, balance, connect, disconnect } = useWallet();

  return (
    <div>
      {wallet.connected ? (
        <>
          <p>Address: {wallet.address}</p>
          <p>Balance: {balance} STX</p>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={() => connect('SP2...', 'leather')}>Connect</button>
      )}
    </div>
  );
}
```

**Returns:** `UseWalletResult`

| Property | Type | Description |
|----------|------|-------------|
| `wallet` | `WalletState` | Current wallet state |
| `balance` | `string \| null` | Current STX balance |
| `connect` | `(address, connectorId, network?, chain?) => void` | Connect wallet |
| `disconnect` | `() => void` | Disconnect wallet |
| `setNetwork` | `(network: string) => void` | Switch network |

### useBalance

Fetch and poll wallet balance.

```tsx
import { useBalance } from '@velumx/mpc/react';

function Balance() {
  const { data, isLoading, error, refetch } = useBalance({
    address: wallet.address,
    pollInterval: 30_000, // 30 seconds
  });

  if (isLoading) return <p>Loading...</p>;
  return <p>{data?.stx} STX</p>;
}
```

### useTransactions

Fetch transaction history.

```tsx
import { useTransactions } from '@velumx/mpc/react';

function History() {
  const { data, isLoading } = useTransactions({
    address: wallet.address,
    limit: 20,
  });

  return data?.map((tx) => (
    <div key={tx.txid}>{tx.type}: {tx.status}</div>
  ));
}
```

### useSendTransaction

Send STX, tokens, or NFTs with status tracking.

```tsx
import { useSendTransaction } from '@velumx/mpc/react';

function Send() {
  const { sendStx, status, txid } = useSendTransaction();

  return (
    <button onClick={() => sendStx({ recipient: 'SP2...', amount: 1000000 })}>
      Send 1 STX
      {status === 'pending' && '...'}
      {status === 'success' && ` Done! ${txid}`}
    </button>
  );
}
```

## Custom Theming

```tsx
import { injectThemeStyles } from '@velumx/mpc/react';

injectThemeStyles({
  '--velumx-primary': '#5546FF',
  '--velumx-bg': '#1A1A2E',
  '--velumx-radius': '12px',
});
```

Available CSS variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `--velumx-primary` | `#7C3AED` | Primary brand color |
| `--velumx-primary-hover` | `#6D28D9` | Button hover state |
| `--velumx-bg` | `#FFFFFF` | Background color |
| `--velumx-text` | `#1F2937` | Text color |
| `--velumx-border` | `#E5E7EB` | Border color |
| `--velumx-radius` | `8px` | Border radius |
| `--velumx-font` | `Inter, sans-serif` | Font family |
