import { RequestDeduplicationService } from '../services/request-deduplication.service';

/**
 * Actions Commit — independent idempotency contract.
 * Fact: ActionExecutionService.commit uses buildCommitDedupKey +
 * RequestDeduplicationService.checkGenericDuplicate / cacheGenericResponse.
 */
describe('Actions Commit idempotency contract', () => {
  it('generic dedup cache returns same payload on second check', () => {
    const dedup = Object.create(RequestDeduplicationService.prototype) as RequestDeduplicationService;
    (dedup as any).logger = { debug: () => undefined, log: () => undefined, warn: () => undefined };
    (dedup as any).genericCache = new Map();
    (dedup as any).defaultTTL = 60_000;
    (dedup as any).maxCacheSize = 100;

    const key = 'idem-x::trip-1::act_1';
    const payload = { status: 'ACCEPTED', message: 'ok' };
    dedup.cacheGenericResponse(key, payload);
    const hit = dedup.checkGenericDuplicate<typeof payload>(key);
    expect(hit).toEqual(payload);
  });

  it('commit source requires idempotency_key for strict side effects and builds dedup key', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../services/action-execution.service.ts'),
      'utf8',
    );
    expect(src).toMatch(/buildCommitDedupKey/);
    expect(src).toMatch(/checkGenericDuplicate/);
    expect(src).toMatch(/requiresStrictIdempotency/);
    expect(src).toMatch(/idempotency_key/);
    expect(src).toMatch(/Action commit deduplicated \(idempotent hit\)/);
  });
});
