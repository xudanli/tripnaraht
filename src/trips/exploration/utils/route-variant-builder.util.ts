import type { RegionTemplate, RouteStrategyProfile } from '../types/exploration.types';

const ROUTE_TITLES: Record<string, string> = {
  'depth-south-coast': '南岸深度',
  'coverage-ring-compressed': '环岛压缩',
  'remote-highlands-south': '高地探索＋南岸',
};

const ROUTE_NARRATIVES: Record<string, string> = {
  'depth-south-coast': '少赶路，把体验集中在南岸与黄金圈，适合希望轻松停留的旅行者。',
  'coverage-ring-compressed': '尽可能覆盖更多冰岛区域，驾驶强度更高，适合时间有限但想看更多地方的旅行者。',
  'remote-highlands-south': '加入高地探索元素，探索感更强，但对车辆、季节和路况要求更高。',
};

export function buildRouteVariantFromStrategy(input: {
  strategy: RouteStrategyProfile;
  template: RegionTemplate;
  routeIndex: number;
  generationVersion: number;
}) {
  const { strategy, template, routeIndex } = input;
  const w = strategy.weights;

  const metrics = {
    exploration: clamp01(w.remoteExploration * 0.6 + w.depth * 0.4),
    drivingIntensity: clamp01(1 - w.drivingPenalty),
    experienceDensity: clamp01(w.depth),
    stayStability: clamp01(w.stayStability),
    flexibility: clamp01(1 - w.uncertaintyPenalty),
    uncertainty: clamp01(1 - w.uncertaintyPenalty),
  };

  const gains = buildGains(strategy.strategyId);
  const sacrifices = buildSacrifices(strategy.strategyId);

  return {
    routeId: `route_${strategy.strategyId}`,
    strategyId: strategy.strategyId,
    variantBranchKey: `variant_${template.templateId}_${routeIndex + 1}`,
    title: ROUTE_TITLES[strategy.strategyId] ?? strategy.strategyId,
    narrative: ROUTE_NARRATIVES[strategy.strategyId] ?? strategy.explanationKey,
    metrics,
    gains,
    sacrifices,
  };
}

function buildGains(strategyId: string) {
  switch (strategyId) {
    case 'depth-south-coast':
      return [
        { id: 'gain_focus', label: '单区域体验更集中' },
        { id: 'gain_drive', label: '每日驾驶时间更可控' },
      ];
    case 'coverage-ring-compressed':
      return [
        { id: 'gain_coverage', label: '覆盖更多经典区域' },
        { id: 'gain_variety', label: '景观类型更丰富' },
      ];
    case 'remote-highlands-south':
      return [
        { id: 'gain_remote', label: '更深入的偏远探索' },
        { id: 'gain_unique', label: '小众路段与高地体验' },
      ];
    default:
      return [];
  }
}

function buildSacrifices(strategyId: string) {
  switch (strategyId) {
    case 'depth-south-coast':
      return [
        { id: 'sac_coverage', label: '放弃部分环岛区域' },
      ];
    case 'coverage-ring-compressed':
      return [
        { id: 'sac_drive', label: '接受更高驾驶强度' },
        { id: 'sac_buffer', label: '停留缓冲更少' },
      ];
    case 'remote-highlands-south':
      return [
        { id: 'sac_vehicle', label: '对车辆与路况要求更高' },
        { id: 'sac_uncertainty', label: '不确定性更高' },
      ];
    default:
      return [];
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}
