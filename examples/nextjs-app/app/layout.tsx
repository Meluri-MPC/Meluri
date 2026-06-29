import type { Metadata } from 'next';
import { VelumXProvider } from '@/components/VelumXProvider';

export const metadata: Metadata = {
  title: 'VelumX MPC — Next.js App Router',
  description: 'VelumX MPC SDK with Next.js App Router',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}><VelumXProvider>{children}</VelumXProvider></body>
    </html>
  );
}
