import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativeOAuth, VelumXMPCNative } from '@velumx/mpc/native';
import { NativeStorage } from '@velumx/mpc/native';
import { NativeCrypto } from '@velumx/mpc/native';

const storage = new NativeStorage();
const crypto = new NativeCrypto();

const auth = new NativeOAuth({
  authUrl: 'https://auth.velumx.xyz/authorize',
  redirectUrl: 'velumx://callback',
  clientId: 'demo-client',
  browser: 'expo-web-browser',
});

const velumx = new VelumXMPCNative({
  apiKey: 'vx_sk_demo',
  auth,
  storage,
  crypto,
  network: 'testnet',
});

export default function App() {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState('');
  const [txs, setTxs] = useState<any[]>([]);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    try {
      const w = await velumx.login();
      setWallet(w);
      await loadData(w);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await velumx.logout();
    setWallet(null);
    setBalance('');
    setTxs([]);
  };

  const handleSend = async () => {
    if (!recipient || !amount) { Alert.alert('Missing fields'); return; }
    try {
      const { txid } = await velumx.sendSTX({
        recipient,
        amount: Number(amount) * 1_000_000,
      });
      Alert.alert('Sent!', `TXID: ${txid}`);
      setRecipient('');
      setAmount('');
      await loadData(wallet);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const loadData = async (w: any) => {
    try {
      const { stx } = await velumx.getBalance();
      setBalance(stx);
      const history = await velumx.getTransactionHistory();
      setTxs(history);
    } catch {}
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#7C3AED" /></View>;
  }

  if (!wallet) {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <Text style={styles.title}>VelumX MPC</Text>
        <Text style={styles.subtitle}>React Native</Text>
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>VelumX MPC</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Wallet</Text>
        <Text style={styles.address}>{wallet.stxAddress}</Text>
        <Text style={styles.balance}>{balance || 'Loading...'} STX</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send STX</Text>
        <TextInput style={styles.input} placeholder="Recipient (SP2...)" value={recipient}
          onChangeText={setRecipient} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Amount (STX)" value={amount}
          onChangeText={setAmount} keyboardType="numeric" />
        <TouchableOpacity style={styles.button} onPress={handleSend}>
          <Text style={styles.buttonText}>Send</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transactions ({txs.length})</Text>
        <FlatList
          data={txs.slice(0, 5)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.txItem}>
              <Text style={styles.txType}>{item.type} — {item.status}</Text>
              <Text style={styles.txHash} numberOfLines={1}>{item.txid}</Text>
            </View>
          )}
        />
      </View>

      <TouchableOpacity onPress={handleLogout}>
        <Text style={styles.logout}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32, textAlign: 'center' },
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  address: { fontSize: 14, fontFamily: 'monospace', marginBottom: 4 },
  balance: { fontSize: 24, fontWeight: '700', color: '#7C3AED' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 8 },
  button: { backgroundColor: '#7C3AED', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  txItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  txType: { fontSize: 14, fontWeight: '500' },
  txHash: { fontSize: 12, color: '#999', marginTop: 2 },
  logout: { color: '#dc2626', textAlign: 'center', marginTop: 16, fontSize: 16 },
});
