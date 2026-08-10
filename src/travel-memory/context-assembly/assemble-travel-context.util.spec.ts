import { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import {
  assembleTravelContext,
  buildContextAssemblyContract,
} from './assemble-travel-context.util';
import { CONTEXT_ASSEMBLY_BOUNDARY } from './context-assembly.types';

describe('assembleTravelContext', () => {
  it('keeps Decision Contract / Self-drive / Memory in separate slots', () => {
    const ledger = new MemoryLedgerStore();
    ledger.append({
      subject: { type: 'USER', id: 'U1' },
      memoryType: 'PREFERENCE',
      predicate: 'travel.pace',
      value: 'RELAXED',
      scope: 'GLOBAL_USER',
      source: { type: 'USER_EXPLICIT' },
      confidence: 1,
      status: 'ACTIVE',
    });

    const ctx = assembleTravelContext({
      task: 'SHOULD_WE_DO_GLACIER_HIKE self-drive Iceland',
      tripId: 'T1',
      userId: 'U1',
      travelMode: 'SELF_DRIVE',
      countryCode: 'IS',
      contractConstraints: ['avoid_night_drive', 'max_daily_drive_240'],
      tripGoal: 'Iceland winter self-drive',
      ledger,
      mode: 'SHADOW',
    });

    expect(ctx.contract.deny).toEqual(
      expect.arrayContaining(['SELF_DRIVE_AS_MEMORY', 'CONTRACT_AS_MEMORY']),
    );
    expect(ctx.decisionContract?.constraints).toContain('avoid_night_drive');
    expect(ctx.decisionContract?.source).toBe('REQUEST_HINTS');
    expect(ctx.selfDriveWorld?.keys).toContain('road_status');
    expect(ctx.selfDriveWorld?.hasFullContext).toBe(false);
    expect(ctx.memory?.decisionSafe).toBe(true);
    expect(ctx.memory?.structured.pace?.value).toBe('RELAXED');
    expect(ctx.shadowBaseline.memoryOmitted).toBe(true);
    expect(CONTEXT_ASSEMBLY_BOUNDARY.wrongPatternZh).toContain('禁止夜驾');
  });

  it('plans assembly contract with memory + self-drive for activity tasks', () => {
    const c = buildContextAssemblyContract({
      task: 'SHOULD_WE_DO_GLACIER_HIKE',
      tripId: 'T1',
      travelMode: 'SELF_DRIVE',
    });
    expect(c.providers).toEqual(
      expect.arrayContaining(['MEMORY', 'DECISION_CONTRACT', 'SELF_DRIVE_WORLD']),
    );
  });
});
