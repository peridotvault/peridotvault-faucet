'use client';

import dynamic from 'next/dynamic';

const FaucetCard = dynamic(() => import('./components/FaucetCard'), { ssr: false });

export default function HomeClient() {
  return <FaucetCard />;
}
