/**
 * pre_plan 全链宿主：各 OrchestratorNode 仍由 ClaudeOrchestrator 懒创建。
 */

import type { Logger } from '@nestjs/common';

export interface PrePlanFullChainHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  getIntakeNode(): { runPrePlanSegment: (input: any) => Promise<any> };
  getStateUpdateNode(): { runPrePlanSegment: (input: any) => Promise<any> };
  getResearchNode(): { runPrePlanSegment: (input: any) => Promise<any> };
  getPoiSelectionNode(): { runPrePlanSegment: (input: any) => Promise<any> };
  getGateEvalNode(): { runPrePlanSegment: (input: any) => Promise<any> };
  getContextBuildNode(): { runPrePlanSegment: (input: any) => Promise<any> };
}
