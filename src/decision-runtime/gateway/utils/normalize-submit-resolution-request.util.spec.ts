import { BadRequestException } from '@nestjs/common';
import { normalizeSubmitResolutionRequest } from './normalize-submit-resolution-request.util';

describe('normalizeSubmitResolutionRequest', () => {
  it('keeps selectedActionId when present', () => {
    expect(
      normalizeSubmitResolutionRequest({
        selectedActionId: 'opt_a',
        reason: 'ok',
      }),
    ).toEqual({
      selectedActionId: 'opt_a',
      reason: 'ok',
      idempotencyKey: undefined,
      acknowledgement: undefined,
    });
  });

  it('maps actionId alias to selectedActionId', () => {
    expect(
      normalizeSubmitResolutionRequest({
        actionId: 'opt_b',
      } as never),
    ).toEqual({
      selectedActionId: 'opt_b',
      idempotencyKey: undefined,
      reason: undefined,
      acknowledgement: undefined,
    });
  });

  it('maps optionId alias to selectedActionId', () => {
    expect(
      normalizeSubmitResolutionRequest({
        optionId: 'opt_c',
      } as never),
    ).toMatchObject({ selectedActionId: 'opt_c' });
  });

  it('throws when no action id is provided', () => {
    expect(() => normalizeSubmitResolutionRequest({} as never)).toThrow(BadRequestException);
    expect(() => normalizeSubmitResolutionRequest({} as never)).toThrow(
      'DECISION_ACTION_REQUIRED',
    );
  });
});
