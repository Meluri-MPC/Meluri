# React Native Integration

Use VelumX MPC in React Native (Expo or bare workflow).

## Install

```bash
npx expo install @velumx/mpc
npx expo install expo-web-browser expo-crypto @react-native-async-storage/async-storage
```

## Setup

```tsx
// App.tsx
import { NativeOAuth, VelumXMPCNative } from '@velumx/mpc/native';
import { NativeStorage } from '@velumx/mpc/native';
import { NativeCrypto } from '@velumx/mpc/native';
import * as WebBrowser from 'expo-web-browser';

const storage = new NativeStorage();
const crypto = new NativeCrypto();

const auth = new NativeOAuth({
  authUrl: 'https://auth.velumx.xyz/authorize',
  redirectUrl: 'velumx://callback',
  clientId: 'your_client_id',
  browser: 'expo-web-browser',
});

const velumx = new VelumXMPCNative({
  apiKey: 'vx_sk_your_api_key',
  auth,
  storage,
  crypto,
  network: 'testnet',
});

export default function App() {
  const [wallet, setWallet] = useState(null);

  const handleLogin = async () => {
    const w = await velumx.login();
    setWallet(w);
  };

  const handleSend = async () => {
    const { txid } = await velumx.sendSTX({
      recipient: 'SP2...',
      amount: 1_000_000,
    });
    Alert.alert('Sent!', `TXID: ${txid}`);
  };

  return (
    <View style={styles.container}>
      {wallet ? (
        <>
          <Text>Address: {wallet.stxAddress}</Text>
          <Button title="Send 1 STX" onPress={handleSend} />
          <Button title="Logout" onPress={() => velumx.logout()} />
        </>
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}
    </View>
  );
}
```

## Native Classes

### VelumXMPCNative

The main client class for React Native. Identical API to `VelumxMPC` but uses pluggable storage and crypto.

```ts
import { VelumXMPCNative } from '@velumx/mpc/native';

const velumx = new VelumXMPCNative({
  apiKey: 'vx_sk_...',
  auth: myAuthProvider,
  storage: new NativeStorage(),
  crypto: new NativeCrypto(),
});
```

### NativeStorage

Uses `@react-native-async-storage/async-storage` for session persistence.

```ts
import { NativeStorage } from '@velumx/mpc/native';

const storage = new NativeStorage();
await storage.setItem('key', 'value');
const val = await storage.getItem('key');
await storage.removeItem('key');
```

### NativeCrypto

Crypto operations using `expo-crypto` or `react-native-quick-crypto`.

```ts
import { NativeCrypto } from '@velumx/mpc/native';

const crypto = new NativeCrypto();
const bytes = crypto.randomBytes(32);
const hash = await crypto.sha256Async(bytes);
```

### NativeOAuth

Browser-based OAuth flow. Supports `expo-web-browser` (recommended) and `react-native-inappbrowser`.

```ts
import { NativeOAuth } from '@velumx/mpc/native';

const auth = new NativeOAuth({
  authUrl: 'https://auth.example.com/authorize',
  redirectUrl: 'myapp://callback',
  clientId: 'your_client_id',
  browser: 'expo-web-browser', // or 'react-native-inappbrowser'
});

const { userId, sessionToken } = await auth.login();
```

### NativeSession

AsyncStorage-based session management.

```ts
import { NativeSession } from '@velumx/mpc/native';

const session = new NativeSession(turnkeySigner);
const sessionKey = await session.createSession(
  walletPublicKey,
  walletAddress,
  turnkeyWalletId,
  30 * 60 * 1000, // 30 minutes
);
```

## Expo Setup

### app.json / app.config.js

```json
{
  "expo": {
    "scheme": "velumx"
  }
}
```

### Deep Link Handling

```tsx
import * as Linking from 'expo-linking';

export default function App() {
  const url = Linking.useURL();

  useEffect(() => {
    if (url) {
      // Handle OAuth callback
      const { userId, sessionToken } = parseCallback(url);
    }
  }, [url]);

  // ...
}
```

## Custom Auth Provider

If you already have auth, implement the `NativeAuthProvider` interface:

```ts
import { NativeAuthProvider } from '@velumx/mpc/native';

const myAuth: NativeAuthProvider = {
  async login() {
    const result = await myAuthService.login();
    return { userId: result.id, sessionToken: result.token };
  },
  async logout() {
    await myAuthService.logout();
  },
  async getSession() {
    const session = await myAuthService.getSession();
    return session ? { userId: session.id, sessionToken: session.token } : null;
  },
};

const velumx = new VelumXMPCNative({ apiKey: '...', auth: myAuth });
```

## Polyfill Options

| Library | For | Command |
|---------|-----|---------|
| `expo-crypto` | Random bytes, SHA-256 | `npx expo install expo-crypto` |
| `react-native-quick-crypto` | Full Node `crypto` API | `npm install react-native-quick-crypto` |
| `@react-native-async-storage/async-storage` | Persistent storage | `npx expo install @react-native-async-storage/async-storage` |
| `expo-web-browser` | OAuth browser | `npx expo install expo-web-browser` |
| `react-native-inappbrowser` | Alternative OAuth | `npm install react-native-inappbrowser` |
