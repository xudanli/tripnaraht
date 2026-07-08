import { TravelDecisionContractPrincipleMappingService } from './services/travel-decision-contract-principle-mapping.service';
import type { ConsumerPrincipleId } from './constants/exploration-status.constants';
import { mergeExplorationInputWithProtocol } from './utils/exploration-input.util';
import { ICELAND_DISCOVERY_PROTOCOL } from './config/iceland-discovery-v1.protocol';

describe('TravelDecisionContractPrincipleMappingService', () => {
  const service = new TravelDecisionContractPrincipleMappingService();

  it('maps consumer principles to contract rankedPrinciples in rank order', () => {
    const result = service.mapConsumerPrinciples([
      { principleId: 'LOW_DRIVING', rank: 1 },
      { principleId: 'CORE_EXPERIENCE_FIRST', rank: 2 },
      { principleId: 'STAY_STABILITY', rank: 3 },
    ]);

    expect(result.rankedPrinciples).toEqual(['PACE', 'CORE_EXPERIENCE', 'FEWER_HOTEL_CHANGES']);
  });

  it('dedupes duplicate contract keys from multiple consumer cards', () => {
    const result = service.mapConsumerPrinciples([
      { principleId: 'LOW_DRIVING', rank: 1 },
      { principleId: 'NO_NIGHT_DRIVING', rank: 2 },
    ]);
    expect(result.rankedPrinciples).toEqual(['PACE', 'SAFETY']);
  });
});

describe('mergeExplorationInputWithProtocol', () => {
  it('applies locked protocol fields for iceland research', () => {
    const merged = mergeExplorationInputWithProtocol(
      {
        destinationCodes: ['NZ'],
        dateRange: { startDate: '2026-01-01', endDate: '2026-01-09' },
        travelers: [{ type: 'ADULT' }],
        source: 'USER_CREATED',
        mobilityContext: { vehicleType: '4WD' },
      },
      ICELAND_DISCOVERY_PROTOCOL.defaultScenario,
      ICELAND_DISCOVERY_PROTOCOL.lockedFields,
    );

    expect(merged.destinationCodes).toEqual(['IS']);
    expect(merged.mobilityContext?.vehicleType).toBe('2WD_COMPACT_SUV');
    expect(merged.budget?.max).toBe(4000);
  });
});

describe('Consumer principle catalog', () => {
  it('covers all six MVP cards', () => {
    const service = new TravelDecisionContractPrincipleMappingService();
    const cards = service.listConsumerPrincipleCards();
    const ids = cards.map((c) => c.principleId);
    const expected: ConsumerPrincipleId[] = [
      'LOW_DRIVING',
      'NO_NIGHT_DRIVING',
      'CORE_EXPERIENCE_FIRST',
      'REMOTE_EXPLORATION',
      'BUDGET_FLEXIBLE',
      'STAY_STABILITY',
    ];
    expect(ids).toEqual(expect.arrayContaining(expected));
    expect(ids.length).toBe(6);
  });
});
