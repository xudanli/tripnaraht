import type {
  DecisionContextSlice,
  OpenWorldDiscoveryResult,
  OpenWorldPoiStub,
} from '../../../planning-policy/types/open-world-poi.types';

export interface OpenWorldVerificationTask {
  task_id: string;
  stub_id: string;
  title_zh: string;
  description_zh: string;
  priority: 'P0' | 'P1';
  constraint_tags: string[];
  status: 'pending' | 'in_progress' | 'done';
  cta_label_zh: string;
}

export interface OpenWorldDiscoveryUi {
  schema: 'tripnara.open_world_discovery@v1';
  sparse_profile_id?: string;
  mention_count: number;
  stub_count: number;
  verification_tasks: OpenWorldVerificationTask[];
  intentional_slack_summary_zh?: string;
  computed_at: string;
}

function taskFromStub(stub: OpenWorldPoiStub, idx: number): OpenWorldVerificationTask {
  const needsGuide = stub.constraintTags.includes('guide_required');
  const needsPermit = stub.constraintTags.includes('permit_required');
  const parts: string[] = [];
  if (needsGuide) parts.push('确认持证向导');
  if (needsPermit) parts.push('核实许可/报备');
  if (stub.constraintTags.includes('weather_window')) parts.push('对齐天气窗');
  if (stub.constraintTags.includes('bear_zone_buffer')) parts.push('确认防熊区边界');

  return {
    task_id: stub.verificationTaskId ?? `verify_${stub.stubId}`,
    stub_id: stub.stubId,
    title_zh: `核实：${stub.displayName.replace(/（待核实）/g, '')}`,
    description_zh:
      parts.length > 0
        ? `${parts.join('；')}。该区域 POI 未在地图库落地，出发前请完成核实。`
        : '开放世界占位节点：请在出发前确认可达性与执行窗口。',
    priority: needsGuide || needsPermit ? 'P0' : 'P1',
    constraint_tags: stub.constraintTags,
    status: stub.status === 'promoted' ? 'done' : 'pending',
    cta_label_zh: '标记已核实',
  };
}

export function buildOpenWorldDiscoveryUi(input: {
  discovery?: OpenWorldDiscoveryResult | null;
  decisionContext?: DecisionContextSlice | null;
}): OpenWorldDiscoveryUi | undefined {
  const stubs = [
    ...(input.discovery?.stubs ?? []),
    ...(input.decisionContext?.openWorldStubs ?? []),
  ];
  const stubMap = new Map<string, OpenWorldPoiStub>();
  for (const s of stubs) stubMap.set(s.stubId, s);
  const uniqueStubs = [...stubMap.values()];
  if (!uniqueStubs.length && !input.decisionContext?.sparseProfileId) return undefined;

  const verificationTasks = uniqueStubs
    .filter((s) => s.status !== 'promoted' && s.status !== 'discarded')
    .map((s, i) => taskFromStub(s, i));

  const slack = input.decisionContext?.intentionalSlack?.[0];
  const intentionalSlackSummary = slack
    ? `已预留约 ${Math.round(slack.minutesReserved / 60)} 小时${slack.reasonCode === 'SAFETY_BUFFER' ? '安全缓冲' : '天气窗弹性'}，请勿强行填满行程。`
    : input.decisionContext?.sparseProfileId
      ? '稀疏区行程：留白为刻意设计，等待窗口而非缺 POI。'
      : undefined;

  return {
    schema: 'tripnara.open_world_discovery@v1',
    sparse_profile_id: input.decisionContext?.sparseProfileId,
    mention_count:
      (input.discovery?.mentions.length ?? 0) + (input.decisionContext?.openWorldMentions?.length ?? 0),
    stub_count: uniqueStubs.length,
    verification_tasks: verificationTasks,
    intentional_slack_summary_zh: intentionalSlackSummary,
    computed_at: new Date().toISOString(),
  };
}
