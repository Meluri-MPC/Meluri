import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from '@/components/sidebar';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meluri MPC — Developer Dashboard',
  description: 'Stacks-native embedded wallet infrastructure',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8">{children}</main>
          <Toaster position="top-right" toastOptions={{ style: { background: '#1f2937', color: '#f3f4f6', borderRadius: '0.5rem' } }} />
        </body>
      </html>
    </ClerkProvider>
  );
}
