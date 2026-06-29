import { VelumXProvider } from '@/components/VelumXProvider';
import { WalletSection } from '@/components/WalletSection';
import { ServerInfo } from '@/components/ServerInfo';

export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: 'system-ui' }}>
      <h1>VelumX MPC — Next.js App Router</h1>
      <ServerInfo />
      <VelumXProvider>
        <WalletSection />
      </VelumXProvider>
    </main>
  );
}
