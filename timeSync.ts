import { supabase } from './supabase';

let serverTimeOffset: number | null = null;

export async function syncServerTime(): Promise<number> {
  try {
    const clientTimeBefore = Date.now();

    const { data, error } = await supabase.rpc('get_server_time');

    if (error) {
      console.error('[timeSync] Failed to get server time:', error);
      return 0;
    }

    const clientTimeAfter = Date.now();
    const roundTripTime = clientTimeAfter - clientTimeBefore;
    const clientTimeAtRequest = clientTimeBefore + (roundTripTime / 2);

    const serverTime = new Date(data.server_time).getTime();
    const offset = serverTime - clientTimeAtRequest;

    serverTimeOffset = offset;

    console.log('[timeSync] Server time sync complete:', {
      serverTime: new Date(serverTime).toISOString(),
      clientTime: new Date(clientTimeAtRequest).toISOString(),
      offsetMs: offset,
      offsetSeconds: Math.round(offset / 1000),
    });

    return offset;
  } catch (error) {
    console.error('[timeSync] Exception syncing server time:', error);
    return 0;
  }
}

export function getServerAdjustedTime(): number {
  const clientTime = Date.now();
  if (serverTimeOffset === null) {
    return clientTime;
  }
  return clientTime + serverTimeOffset;
}

export function getServerTimeOffset(): number | null {
  return serverTimeOffset;
}
