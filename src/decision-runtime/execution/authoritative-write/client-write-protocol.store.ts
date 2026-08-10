/**
 * UWC-1e protocol session store.
 * L1: in-process Map (unit tests / single instance).
 * L2: Redis when UWC_1E_SESSION_REDIS=1 (required for M1 LB cross-instance Confirm).
 */

import type {
  Uwc1eConfirmResponse,
  Uwc1eProductSurface,
  Uwc1eSessionState,
  Uwc1eWriteDraft,
} from './client-write-protocol.types';

export type Uwc1eProtocolSession = {
  draft: Uwc1eWriteDraft;
  state: Uwc1eSessionState;
  confirmationId?: string;
  confirmedAt?: string;
  confirmProductSurface?: Uwc1eProductSurface;
  lastOutcome?: string;
  mustRePreview: boolean;
  bypassForbidden: boolean;
};

const sessions = new Map<string, Uwc1eProtocolSession>();
const REDIS_KEY_PREFIX = 'uwc1e:session:';
const REDIS_TTL_SEC = 60 * 60 * 24;

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
};

let redisClient: RedisLike | null = null;
let redisInitAttempted = false;

export function isUwc1eSessionRedisEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.UWC_1E_SESSION_REDIS ?? '').trim() === '1';
}

async function getRedis(): Promise<RedisLike | null> {
  if (!isUwc1eSessionRedisEnabled()) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return null;
  redisInitAttempted = true;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    await client.connect();
    redisClient = client as unknown as RedisLike;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

function redisKey(draftId: string): string {
  return `${REDIS_KEY_PREFIX}${draftId}`;
}

export function clearUwc1eProtocolSessionsForTests(): void {
  sessions.clear();
}

/** Sync L1 read — tests / single-instance hot path. */
export function getUwc1eProtocolSession(
  draftId: string,
): Uwc1eProtocolSession | undefined {
  return sessions.get(draftId);
}

export function putUwc1eProtocolSession(session: Uwc1eProtocolSession): void {
  sessions.set(session.draft.draftId, session);
}

export function updateUwc1eProtocolSession(
  draftId: string,
  patch: Partial<Uwc1eProtocolSession>,
): Uwc1eProtocolSession | undefined {
  const cur = sessions.get(draftId);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  sessions.set(draftId, next);
  return next;
}

export function attachUwc1eConfirmation(
  draftId: string,
  confirmation: Pick<
    Uwc1eConfirmResponse,
    'confirmationId' | 'confirmedAt'
  > & { productSurface: Uwc1eProductSurface },
): Uwc1eProtocolSession | undefined {
  return updateUwc1eProtocolSession(draftId, {
    state: 'CONFIRMED',
    confirmationId: confirmation.confirmationId,
    confirmedAt: confirmation.confirmedAt,
    confirmProductSurface: confirmation.productSurface,
    mustRePreview: false,
    bypassForbidden: false,
  });
}

/** L1+L2 read — prefer Redis when enabled so Confirm can land on another instance. */
export async function getUwc1eProtocolSessionAsync(
  draftId: string,
): Promise<Uwc1eProtocolSession | undefined> {
  const local = sessions.get(draftId);
  if (local) return local;
  const redis = await getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get(redisKey(draftId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Uwc1eProtocolSession;
    sessions.set(draftId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export async function putUwc1eProtocolSessionAsync(
  session: Uwc1eProtocolSession,
): Promise<void> {
  sessions.set(session.draft.draftId, session);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.set(
      redisKey(session.draft.draftId),
      JSON.stringify(session),
      'EX',
      REDIS_TTL_SEC,
    );
  } catch {
    /* L1 remains; M1 preflight must verify Redis health */
  }
}

export async function updateUwc1eProtocolSessionAsync(
  draftId: string,
  patch: Partial<Uwc1eProtocolSession>,
): Promise<Uwc1eProtocolSession | undefined> {
  const cur = await getUwc1eProtocolSessionAsync(draftId);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  await putUwc1eProtocolSessionAsync(next);
  return next;
}

export async function attachUwc1eConfirmationAsync(
  draftId: string,
  confirmation: Pick<
    Uwc1eConfirmResponse,
    'confirmationId' | 'confirmedAt'
  > & { productSurface: Uwc1eProductSurface },
): Promise<Uwc1eProtocolSession | undefined> {
  return updateUwc1eProtocolSessionAsync(draftId, {
    state: 'CONFIRMED',
    confirmationId: confirmation.confirmationId,
    confirmedAt: confirmation.confirmedAt,
    confirmProductSurface: confirmation.productSurface,
    mustRePreview: false,
    bypassForbidden: false,
  });
}
