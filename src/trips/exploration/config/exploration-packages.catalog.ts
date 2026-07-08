export type ExplorationPackageId =
  | 'full_report'
  | 'auto_repair'
  | 'expert_review'
  | 'trip_assurance';

export interface ExplorationPackageDefinition {
  packageId: ExplorationPackageId;
  title: string;
  subtitle: string;
  description: string;
  valueProps: string[];
}

export const EXPLORATION_PACKAGE_CATALOG: Record<
  ExplorationPackageId,
  ExplorationPackageDefinition
> = {
  full_report: {
    packageId: 'full_report',
    title: '完整检查报告',
    subtitle: '出发前看清整趟行程的风险与缺口',
    description: '对整趟行程做系统性可执行性检查，输出结构化报告与优先修复清单。',
    valueProps: ['覆盖交通、规则、季节与衔接', '按严重程度排序', '附官方来源摘要'],
  },
  auto_repair: {
    packageId: 'auto_repair',
    title: '自动修复服务',
    subtitle: '低风险问题自动处理，高风险需你确认',
    description: '在授权范围内自动应用缓冲调整、资源替换等低风险修复。',
    valueProps: ['减少手动改行程时间', '每次修改可回滚', '保留你的核心体验目标'],
  },
  expert_review: {
    packageId: 'expert_review',
    title: '专家复核',
    subtitle: '复杂路线由人类专家二次把关',
    description: '资深规划师复核你的路线、车辆与季节匹配，并给出书面建议。',
    valueProps: ['适合高地/极地/多国衔接', '48h 内书面反馈', '可针对单一阻断深度解释'],
  },
  trip_assurance: {
    packageId: 'trip_assurance',
    title: '行前＋行中保障',
    subtitle: '出发前检查 + 行中异常提醒',
    description: '出发前完整复检；行中若规则或路况变化，推送影响评估与可选修复。',
    valueProps: ['关键规则变化主动通知', '行中一键查看影响', '不含代订或代驾'],
  },
};

export const DEFAULT_PACKAGE_IDS: ExplorationPackageId[] = [
  'full_report',
  'auto_repair',
  'expert_review',
  'trip_assurance',
];
