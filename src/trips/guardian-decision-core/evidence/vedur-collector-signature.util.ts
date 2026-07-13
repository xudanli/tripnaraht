/**
 * HMAC signature for Vedur collector ingest requests.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  VEDUR_COLLECTOR_INGEST_PATH,
  type VedurEvidenceIngestRequest,
} from '../contracts/vedur-evidence-ingest.types';

export function buildVedurCollectorSignaturePayload(input: {
  method: string;
  path: string;
  requestId: string;
  signatureTimestamp: string;
  payloadSha256: string;
  collectorId: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.requestId,
    input.signatureTimestamp,
    input.payloadSha256,
    input.collectorId,
  ].join('\n');
}

export function signVedurCollectorRequest(
  body: Pick<
    VedurEvidenceIngestRequest,
    'requestId' | 'signatureTimestamp' | 'payloadSha256' | 'collectorId'
  >,
  secret: string,
  method = 'POST',
  path = VEDUR_COLLECTOR_INGEST_PATH,
): string {
  const payload = buildVedurCollectorSignaturePayload({
    method,
    path,
    requestId: body.requestId,
    signatureTimestamp: body.signatureTimestamp,
    payloadSha256: body.payloadSha256,
    collectorId: body.collectorId,
  });
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyVedurCollectorSignature(
  body: Pick<
    VedurEvidenceIngestRequest,
    'requestId' | 'signatureTimestamp' | 'payloadSha256' | 'collectorId' | 'signature'
  >,
  secret: string,
  method = 'POST',
  path = VEDUR_COLLECTOR_INGEST_PATH,
): boolean {
  if (!secret || !body.signature) return false;
  const expected = signVedurCollectorRequest(body, secret, method, path);
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(body.signature, 'hex'));
  } catch {
    return false;
  }
}

export function resolveVedurCollectorAllowedIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.VEDUR_COLLECTOR_ALLOWED_IDS?.trim();
  if (!raw) return new Set(['vedur-collector-pilot']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function resolveVedurCollectorSignatureWindowSec(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VEDUR_COLLECTOR_SIGNATURE_WINDOW_SEC?.trim();
  const n = raw ? Number(raw) : 300;
  return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 300;
}

export function resolveVedurCollectorHmacSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.VEDUR_COLLECTOR_HMAC_SECRET?.trim() ?? '';
}

export function isVedurCollectorIngestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.VEDUR_COLLECTOR_INGEST_ENABLED?.trim();
  return v === '1' || v === 'true';
}

export function isVedurCollectorCanonicalProcessingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env.VEDUR_COLLECTOR_INGEST_CANONICAL?.trim();
  return v === '1' || v === 'true';
}
