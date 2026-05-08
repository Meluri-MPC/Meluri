import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function DocsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const developer = email ? await prisma.developer.findUnique({ where: { email } }) : null;
  const apiKey = developer
    ? await prisma.apiKey.findFirst({
        where: { developerId: developer.id, status: 'Active' },
        select: { keyPrefix: true },
      })
    : null;

  const keyPlaceholder = apiKey ? `${apiKey.keyPrefix}...` : 'ml_your_api_key';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">SDK Documentation</h1>
      <p className="text-gray-400 mb-8">Integrate Meluri MPC into your Stacks dApp in minutes</p>

      <div className="space-y-6">
        <Section title="Installation">
          <CodeBlock>{`npm install @meluri/mpc @clerk/clerk-js`}</CodeBlock>
        </Section>

        <Section title="Quick Start">
          <CodeBlock>{`import { MeluriMPC } from '@meluri/mpc';
import { ClerkProvider } from '@clerk/clerk-react';

// Wrap your app with ClerkProvider
function App() {
  return (
    <ClerkProvider publishableKey="pk_...">
      <YourDApp />
    </ClerkProvider>
  );
}

// Initialize Meluri
const meluri = new MeluriMPC({
  apiKey: '${keyPlaceholder}',
  network: 'mainnet',
  clerkPublishableKey: 'pk_...',
});

// Authenticate user → creates MPC wallet automatically
await meluri.login();

// Get the user's Stacks wallet
const wallet = await meluri.getWallet();
console.log(wallet.stxAddress); // SP2A8G...

// Check balance
const { stx, tokens } = await meluri.getBalance();
console.log(stx); // "10.5"`}</CodeBlock>
        </Section>

        <Section title="Send STX">
          <CodeBlock>{`await meluri.sendSTX({
  recipient: 'SP2A8G6Z0BWNXGQNKSB1C5VNMBK4VEJFK5GR15CMH',
  amount: 1000000, // 1 STX in microSTX
});`}</CodeBlock>
        </Section>

        <Section title="Send SIP-010 Token">
          <CodeBlock>{`await meluri.sendToken({
  contractAddress: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.aeusdc',
  amount: '500000',  // in token's smallest unit
  recipient: 'SP2A8G...',
});`}</CodeBlock>
        </Section>

        <Section title="Send SIP-009 NFT">
          <CodeBlock>{`await meluri.sendNFT({
  contractAddress: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.bitflow-nft',
  tokenId: 42,
  recipient: 'SP2A8G...',
});`}</CodeBlock>
        </Section>

        <Section title="Session Keys (save costs)">
          <p className="text-gray-400 text-sm mb-3">Create a session key to sign multiple transactions without calling Turnkey each time. Saves ~$0.005 per transaction.</p>
          <CodeBlock>{`// Create a 30-minute session
const { expiresAt } = await meluri.createSession(30);

// Check session status
const status = meluri.getSessionStatus();
// { active: true, remainingMinutes: 27 }

// All subsequent sends use session key (free signing)
await meluri.sendSTX({ recipient: 'SP...', amount: 1000000 });
await meluri.sendToken({ contractAddress: 'SP...', amount: '1000', recipient: 'SP...' });
// These cost $0 in Turnkey fees

// Session auto-clears on logout
await meluri.logout();`}</CodeBlock>
        </Section>

        <Section title="Batched Transactions">
          <p className="text-gray-400 text-sm mb-3">Send multiple transactions in one API call.</p>
          <CodeBlock>{`const results = await meluri.batchSend([
  { type: 'stx', params: { recipient: 'SP...', amount: 1000000 } },
  { type: 'token', params: { contractAddress: 'SP...aeusdc', amount: '500000', recipient: 'SP...' } },
]);
// [{ txid: '0x...', usedSessionKey: true }, ...]`}</CodeBlock>
        </Section>

        <Section title="Event Listeners">
          <CodeBlock>{`// Coming soon: subscribe to wallet and transaction events
// meluri.on('transaction', (tx) => console.log(tx));`}</CodeBlock>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}
