import type {
  PlanProposal,
  PlanProposalChange,
} from '../types/plan-proposal.types';
import type {
  PlanningDecisionOption,
  PlanningDecisionPack,
  PlanningOptionDataBasis,
  PlanningOptionLineItem,
} from '../types/planning-decision-pack.types';

const SCENARIO_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function parseHHmm(value: string): number {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinuteDelta(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs} 分钟`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function extractShiftMinutes(change?: PlanProposalChange): number | undefined {
  if (!change?.startTime) return undefined;
  const fromMatch = change.from?.match(/(\d{1,2}:\d{2})/);
  if (!fromMatch) return undefined;
  const delta = parseHHmm(fromMatch[1]!) - parseHHmm(change.startTime);
  return delta > 0 ? delta : undefined;
}

function extractDelayMinutes(change?: PlanProposalChange): number | undefined {
  if (!change?.startTime) return undefined;
  const fromMatch = change.from?.match(/(\d{1,2}:\d{2})/);
  if (!fromMatch) return undefined;
  const delta = parseHHmm(change.startTime) - parseHHmm(fromMatch[1]!);
  return delta > 0 ? delta : undefined;
}

function line(id: string, text: string, tone: PlanningOptionLineItem['tone']): PlanningOptionLineItem {
  return { id, text, tone };
}

function defaultDataBasis(optionKind: PlanningDecisionOption['optionKind']): PlanningOptionDataBasis[] {
  const now = new Date().toISOString();
  const base: PlanningOptionDataBasis[] = [
    {
      id: 'basis_schedule',
      label: '当前日程与缓冲',
      icon: 'calendar',
      reliability: 'high',
      observedAt: now,
    },
  ];

  if (optionKind === 'SHIFT_EARLIER' || optionKind === 'SHIFT_LATER') {
    return [
      {
        id: 'basis_congestion_history',
        label: '历史 1 年拥堵',
        icon: 'history',
        reliability: 'medium',
        observedAt: now,
      },
      {
        id: 'basis_route_segment',
        label: '路段卡口数据',
        icon: 'sensor',
        reliability: 'high',
        observedAt: now,
      },
      {
        id: 'basis_weather',
        label: '天气影响（中到高）',
        icon: 'weather',
        reliability: 'medium',
        observedAt: now,
      },
    ];
  }

  if (optionKind === 'SHORTEN_STAY') {
    return [
      ...base,
      {
        id: 'basis_dwell',
        label: '景点建议停留时长',
        icon: 'route',
        reliability: 'high',
        observedAt: now,
      },
    ];
  }

  return [
    ...base,
    {
      id: 'basis_route_engine',
      label: '路线引擎估算',
      icon: 'route',
      reliability: 'high',
      observedAt: now,
    },
  ];
}

function bufferOutcomeText(proposal?: PlanProposal): string | undefined {
  const reduced = proposal?.benefits?.drivingTimeReducedMinutes;
  if (typeof reduced === 'number' && reduced !== 0) {
    const sign = reduced > 0 ? '+' : '';
    return `交通缓冲${reduced > 0 ? '增加' : '减少'}至 ${sign}${formatMinuteDelta(reduced)}`;
  }
  const bufferTradeoff = proposal?.tradeoffs.find((t) => /缓冲|buffer/i.test(t));
  if (bufferTradeoff) return bufferTradeoff;
  return undefined;
}

function buildShiftEarlierCard(
  option: PlanningDecisionOption,
  proposal?: PlanProposal,
  primaryChange?: PlanProposalChange,
): PlanningDecisionOption {
  const shiftMin = extractShiftMinutes(primaryChange) ?? 20;
  const bufferText = bufferOutcomeText(proposal) ?? `交通缓冲增加至 +${shiftMin} 分钟`;
  const headline = `提前 ${shiftMin} 分钟离开起点`;
  const description = '在高发拥堵时段前出发，降低风险，顺畅到达景点。';

  const outcomeItems: PlanningOptionLineItem[] = [
    line('out_delay_risk', '延误风险降低至低风险', 'good'),
    line('out_lunch', '午餐预计不受影响', 'good'),
    line('out_buffer', bufferText, 'good'),
  ];

  const costItems: PlanningOptionLineItem[] = [];
  if (primaryChange?.endTime && primaryChange.startTime) {
    const dwell = parseHHmm(primaryChange.endTime) - parseHHmm(primaryChange.startTime);
    if (dwell > 0) {
      const shortened = Math.max(20, Math.min(shiftMin * 3, Math.round(dwell * 0.15)));
      costItems.push(
        line(
          'cost_dwell',
          `正常停留需缩短约 ${formatMinuteDelta(shortened)}`,
          'caution',
        ),
      );
    }
  }
  costItems.push(line('cost_wake', '起床更早', 'caution'));
  for (const c of option.costs) {
    if (!costItems.some((i) => i.text === c)) {
      costItems.push(line(`cost_extra_${costItems.length}`, c, 'caution'));
    }
  }

  return {
    ...option,
    headline,
    description,
    title: headline,
    outcomeItems,
    costItems,
    outcomes: outcomeItems.map((o) => o.text),
    costs: costItems.map((c) => c.text),
    dataBasis: defaultDataBasis('SHIFT_EARLIER'),
  };
}

function buildShiftLaterCard(
  option: PlanningDecisionOption,
  primaryChange?: PlanProposalChange,
): PlanningDecisionOption {
  const delayMin = extractDelayMinutes(primaryChange) ?? 15;
  const headline = `延后 ${delayMin} 分钟出发`;
  const description = '为前序活动留出缓冲，降低连锁延误风险。';

  const outcomeItems: PlanningOptionLineItem[] = [
    line('out_buffer', '相邻时段缓冲增加', 'good'),
    line('out_conflict', '降低与前序活动重叠概率', 'good'),
    ...option.outcomes
      .filter((t) => !/缓冲|重叠/.test(t))
      .map((text, i) => line(`out_extra_${i}`, text, 'good')),
  ];

  const costItems: PlanningOptionLineItem[] = [
    line('cost_arrival', '后续景点到达时间顺延', 'caution'),
    ...option.costs.map((text, i) => line(`cost_${i}`, text, 'caution')),
  ];

  return {
    ...option,
    headline,
    description,
    title: headline,
    outcomeItems,
    costItems,
    outcomes: outcomeItems.map((o) => o.text),
    costs: costItems.map((c) => c.text),
    dataBasis: defaultDataBasis('SHIFT_LATER'),
  };
}

function buildShortenStayCard(option: PlanningDecisionOption): PlanningDecisionOption {
  const headline = option.title.includes('缩短') ? option.title : `缩短停留：${option.title}`;
  const description = '压缩单点停留以换取当日整体可行度与缓冲。';

  const outcomeItems: PlanningOptionLineItem[] = [
    line('out_feasibility', '当日可行度提升', 'good'),
    line('out_drive', '驾驶与转场压力下降', 'good'),
    ...option.outcomes.map((text, i) => line(`out_${i}`, text, 'good')),
  ];
  const costItems: PlanningOptionLineItem[] = [
    line('cost_experience', '景点体验深度可能下降', 'caution'),
    ...option.costs.map((text, i) => line(`cost_${i}`, text, 'caution')),
  ];

  return {
    ...option,
    headline,
    description,
    outcomeItems,
    costItems,
    outcomes: outcomeItems.map((o) => o.text),
    costs: costItems.map((c) => c.text),
    dataBasis: defaultDataBasis('SHORTEN_STAY'),
  };
}

function buildAcceptRiskCard(option: PlanningDecisionOption): PlanningDecisionOption {
  const isDiscard = option.action?.type === 'discard_proposal';
  const headline = isDiscard ? '放弃草案，保持现状' : option.title;
  const description = isDiscard
    ? '不修改当前正式行程，问题可能仍然存在。'
    : '在知情前提下接受当前风险并写入变更。';

  const outcomeItems = option.outcomes.map((text, i) =>
    line(`out_${i}`, text, isDiscard ? 'neutral' : 'good'),
  );
  const costItems = option.costs.map((text, i) =>
    line(`cost_${i}`, text, 'caution'),
  );

  return {
    ...option,
    headline,
    description,
    outcomeItems,
    costItems,
    outcomes: outcomeItems.map((i) => i.text),
    costs: costItems.map((c) => c.text),
    dataBasis: defaultDataBasis('ACCEPT_RISK'),
  };
}

function buildPrimaryApplyCard(
  option: PlanningDecisionOption,
  proposal?: PlanProposal,
): PlanningDecisionOption {
  const primaryChange = proposal?.changes.find(
    (c) => c.operation === 'ADD' || c.operation === 'MOVE',
  );
  const headline =
    primaryChange?.label && primaryChange.operation === 'ADD'
      ? `新增：${primaryChange.label}`
      : proposal?.diff.summary || option.title;

  const description =
    proposal?.answer?.trim() ||
    (proposal?.intent === 'FILL_GAP'
      ? '利用空档安排活动，提升当日行程完整度。'
      : proposal?.intent === 'PLACE_CANDIDATE'
        ? '将候选景点纳入正式日程。'
        : '应用当前规划草案到正式行程。');

  const outcomeItems: PlanningOptionLineItem[] = option.outcomes.map((text, i) =>
    line(`out_${i}`, text, 'good'),
  );
  if (proposal?.benefits?.conflictCountChange && proposal.benefits.conflictCountChange < 0) {
    outcomeItems.unshift(
      line('out_conflicts', `冲突减少 ${Math.abs(proposal.benefits.conflictCountChange)} 项`, 'good'),
    );
  }
  const bufferText = bufferOutcomeText(proposal);
  if (bufferText) {
    outcomeItems.push(line('out_buffer', bufferText, 'good'));
  }

  const costItems: PlanningOptionLineItem[] =
    option.costs.length > 0
      ? option.costs.map((text, i) => line(`cost_${i}`, text, 'caution'))
      : [line('cost_default', '可能调整相邻时段与驾驶顺序', 'caution')];

  return {
    ...option,
    headline,
    description,
    outcomeItems,
    costItems,
    outcomes: outcomeItems.map((o) => o.text),
    costs: costItems.map((c) => c.text),
    dataBasis: defaultDataBasis(option.optionKind),
  };
}

export function enrichOptionSolutionCard(
  option: PlanningDecisionOption,
  ctx?: {
    proposal?: PlanProposal;
    letterIndex?: number;
    skipBadge?: boolean;
  },
): PlanningDecisionOption {
  const primaryChange = ctx?.proposal?.changes.find(
    (c) => c.operation === 'ADD' || c.operation === 'MOVE',
  );

  let enriched: PlanningDecisionOption;
  if (option.id.endsWith('_primary')) {
    enriched = buildPrimaryApplyCard(option, ctx?.proposal);
  } else if (option.id.endsWith('_discard') || option.id.endsWith('_accept_risk')) {
    enriched = buildAcceptRiskCard(option);
  } else {
    switch (option.optionKind) {
      case 'SHIFT_EARLIER':
        enriched = buildShiftEarlierCard(option, ctx?.proposal, primaryChange);
        break;
      case 'SHIFT_LATER':
        enriched = buildShiftLaterCard(option, primaryChange);
        break;
      case 'SHORTEN_STAY':
        enriched = buildShortenStayCard(option);
        break;
      case 'ACCEPT_RISK':
        enriched = buildAcceptRiskCard(option);
        break;
      default:
        enriched = buildPrimaryApplyCard(option, ctx?.proposal);
    }
  }

  if (!ctx?.skipBadge && ctx?.letterIndex != null && ctx.letterIndex >= 0) {
    const letter = SCENARIO_LETTERS[ctx.letterIndex];
    if (letter) {
      enriched.letter = letter;
      enriched.badge = `方案 ${letter}`;
    }
  }

  if (!enriched.dataBasis?.length) {
    enriched.dataBasis = defaultDataBasis(enriched.optionKind);
  }

  return enriched;
}

export function enrichDecisionPackSolutionCards(
  pack: PlanningDecisionPack,
  proposal?: PlanProposal,
): PlanningDecisionPack {
  let letterIdx = 0;
  const options = pack.options.map((opt) => {
    const skipBadge = opt.id.endsWith('_discard') || opt.id.endsWith('_accept_risk');
    const enriched = enrichOptionSolutionCard(opt, {
      proposal,
      letterIndex: skipBadge ? undefined : letterIdx,
      skipBadge,
    });
    if (!skipBadge) letterIdx += 1;
    return enriched;
  });

  const decisionClusters = pack.decisionClusters.map((cluster) => ({
    ...cluster,
    options: cluster.options.map((opt) => {
      const match = options.find((o) => o.id === opt.id);
      return match ?? enrichOptionSolutionCard(opt, { proposal });
    }),
  }));

  return { ...pack, options, decisionClusters };
}
