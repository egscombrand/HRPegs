import type { Metadata } from 'next';
import { RootProviders } from './providers';
import './globals.css';
import type { ReactNode } from 'react';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'HRP Starter Kit',
  description: 'Human Resource Platform Starter Kit.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
