'use client';

import dynamic from 'next/dynamic';
import { type ReactNode } from 'react';

const SolanaProviders = dynamic(
  () => import('./solana-providers').then((m) => m.SolanaProviders),
  { ssr: false }
);

export function Providers({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
