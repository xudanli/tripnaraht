import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type { DraftContractEngineKind, DraftExecutionLevel, DraftContractMode } from './trip-draft-contract.types';

/** 显式 draftRuntimeMode 优先于 legacy useAlgorithmicDraft */
export function resolveDraftEngineKind(dto: CreateTripDraftDto): DraftContractEngineKind {
  if (dto.draftRuntimeMode) return dto.draftRuntimeMode;
  return dto.useAlgorithmicDraft ? 'ALGO' : 'HYBRID';
}

/** 当前实现：一律跑 validate + simulation；预留档位供后续裁剪成本 */
export function resolveExecutionLevel(_mode: DraftContractMode): DraftExecutionLevel {
  return 'VALIDATED';
}
