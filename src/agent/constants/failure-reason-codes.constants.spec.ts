import {
  failureReasonCodeLabelZh,
  failureReasonCodesFromHardGaps,
  sortFailureReasonCodes,
} from './failure-reason-codes.constants';

describe('failure-reason-codes.constants', () => {
  it('sortFailureReasonCodes puts security tier before slot tier', () => {
    expect(
      sortFailureReasonCodes(['MISSING_DESTINATION', 'DRIVE_SAFETY_VIOLATED', 'TIME_GAP']),
    ).toEqual(['DRIVE_SAFETY_VIOLATED', 'MISSING_DESTINATION', 'TIME_GAP']);
  });

  it('failureReasonCodeLabelZh maps known codes to Chinese', () => {
    expect(failureReasonCodeLabelZh('VERIFICATION_FAILED_UNSPECIFIED')).toContain('验证');
  });

  it('failureReasonCodesFromHardGaps maps HARD gaps to product codes', () => {
    expect(
      failureReasonCodesFromHardGaps([
        { severity: 'HARD', type: 'MISSING_DESTINATION', detail: 'x' },
        { severity: 'HARD', type: 'MISSING_DATES', detail: 'y' },
        { severity: 'SOFT', type: 'MISSING_DATES', detail: 'z' },
      ]),
    ).toEqual(['MISSING_DESTINATION', 'TIME_GAP']);
  });
});
