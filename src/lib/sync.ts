import type { UserRole } from '../data/types';

export interface SyncNotice {
  type: 'data-changed' | 'conflict';
  sourceId: string;
  entityType: string;
  entityId: string;
  field: string;
  role: UserRole;
  timestamp: string;
  appliedValue: unknown;
  competingValue?: unknown;
  message?: string;
}

const SOURCE_ID = `tab-${Math.random().toString(36).slice(2)}`;
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel('manyar-sync');
  return channel;
}

export function publishSync(notice: Omit<SyncNotice, 'sourceId'>) {
  getChannel()?.postMessage({ ...notice, sourceId: SOURCE_ID } satisfies SyncNotice);
}

export function subscribeSync(listener: (notice: SyncNotice) => void): () => void {
  const current = getChannel();
  if (!current) return () => {};
  const handler = (event: MessageEvent<SyncNotice>) => {
    if (event.data.sourceId === SOURCE_ID) return;
    listener(event.data);
  };
  current.addEventListener('message', handler);
  return () => current.removeEventListener('message', handler);
}
