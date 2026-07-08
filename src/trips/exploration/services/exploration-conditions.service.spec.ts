import { BadRequestException } from '@nestjs/common';
import { ExplorationConditionsService } from './exploration-conditions.service';
import { ICELAND_DISCOVERY_PROTOCOL } from '../config/iceland-discovery-v1.protocol';

describe('ExplorationConditionsService', () => {
  let service: ExplorationConditionsService;
  let prevEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    prevEnv = { ...process.env };
    process.env.EXPLORATION_CONSUMER_MVP_ENABLED = '1';
    process.env.RESEARCH_PROTOCOL_ENABLED = '0';
    service = new ExplorationConditionsService();
  });

  afterEach(() => {
    process.env = prevEnv;
  });

  const validBody = {
    destinationCodes: ['IS'],
    dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
    travelers: [{ type: 'ADULT' as const }, { type: 'ADULT' as const }],
    budget: { currency: 'USD', min: 3000, max: 4000 },
    mobilityContext: { vehicleType: '4WD_SUV' as const },
  };

  it('consumer mode: no protocol uses user body', () => {
    expect(service.resolveProtocolId({})).toBeNull();
    const input = service.buildInitialInput(validBody, null);
    expect(input.mobilityContext?.vehicleType).toBe('4WD_SUV');
    expect(input.source).toBe('USER_CREATED');
  });

  it('research mode: protocol locks fields', () => {
    const protocolId = 'iceland-discovery-v1';
    expect(service.resolveProtocolId({ researchProtocolId: protocolId })).toBe(protocolId);
    const input = service.buildInitialInput(
      { ...validBody, mobilityContext: { vehicleType: '4WD_SUV' } },
      protocolId,
    );
    expect(input.destinationCodes).toEqual(['IS']);
    expect(input.mobilityContext?.vehicleType).toBe('2WD_COMPACT_SUV');
    expect(service.resolveLockedFields(protocolId)).toEqual(
      expect.arrayContaining(['destinationCodes', 'mobilityContext']),
    );
  });

  it('normalizes mobilityContext.vehicleType lock to mobilityContext', () => {
    const locked = service.normalizeLockedFieldsForClient(
      ICELAND_DISCOVERY_PROTOCOL.lockedFields,
    );
    expect(locked).toContain('mobilityContext');
    expect(locked).not.toContain('mobilityContext.vehicleType');
  });

  it('rejects invalid vehicle type in consumer mode', () => {
    expect(() =>
      service.buildInitialInput(
        { ...validBody, mobilityContext: { vehicleType: 'LIMOUSINE' } },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('patch respects lockedFields', () => {
    const current = service.buildInitialInput(validBody, null);
    const locked = service.resolveLockedFields('iceland-discovery-v1');
    expect(() =>
      service.applyPatch(current, { destinationCodes: ['NZ'] }, locked),
    ).toThrow(/locked/);
  });

  it('returns IS catalog', () => {
    const catalog = service.getCatalog('IS');
    expect(catalog.vehicleTypes.map((v) => v.code)).toContain('4WD_SUV');
    expect(catalog.budgetPresets.length).toBeGreaterThan(0);
  });
});
