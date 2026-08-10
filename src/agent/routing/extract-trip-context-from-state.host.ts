/**
 * 从 OrchestratorState 提取 TripContext 宿主（准备度检查）。
 */

export interface ExtractTripContextFromStateHost {
  readonly agentMemoryContextStore?: {
    get: () => { userBasics?: { nationality?: string } } | undefined;
  };

  extractSeason(dateStr: string): string;
}
