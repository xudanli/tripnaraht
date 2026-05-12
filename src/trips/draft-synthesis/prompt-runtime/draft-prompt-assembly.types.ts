import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';

/** Experience Draft Synthesis：Prompt Runtime 组装输入（分层渲染的单一事实源） */
export interface DraftPromptAssemblyInput {
  dto: CreateTripDraftDto;
  candidates: CandidatePlace[];
  days: Array<{ day: number; date: string }>;
  /** 目的地时区（由 TripDraftService.timezoneForDestination 解析） */
  timezone: string;
  contextBlocks?: ContextBlock[];
}
