/**
 * Plan Studio — React Query hooks 示例（复制到前端仓库后按需调整 import 路径）
 *
 * 依赖：@tanstack/react-query
 * 类型：frontend-constraint-assessment-api.types.ts
 * Client：frontend-travel-decision-contract-api-client.ts
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConstraintAssessments,
  fetchConstraintConsoleWithAssessments,
} from './frontend-travel-decision-contract-api-client';

export const constraintAssessmentQueryKey = (tripId: string) =>
  ['trips', tripId, 'constraint-assessments'] as const;

export const constraintConsoleWithAssessmentsQueryKey = (tripId: string) =>
  ['trips', tripId, 'constraint-console-with-assessments'] as const;

/** 仅 assessments bundle — 可与现有 useTripConstraints 并行 */
export function useConstraintAssessments(
  tripId: string,
  options?: { refresh?: boolean; enabled?: boolean },
) {
  return useQuery({
    queryKey: [...constraintAssessmentQueryKey(tripId), { refresh: options?.refresh ?? false }],
    queryFn: () => fetchConstraintAssessments(tripId, { refresh: options?.refresh }),
    enabled: options?.enabled ?? Boolean(tripId),
    staleTime: 30_000,
  });
}

/** Console + assessments 一次加载（推荐 Constraint Console 页 mount） */
export function useConstraintConsoleWithAssessments(
  tripId: string,
  options?: { refresh?: boolean; enabled?: boolean },
) {
  return useQuery({
    queryKey: [
      ...constraintConsoleWithAssessmentsQueryKey(tripId),
      { refresh: options?.refresh ?? false },
    ],
    queryFn: () =>
      fetchConstraintConsoleWithAssessments(tripId, { refresh: options?.refresh }),
    enabled: options?.enabled ?? Boolean(tripId),
    staleTime: 30_000,
  });
}

/** 约束写回 / validate 后统一失效 */
export function useInvalidateConstraintAssessments() {
  const queryClient = useQueryClient();

  return (tripId: string) => {
    queryClient.invalidateQueries({ queryKey: constraintAssessmentQueryKey(tripId) });
    queryClient.invalidateQueries({
      queryKey: constraintConsoleWithAssessmentsQueryKey(tripId),
    });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'constraints'] });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'executability'] });
  };
}

/**
 * 卡片渲染要点（伪代码）：
 *
 * ```tsx
 * function ConstraintCard({ card }: { card: ConstraintCardView }) {
 *   const accent = card.aggregateUi.accent; // NOT card.constraint.type
 *   return (
 *     <Card accent={accent}>
 *       <Title>{card.name}</Title>
 *       <Subtitle>{card.contractRequirement}</Subtitle>
 *       <AggregateChip tone={card.aggregateUi.tone}>{card.aggregateUi.label}</AggregateChip>
 *       {card.laneBadges.map((lane) => (
 *         <LaneRow key={lane.kind} kind={lane.kind} status={lane.status}>
 *           {lane.label}: {lane.statusLabel}
 *           {lane.ruleId ? ` · ${lane.ruleId}` : null}
 *           {lane.evidenceSummary ? ` · ${lane.evidenceSummary}` : null}
 *         </LaneRow>
 *       ))}
 *       {card.repairDeepLink && card.aggregateUi.isBlocking ? (
 *         <Link to={card.repairDeepLink}>查看修复建议</Link>
 *       ) : null}
 *     </Card>
 *   );
 * }
 * ```
 */
