import { BadRequestException } from '@nestjs/common';
import { normalizeUpsertTravelIntentInput } from './travel-intent.util';

describe('normalizeUpsertTravelIntentInput', () => {
  it('accepts camelCase fields', () => {
    expect(
      normalizeUpsertTravelIntentInput({
        destinationScope: '西北或新疆',
        startDate: '2026-06-20',
        endDate: '2026-07-05',
      }),
    ).toMatchObject({
      destinationScope: '西北或新疆',
      startDate: '2026-06-20',
      endDate: '2026-07-05',
    });
  });

  it('accepts snake_case aliases stripped-safe by whitelist', () => {
    expect(
      normalizeUpsertTravelIntentInput({
        destination_scope: '西北环线',
        start_date: '2026-06-20',
        end_date: '2026-07-05',
        budget_flex: 'comfort',
        open_to_carpool: false,
      }),
    ).toMatchObject({
      destinationScope: '西北环线',
      budgetFlex: 'comfort',
      openToCarpool: false,
    });
  });

  it('throws validation error instead of trim crash when destination missing', () => {
    expect(() =>
      normalizeUpsertTravelIntentInput({
        startDate: '2026-06-20',
        endDate: '2026-07-05',
      }),
    ).toThrow(BadRequestException);
  });
});
