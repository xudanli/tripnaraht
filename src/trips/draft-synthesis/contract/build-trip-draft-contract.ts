import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type {
  DraftConstraintProfile,
  DraftContractMode,
  TripDraftContract,
} from './trip-draft-contract.types';
import type { UserIntentState } from '../user-intent/user-intent-state.types';
import { inferTravelPersonaFromUserIntent, PolicyEngine } from '../persona-policy';
import { resolveDraftEngineKind, resolveExecutionLevel } from './draft-orchestration';

export interface BuildTripDraftContractParams {
  dto: CreateTripDraftDto;
  contextBlocks?: ContextBlock[];
  /** 有 tripId 时默认 BOOTSTRAP（可被 mode 覆盖） */
  tripId?: string;
  mode?: DraftContractMode;
  /** 显式传入优先于 dto.userIntentSnapshot */
  userIntent?: UserIntentState;
}

function buildConstraintProfile(dto: CreateTripDraftDto, contextBlocks?: ContextBlock[]): DraftConstraintProfile {
  const solverContextInjected =
    contextBlocks?.some((b) => b.type === 'CONSTRAINTS' && String(b.key || '').toLowerCase().includes('solver')) ??
    false;
  const regionAnchorPlanning = !!(dto.region_id || dto.userInput);
  return { solverContextInjected, regionAnchorPlanning };
}

/**
 * 从 HTTP / NL 入口参数构造统一草案契约。
 */
export function buildTripDraftContract(params: BuildTripDraftContractParams): TripDraftContract {
  const { dto, contextBlocks, tripId, mode: modeOverride, userIntent: userIntentParam } = params;
  const mode: DraftContractMode =
    modeOverride ?? (tripId ? 'BOOTSTRAP' : 'EXPLORATION');

  const userIntent = userIntentParam ?? dto.userIntentSnapshot;
  const persona = inferTravelPersonaFromUserIntent(userIntent, { userInput: dto.userInput });
  const executionPolicy = PolicyEngine.selectExecutionPolicy(persona, { mode });

  return {
    tripId,
    mode,
    input: dto,
    engine: resolveDraftEngineKind(dto),
    context: contextBlocks,
    constraintsProfile: buildConstraintProfile(dto, contextBlocks),
    executionLevel: resolveExecutionLevel(mode),
    userIntent,
    persona,
    executionPolicy,
  };
}
