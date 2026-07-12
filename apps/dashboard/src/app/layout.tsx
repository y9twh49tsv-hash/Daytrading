import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Daytrading Bot — Testnet Dashboard',
  description:
    'Dashboard für den automatisierten Binance-Spot-Trading-Bot (Paper-Trading & Testnet). Keine Gewinngarantie.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
