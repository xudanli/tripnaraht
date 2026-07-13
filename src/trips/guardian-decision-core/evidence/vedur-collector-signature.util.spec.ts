import { createHash } from 'crypto';
import {
  signVedurCollectorRequest,
  verifyVedurCollectorSignature,
  resolveVedurCollectorAllowedIds,
} from './vedur-collector-signature.util';
import type { VedurEvidenceIngestRequest } from '../contracts/vedur-evidence-ingest.types';

describe('vedur-collector-signature.util', () => {
  const secret = 'test-collector-secret';

  function sampleBody(): VedurEvidenceIngestRequest {
    const payload = '<observations><station id="1"><F>5</F></station></observations>';
    const payloadSha256 = createHash('sha256').update(payload).digest('hex');
    const base = {
      schemaVersion: 'vedur.raw.v1' as const,
      tripId: 'a0a99999-9999-4999-8999-999999999999',
      dayIndex: 1,
      provider: 'iceland_met' as const,
      collectorId: 'vedur-collector-pilot',
      collectorRegion: 'eu-west-1',
      fetchedAt: new Date().toISOString(),
      contentType: 'application/xml' as const,
      payload,
      payloadSha256,
      requestId: 'req_test_001',
      signatureTimestamp: new Date().toISOString(),
      signature: '',
    };
    base.signature = signVedurCollectorRequest(base, secret);
    return base;
  }

  it('verifies valid HMAC signature', () => {
    const body = sampleBody();
    expect(verifyVedurCollectorSignature(body, secret)).toBe(true);
  });

  it('rejects tampered payload hash', () => {
    const body = sampleBody();
    body.payloadSha256 = createHash('sha256').update('tampered').digest('hex');
    expect(verifyVedurCollectorSignature(body, secret)).toBe(false);
  });

  it('resolves allowed collector ids', () => {
    process.env.VEDUR_COLLECTOR_ALLOWED_IDS = 'a,b';
    expect(resolveVedurCollectorAllowedIds()).toEqual(new Set(['a', 'b']));
    delete process.env.VEDUR_COLLECTOR_ALLOWED_IDS;
  });
});
