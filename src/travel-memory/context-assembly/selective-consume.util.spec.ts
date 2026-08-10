import { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import { assembleTravelContext } from './assemble-travel-context.util';
import {
  buildSelectiveConsumeProjection,
  evaluateSelectiveConsumeGate,
  extractDecisionHints,
} from './selective-consume.util';

describe('selectiveConsume', () => {
  function assembleWithPace(mode: 'SHADOW' | 'CONSUME') {
    const ledger = new MemoryLedgerStore();
    ledger.append({
      subject: { type: 'USER', id: 'U1' },
      memoryType: 'PREFERENCE',
      predicate: 'travel.pace',
      value: 'RELAXED',
      scope: 'GLOBAL_USER',
      source: { type: 'USER_EXPLICIT' },
      confidence: 0.9,
      status: 'ACTIVE',
    });
    return assembleTravelContext({
      task: 'SHOULD_WE_DO_GLACIER_HIKE self-drive Iceland',
      tripId: 'T1',
      userId: 'U1',
      travelMode: 'SELF_DRIVE',
      countryCode: 'IS',
      contractConstraints: ['avoid_night_drive'],
      ledger,
      mode,
    });
  }

  it('gates shadow mode as not allowed', () => {
    const ctx = assembleWithPace('SHADOW');
    const gate = evaluateSelectiveConsumeGate(ctx);
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain('mode_not_consume');
  });

  it('allows consume when decision-safe hints exist', () => {
    const ctx = assembleWithPace('CONSUME');
    const proj = buildSelectiveConsumeProjection(ctx);
    expect(proj.gate.allowed).toBe(true);
    expect(proj.decisionHints.some((h) => h.key === 'travel.pace')).toBe(true);
    expect(proj.contributionPreview.eligible).toBe(true);
    expect(proj.contributionPreview.used).toBe(false);
    expect(proj.slots.contractConstraints).toContain('avoid_night_drive');
    expect(proj.slots.selfDriveKeys.length).toBeGreaterThan(0);
  });

  it('blocks consume outside task allowlist', () => {
    const ctx = assembleWithPace('CONSUME');
    const gate = evaluateSelectiveConsumeGate(ctx, {
      taskAllow: /HOTEL_ONLY_NEVER_MATCH/,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain('task_not_in_consume_allowlist');
  });

  it('extracts episode warnings for high regret', () => {
    const ledger = new MemoryLedgerStore();
    const ctx = assembleTravelContext({
      task: 'SHOULD_WE_DO_GLACIER_HIKE',
      tripId: 'T1',
      userId: 'U1',
      ledger,
      mode: 'CONSUME',
      episodes: [
        {
          schemaId: 'tripnara.decision_episode@v1',
          version: 1,
          episodeId: 'EP1',
          context: { tripId: 'T1', decisionType: 'GLACIER_ACTIVITY' },
          decision: {
            type: 'GLACIER_ACTIVITY',
            alternatives: ['GLACIER_HIKE', 'SKIP'],
            recommended: 'SKIP',
          },
          userAction: { type: 'OVERRIDE', selected: 'GLACIER_HIKE' },
          reflection: { decisionRegret: 0.8 },
          mayPromoteToPreference: false,
        },
      ],
    });
    const hints = extractDecisionHints(ctx.memory!);
    expect(hints.some((h) => h.influence === 'EPISODE_WARNING')).toBe(true);
  });
});
