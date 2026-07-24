#!/usr/bin/env npx tsx
/**
 * Build a signed VedurEvidenceIngestRequest for manual / integration testing.
 *
 * Usage:
 *   VEDUR_COLLECTOR_HMAC_SECRET=xxx npx tsx scripts/sign-vedur-collector-ingest-request.ts \
 *     --payload-file ./sample.xml --trip-id a0a99999-... --day-index 1
 */
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { signVedurCollectorRequest } from '../src/trips/guardian-decision-core/evidence/vedur-collector-signature.util';
import type { VedurEvidenceIngestRequest } from '../src/trips/guardian-decision-core/contracts/vedur-evidence-ingest.types';

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const payloadFile = arg('payload-file');
const tripId = arg('trip-id', 'a0a99999-9999-4999-8999-999999999999');
const dayIndex = Number(arg('day-index', '1'));
const collectorId = arg('collector-id', 'vedur-collector-pilot');
const collectorRegion = arg('collector-region', 'eu-west-1');
const secret = process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim();
if (!secret) {
  console.error('Set VEDUR_COLLECTOR_HMAC_SECRET');
  process.exit(1);
}

const payload = readFileSync(payloadFile, 'utf8');
const payloadSha256 = createHash('sha256').update(payload).digest('hex');
const requestId = `req_${randomUUID()}`;
const signatureTimestamp = new Date().toISOString();

const body: VedurEvidenceIngestRequest = {
  schemaVersion: 'vedur.raw.v1',
  tripId,
  dayIndex,
  provider: 'iceland_met',
  collectorId,
  collectorRegion,
  stationId: '1',
  fetchedAt: new Date().toISOString(),
  contentType: 'application/xml',
  payload,
  payloadSha256,
  requestId,
  signatureTimestamp,
  signature: '',
};

body.signature = signVedurCollectorRequest(body, secret);
console.log(JSON.stringify(body, null, 2));
