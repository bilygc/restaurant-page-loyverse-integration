import type { Metadata } from 'next';
import { KitchenBoard } from '@/components/KitchenBoard';

export const metadata: Metadata = { title: 'Cocina' };
// Polling KDS: never prerender/cached as static.
export const dynamic = 'force-dynamic';

export default function CocinaPage() {
  return <KitchenBoard />;
}
