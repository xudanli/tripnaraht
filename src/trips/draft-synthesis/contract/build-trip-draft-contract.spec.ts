import { buildTripDraftContract } from './build-trip-draft-contract';
import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import { createDefaultUserIntentState } from '../user-intent/intent-evolution.engine';

describe('buildTripDraftContract', () => {
  it('uses EXPLORATION without tripId', () => {
    const dto = { destination: 'JP', days: 3 } as CreateTripDraftDto;
    const c = buildTripDraftContract({ dto });
    expect(c.mode).toBe('EXPLORATION');
    expect(c.tripId).toBeUndefined();
  });

  it('uses BOOTSTRAP when tripId set', () => {
    const dto = { destination: 'JP', days: 2 } as CreateTripDraftDto;
    const c = buildTripDraftContract({ dto, tripId: 'trip-1' });
    expect(c.mode).toBe('BOOTSTRAP');
    expect(c.tripId).toBe('trip-1');
  });

  it('attaches inferred persona and execution policy', () => {
    const dto = {
      destination: 'JP',
      days: 2,
      userInput: '轻松悠闲一点，不要太累',
    } as CreateTripDraftDto;
    const c = buildTripDraftContract({ dto });
    expect(c.persona?.type).toBe('RELAXER');
    expect(c.executionPolicy?.simulationLevel).toBe('LIGHT');
    expect(c.executionPolicy?.gateProfile).toBe('SOFT');
  });

  it('carries userIntent from param or dto.userIntentSnapshot', () => {
    const ui = createDefaultUserIntentState('user-a');
    const fromParam = buildTripDraftContract({
      dto: { destination: 'JP', days: 2 } as CreateTripDraftDto,
      userIntent: ui,
    });
    expect(fromParam.userIntent?.userId).toBe('user-a');

    const fromDto = buildTripDraftContract({
      dto: {
        destination: 'JP',
        days: 2,
        userIntentSnapshot: createDefaultUserIntentState('user-b'),
      } as CreateTripDraftDto,
    });
    expect(fromDto.userIntent?.userId).toBe('user-b');
  });
});
