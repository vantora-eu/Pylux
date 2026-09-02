import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pylux · Tesla Remote Play',
  description: 'Een touch-first Pylux Remote Play-interface voor de Tesla-browser.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  viewportFit: 'cover', themeColor: '#090b0e',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="nl"><body>{children}</body></html>;
}
