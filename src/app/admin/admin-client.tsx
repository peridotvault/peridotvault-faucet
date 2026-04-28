'use client';

import dynamic from 'next/dynamic';

const AdminPanel = dynamic(() => import('../components/AdminPanel'), { ssr: false });

export default function AdminClient() {
  return <AdminPanel />;
}
