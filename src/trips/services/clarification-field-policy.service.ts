import { Injectable } from '@nestjs/common';
import type {
  ClarificationFieldPolicy,
  ClarificationStage,
  LightweightTripIntent,
} from '../types/nl-draft-trip.types';

@Injectable()
export class ClarificationFieldPolicyService {
  private readonly defaultPolicies: ClarificationFieldPolicy[] = [
    {
      field: 'destination',
      requiredAt: 'STRATEGY_GENERATION',
      blockingLevel: 'BLOCK_CURRENT_STEP',
      fallbackPolicy: 'ASK_USER',
      informationGain: 1,
      question: '这次旅行你最想锁定哪个国家或地区？',
    },
    {
      field: 'duration_or_date',
      requiredAt: 'STRATEGY_GENERATION',
      blockingLevel: 'BLOCK_CURRENT_STEP',
      fallbackPolicy: 'ASK_USER',
      informationGain: 0.9,
      question: '你大概想安排几天，或者计划哪个月份出发？',
    },
    {
      field: 'glacier_participation_scope',
      requiredAt: 'ITINERARY_GENERATION',
      blockingLevel: 'NON_BLOCKING',
      fallbackPolicy: 'USE_INFERENCE',
      informationGain: 0.85,
      question: '冰川体验只有你参加也可以吗？',
    },
    {
      field: 'pace',
      requiredAt: 'STRATEGY_GENERATION',
      blockingLevel: 'NON_BLOCKING',
      fallbackPolicy: 'USE_CONSERVATIVE_DEFAULT',
      informationGain: 0.65,
      question: '这次更偏舒适少折腾，还是可以接受每天安排紧一点？',
    },
    {
      field: 'vehicleType',
      requiredAt: 'CANDIDATE_VERIFICATION',
      blockingLevel: 'BLOCK_CURRENT_STEP',
      fallbackPolicy: 'USE_CONSERVATIVE_DEFAULT',
      informationGain: 0.55,
      question: '这次自驾车型大概是两驱还是四驱？',
    },
    {
      field: 'visaStatus',
      requiredAt: 'BOOKING',
      blockingLevel: 'BLOCK_EXECUTION',
      fallbackPolicy: 'MARK_UNKNOWN',
      informationGain: 0.3,
      question: '签证状态现在是已办好、办理中，还是还没开始？',
    },
  ];

  missingFieldsForStage(intent: LightweightTripIntent, stage: ClarificationStage): ClarificationFieldPolicy[] {
    return this.defaultPolicies
      .filter((policy) => policy.requiredAt === stage)
      .filter((policy) => this.isMissing(policy, intent))
      .sort((a, b) => b.informationGain - a.informationGain);
  }

  pickNextQuestion(intent: LightweightTripIntent, stages: ClarificationStage[]): ClarificationFieldPolicy | undefined {
    return stages
      .flatMap((stage) => this.missingFieldsForStage(intent, stage))
      .sort((a, b) => b.informationGain - a.informationGain)[0];
  }

  private isMissing(policy: ClarificationFieldPolicy, intent: LightweightTripIntent): boolean {
    switch (policy.field) {
      case 'destination':
        return !intent.destinationCountryCode && !intent.destinationText;
      case 'duration_or_date':
        return !intent.durationDays && intent.datePrecision === 'NONE';
      case 'glacier_participation_scope':
        return intent.mustHaveExperiences.includes('GLACIER_ADVENTURE') && intent.companions.includes('PARENTS');
      case 'pace':
        return !intent.pace && intent.companions.includes('PARENTS');
      default:
        return false;
    }
  }
}
