/**
 * 轻量问答用「路段–区域」硬锚点附录（Semantic Linking MVP + 动态路况真值）。
 *
 * 静态：ontology 节点 ID + 主路网示意 + 行程共位。
 * 动态：由 `OntologyRoadStatusProviderService` 注入 `accessState` / `condition`（见 `roadStatusByOntologyId`）。
 */

import type { OntologyRegionRoadStatusPayload } from '../../infrastructure/external/road-is/ontology-road-status-provider.service';
import type { RoadAccessState } from '../../domain/ontology/validator/road-status-contract.types';

export interface LightweightHardOntologyAppendixInput {
  message: string;
  msgLower: string;
  /** `resolveTripPromptSummaryForLightweightQa` 拼接后的全文（含草案速览） */
  tripContextText: string;
  /** 可选：由 OntologyRoadStatusProvider 预取的区段路况真值 */
  roadStatusByOntologyId?: ReadonlyMap<string, OntologyRegionRoadStatusPayload> | null;
}

export interface HardOntologyRegionDefinition {
  /** 稳定 URI 式键，非 DB 主键；后续可映射到 Place / SpatialDomainSegment */
  ontologyNodeId: string;
  labelZh: string;
  labelEn: string;
  /** 半岛 / 走廊等 */
  kind: 'Region' | 'Corridor';
  /** 中文简述常见国道编号（示意，以 road.is 与地图为准） */
  roadRefsZh: string;
  /** 问句中可触发该区域的子串（小写用于 msgLower） */
  messageTriggersLower: string[];
  /** 行程摘要中出现时视为「草案与该区域共位」的锚点（中文或常见拼写片段） */
  tripDraftSignals: string[];
}

/** MVP：冰岛高频自驾走廊；按需扩展条目 */
const IS_REGIONS: HardOntologyRegionDefinition[] = [
  {
    ontologyNodeId: 'ontology:region:IS:SNAEFELLSNES',
    labelZh: '斯奈山半岛',
    labelEn: 'Snæfellsnes',
    kind: 'Region',
    roadRefsZh: '54、56、574（半岛骨架多为铺装；观景点岔路偶见碎石，以 road.is 为准）',
    messageTriggersLower: [
      '斯奈山',
      '斯奈山半岛',
      'snaefellsnes',
      'snæfellsnes',
      '教会山',
      '草帽山',
      'kirkjufell',
      '格伦达菲厄泽',
      'grundarfjordur',
      'djúpalón',
      'djupalon',
      '阿尔纳斯塔皮',
      'arnarstapi',
      '斯蒂基斯霍尔米',
      'stýkkishólmur',
      'stykkisholmur',
    ],
    tripDraftSignals: [
      '教会山',
      '草帽山',
      '格伦达菲厄泽',
      '斯奈山',
      '斯奈菲尔',
      'Djúpalón',
      'Djupalon',
      '阿尔纳斯塔皮',
      '斯蒂基斯',
      'Snæfells',
      'Snaefells',
    ],
  },
  {
    ontologyNodeId: 'ontology:corridor:IS:SOUTH_COAST',
    labelZh: '冰岛南岸走廊',
    labelEn: 'South Coast (Route 1 corridor)',
    kind: 'Corridor',
    roadRefsZh: '一号公路（Route 1）为主轴；支线含 218、249 等，以 road.is 为准',
    messageTriggersLower: [
      '南岸',
      '南部海岸',
      '维克',
      'vik',
      '斯科加',
      'skoga',
      '塞里雅兰',
      'seljalands',
      '黑沙滩',
      '冰河湖',
      '杰古沙龙',
      '钻石沙滩',
    ],
    tripDraftSignals: ['维克', '斯科加', '塞里雅兰', '冰河湖', '杰古沙龙', '黑沙滩', '斯卡夫塔', '钻石沙'],
  },
];

const DRIVING_OR_ROAD_INTENT =
  /路况|封路|天气|风速|能开吗|自驾|租车|开车|用车|碎石|f\s*路|f-road|road\.is|vedur|通行|驾驶|交规/i;

function tripLooksLikeIceland(tripText: string, msgLower: string): boolean {
  const t = tripText.toLowerCase();
  if (/目的地代码:\s*is[-,]/i.test(tripText) || /\bis[-,]/i.test(t)) return true;
  if (/冰岛|iceland|reykjavik|雷克雅未克/i.test(tripText)) return true;
  return /冰岛|iceland|reykjavik|雷克雅未克/i.test(msgLower);
}

function messageTriggersRegion(def: HardOntologyRegionDefinition, msgLower: string): boolean {
  return def.messageTriggersLower.some((x) => msgLower.includes(x));
}

function tripCoversRegion(def: HardOntologyRegionDefinition, tripText: string): boolean {
  if (!tripText.trim()) return false;
  return def.tripDraftSignals.some((sig) => tripText.includes(sig));
}

/** 是否值得注入硬锚点层（避免闲聊叠块） */
export function shouldInjectLightweightHardRoadOntologyLayer(
  message: string,
  msgLower: string,
  tripContextText: string,
): boolean {
  if (!tripLooksLikeIceland(tripContextText, msgLower)) return false;
  for (const def of IS_REGIONS) {
    if (messageTriggersRegion(def, msgLower)) return true;
    if (tripCoversRegion(def, tripContextText) && DRIVING_OR_ROAD_INTENT.test(message)) return true;
  }
  return false;
}

/** 与附录命中集合一致，供编排层拉取路况真值 */
export function collectMatchedOntologyRegionDefinitions(
  input: Pick<LightweightHardOntologyAppendixInput, 'message' | 'msgLower' | 'tripContextText'>,
): HardOntologyRegionDefinition[] {
  const { message, msgLower, tripContextText } = input;
  if (!shouldInjectLightweightHardRoadOntologyLayer(message, msgLower, tripContextText)) {
    return [];
  }
  const hits: HardOntologyRegionDefinition[] = [];
  for (const def of IS_REGIONS) {
    const byMsg = messageTriggersRegion(def, msgLower);
    const byTrip = tripCoversRegion(def, tripContextText) && DRIVING_OR_ROAD_INTENT.test(message);
    if (byMsg || byTrip) hits.push(def);
  }
  return hits;
}

function formatRoadPayloadLines(payload: OntologyRegionRoadStatusPayload): string[] {
  const rows = payload.segments.map((s) => {
    const idPart = s.spatialSegmentId ? `segment_id=${s.spatialSegmentId}` : 'segment_id=(none)';
    return `    - road=${s.roadQueryKey} | ${idPart} | source=${s.source} | accessState=${s.accessState} | condition=${s.condition}${s.condition_text ? ` | text=${JSON.stringify(s.condition_text)}` : ''}`;
  });
  return [
    `  - **路况真值（系统查询）** aggregateAccessState=\`${payload.aggregateAccessState}\``,
    `  - 明细（须与正文一致；若与常识冲突以本块为准）：`,
    ...rows,
  ];
}

/**
 * 构造若干行 Prompt 文本；无命中时返回空数组。
 */
export function buildLightweightHardOntologyAppendixLines(
  input: LightweightHardOntologyAppendixInput,
): string[] {
  const { message, msgLower, tripContextText, roadStatusByOntologyId } = input;
  const hits = collectMatchedOntologyRegionDefinitions({ message, msgLower, tripContextText });
  if (hits.length === 0) return [];

  const hasLive = Boolean(roadStatusByOntologyId && roadStatusByOntologyId.size > 0);

  const lines: string[] = [
    '### 实体硬锚点（系统生成 · Region→路网 · MVP）',
    hasLive
      ? '以下含**规则绑定**的本体节点与**系统已查询**的路段 `accessState` / `condition`（来自 `spatial_domain_segments.latest_status` 缓存或 Road.is 直连/mock）；须与正文一致，**禁止编造**与附录矛盾的封路或准入态。个案仍以 road.is / SafeTravel 为准。'
      : '以下为**预先规则绑定**的本体节点与主路网编号示意；未附带路况真值子块时，须提示用户查阅 road.is / SafeTravel，**禁止编造**具体封路或 `accessState`。',
    '【强约束】若某区域 `aggregateAccessState` 为 `IMPASSABLE` / `SEASONAL_CLOSED` / `FLOOD_RISK`，正文必须明确该关键路段当前不可通行或存在高风险；`RESTRICTED_4WD` 须提示四驱/车型与保险要求；`OPEN` 仍须说明强风等气象风险可能单独封路。',
  ];

  for (const def of hits) {
    const coLocated = tripCoversRegion(def, tripContextText);
    const payload = roadStatusByOntologyId?.get(def.ontologyNodeId);
    lines.push(
      [
        `- **[${def.ontologyNodeId}]** ${def.labelZh}（${def.labelEn}）`,
        `  - 类型: ${def.kind}`,
        `  - 关联主路网（示意）: ${def.roadRefsZh}`,
        coLocated ? '  - 与上文行程摘要/草案地点: **检测到共位锚点**（请优先用草案中的 Place 名对齐回答，勿张冠李戴）。' : '',
        ...(payload ? formatRoadPayloadLines(payload) : []),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return lines;
}

const ACCESS_STATE_LABEL_ZH: Record<RoadAccessState, string> = {
  OPEN: '可正常通行（开放）',
  RESTRICTED_4WD: '仅限四驱或更高车型',
  IMPASSABLE: '不可通行（封闭或不可达）',
  SEASONAL_CLOSED: '季节性封闭',
  FLOOD_RISK: '洪水相关风险，不建议通行',
};

/**
 * 供 API / 决策日志 UI 展示：将本体节点与路况真值压缩为自然中文短句（不含内部 ontology URI 细节）。
 */
export function buildOntologyEvidenceDisplayLinesZh(params: {
  hits: HardOntologyRegionDefinition[];
  roadStatusByOntologyId?: ReadonlyMap<string, OntologyRegionRoadStatusPayload> | null;
}): string[] {
  const { hits, roadStatusByOntologyId } = params;
  if (!hits.length) return [];
  const out: string[] = [];
  out.push(
    '系统已根据您的问句或行程草案，匹配到下列自驾区域，并查询了关联主干路状态（出行前仍请以 road.is / SafeTravel 官方为准）：',
  );
  for (const def of hits) {
    const payload = roadStatusByOntologyId?.get(def.ontologyNodeId);
    const roads = payload?.segments.map((s) => s.roadQueryKey).join('、') ?? def.roadRefsZh.split('（')[0]?.trim() ?? '';
    if (payload) {
      const zh = ACCESS_STATE_LABEL_ZH[payload.aggregateAccessState] ?? payload.aggregateAccessState;
      const srcHint =
        payload.segments[0]?.source === 'spatial_domain_segment_cache'
          ? '数据来自系统内路段缓存快照'
          : '数据来自路网实时查询（或开发环境 mock）';
      out.push(
        `「${def.labelZh}」：综合判断为 ${zh}；已覆盖路号 ${roads}（${srcHint}）。`,
      );
    } else {
      out.push(
        `「${def.labelZh}」：已锁定区域与常见路网（${def.roadRefsZh}），本次未返回实时路况数值，请在出发前自行查阅 road.is。`,
      );
    }
  }
  return out;
}
