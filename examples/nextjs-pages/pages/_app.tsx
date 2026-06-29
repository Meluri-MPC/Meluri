import type { AppProps } from 'next/app';
import { WalletProvider } from '@velumx/mpc/react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <Component {...pageProps} />
    </WalletProvider>
  );
}
