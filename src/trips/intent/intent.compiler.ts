/**
 * Intent Compiler — 将自然语言或显式 TripIntent 编译为评分权重与软约束（MVP 规则表）
 */

import type {
  MobilityPreference,
  PacePreference,
  TripContext,
  TripIntent,
  UserMessage,
} from './intent.model';

export interface ScoringWeights {
  /** 驾驶耗时（越低越好通常为负权） */
  readonly driveTime: number;
  readonly scenicValue: number;
  readonly fatigue: number;
}

export interface SoftConstraints {
  readonly maxDailyDriveHours?: number;
  readonly preferScenicRoutes?: boolean;
}

export interface CompiledIntent {
  readonly weights: ScoringWeights;
  readonly constraints: SoftConstraints;
  readonly priorities: readonly string[];
}

export interface IntentCompileInput {
  readonly message?: UserMessage;
  readonly tripContext?: TripContext;
  readonly history?: readonly string[];
  readonly explicitIntent?: TripIntent;
}

function weightsFromExplicit(intent: TripIntent): ScoringWeights {
  let driveTime = 0;
  let scenicValue = 0;
  let fatigue = 0;

  switch (intent.mobilityPreference) {
    case 'LOW_DRIVE':
      driveTime -= 1.5;
      scenicValue += 1.2;
      fatigue -= 1.0;
      break;
    case 'BALANCED':
      driveTime -= 0.3;
      scenicValue += 0.4;
      fatigue -= 0.3;
      break;
    case 'ROAD_TRIP':
      driveTime += 0.6;
      scenicValue += 0.5;
      fatigue -= 0.2;
      break;
    default:
      break;
  }

  switch (intent.pace) {
    case 'RELAXED':
      fatigue -= 1.2;
      driveTime -= 0.4;
      break;
    case 'NORMAL':
      fatigue -= 0.2;
      break;
    case 'INTENSIVE':
      fatigue += 0.3;
      driveTime += 0.2;
      break;
    default:
      break;
  }

  const { nature, driving, city } = intent.experienceBias;
  const sum = nature + driving + city || 1;
  scenicValue += (nature / sum) * 0.8 - (driving / sum) * 0.3;

  return { driveTime, scenicValue, fatigue };
}

function maxDailyHours(intent: TripIntent): number {
  switch (intent.mobilityPreference) {
    case 'LOW_DRIVE':
      return 3;
    case 'BALANCED':
      return 5;
    case 'ROAD_TRIP':
      return 8;
    default:
      return 5;
  }
}

/** 可写入片段（`Partial<TripIntent>` 仍带 readonly，不能直接赋值） */
type TripIntentMessageHints = {
  mobilityPreference?: MobilityPreference;
  pace?: PacePreference;
};

/** 极简 NL 关键词启发（无外部模型；生产可替换为 LLM） */
function inferFromMessage(text: string): TripIntentMessageHints | undefined {
  const t = text.toLowerCase();
  const out: TripIntentMessageHints = {};
  if (
    t.includes('少开') ||
    t.includes('轻松') ||
    t.includes('less drive') ||
    t.includes('scenic')
  ) {
    out.mobilityPreference = 'LOW_DRIVE';
    out.pace = 'RELAXED';
  }
  if (t.includes('紧凑') || t.includes('赶') || t.includes('intensive')) {
    out.pace = 'INTENSIVE';
  }
  if (t.includes('公路') || t.includes('road trip')) {
    out.mobilityPreference = 'ROAD_TRIP';
  }
  return Object.keys(out).length ? out : undefined;
}

function defaultIntent(): TripIntent {
  return {
    mobilityPreference: 'BALANCED',
    pace: 'NORMAL',
    riskTolerance: 'MEDIUM',
    experienceBias: { nature: 1, driving: 1, city: 1 },
  };
}

function mergeIntent(
  base: TripIntent,
  partial?: Partial<TripIntent>,
): TripIntent {
  if (!partial) return base;
  return {
    mobilityPreference:
      partial.mobilityPreference ?? base.mobilityPreference,
    pace: partial.pace ?? base.pace,
    riskTolerance: partial.riskTolerance ?? base.riskTolerance,
    experienceBias: partial.experienceBias ?? base.experienceBias,
  };
}

export function compileIntent(input: IntentCompileInput): CompiledIntent {
  let intent = input.explicitIntent ?? defaultIntent();
  if (input.message?.text) {
    const inferred = inferFromMessage(input.message.text);
    intent = mergeIntent(intent, inferred);
  }

  const weights = weightsFromExplicit(intent);
  const maxDailyDriveHours = maxDailyHours(intent);
  const natureBias = intent.experienceBias.nature;
  const drivingBias = intent.experienceBias.driving;
  const preferScenicRoutes = natureBias >= drivingBias;

  const priorities: string[] = [];
  if (intent.pace === 'RELAXED') {
    priorities.push('minimize_fatigue');
  }
  if (intent.mobilityPreference === 'LOW_DRIVE') {
    priorities.push('minimize_daily_drive');
  }
  priorities.push('maximize_scenic_experience');

  return {
    weights,
    constraints: {
      maxDailyDriveHours,
      preferScenicRoutes,
    },
    priorities,
  };
}
