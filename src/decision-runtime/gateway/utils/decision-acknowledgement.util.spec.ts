import { BadRequestException } from '@nestjs/common';
import {
  assertAcknowledgementsProvided,
  buildRequiredAcknowledgements,
  extractBadRequestDetails,
} from '../../../trips/decision-semantics/utils/decision-acknowledgement.util';

describe('decision-acknowledgement.util', () => {
  const detail = {
    type: 'INFEASIBILITY' as const,
    semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
    assertions: [
      {
        id: 'a1',
        enforcement: 'BLOCK' as const,
        overridable: false,
        domain: 'ROUTE' as const,
        sourceSystem: 'OFFICIAL_RULE' as const,
        proofs: [],
      },
    ],
  };

  it('builds required acknowledgements for non-overridable BLOCK', () => {
    const required = buildRequiredAcknowledgements({
      requiresConfirmation: true,
      enforcement: 'BLOCK',
      detail,
    });
    expect(required.length).toBeGreaterThan(0);
  });

  it('throws structured error when acknowledgement missing', () => {
    try {
      assertAcknowledgementsProvided({
        requiresConfirmation: true,
        enforcement: 'BLOCK',
        detail,
        acknowledgement: [],
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const details = extractBadRequestDetails(e as BadRequestException);
      expect(details?.requiredAcknowledgements).toBeInstanceOf(Array);
    }
  });
});
