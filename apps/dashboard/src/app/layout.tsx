import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from '@/components/sidebar';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VelumX MPC — Developer Dashboard',
  description: 'Stacks-native embedded wallet infrastructure',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8">{children}</main>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#0d0d0d',
                color: '#ffffff',
                borderRadius: '0.5rem',
                border: '1px solid rgba(255,255,255,0.08)',
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
