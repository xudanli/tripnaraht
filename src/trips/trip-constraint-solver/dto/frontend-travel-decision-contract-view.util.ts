import type {
  ConstraintConsoleSectionView,
  ConstraintConsoleViewModel,
  TripConstraintsListResponse,
} from './frontend-travel-decision-contract-api.types';

/** 将 GET /constraints 原始响应投影为分区视图（前端禁止自行拼装 section 规则） */
export function buildConstraintConsoleViewModel(
  data: TripConstraintsListResponse,
): ConstraintConsoleViewModel {
  const itemsById = Object.fromEntries(data.items.map((item) => [item.id, item]));

  const sections: ConstraintConsoleSectionView[] = (data.meta.sections ?? []).map((section) => ({
    section,
    constraints: section.constraintIds
      .map((id) => itemsById[id])
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    contractBlock: section.contractBlock,
  }));

  return {
    constraintsVersion: data.meta.constraintsVersion,
    itemsById,
    sections,
    contract: data.contract,
  };
}

/** 高亮冲突约束卡片 */
export function highlightConflictConstraintIds(
  view: ConstraintConsoleViewModel,
): Set<string> {
  return new Set(view.contract.conflicts.conflictConstraintIds);
}

/** 判断约束卡片是否只读（官方规则 / 世界快照） */
export function isReadonlyConstraint(item: { source: { type: string } }): boolean {
  return item.source.type === 'OFFICIAL_RULE' || item.source.type === 'WORLD_DATA';
}

/** 软约束 priority 数字 → 展示 tier */
export function softPriorityTier(priority?: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (priority == null) return 'MEDIUM';
  if (priority >= 8) return 'HIGH';
  if (priority >= 5) return 'MEDIUM';
  return 'LOW';
}
