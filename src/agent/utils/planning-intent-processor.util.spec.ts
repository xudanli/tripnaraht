import {
  EvidenceLevel,
  PlanningIntentProcessorUtil,
} from './planning-intent-processor.util';

describe('PlanningIntentProcessorUtil (D1/D2 规划期入口工具测试)', () => {
  let util: PlanningIntentProcessorUtil;

  beforeEach(() => {
    util = new PlanningIntentProcessorUtil();
  });

  describe('D1: INTAKE Layer2 信号提取测试', () => {
    it('应准确拦截预演意图 (scenario_planning_requested)', () => {
      const query = '如果下个月西峡湾暴雪封路了，咱们的预案能多花几天绕过去？';
      const signals = util.extractSubSignals(query);

      expect(signals.scenario_planning_requested).toBe(true);
      expect(signals.supply_chain_verification_requested).toBe(false);
    });

    it('应识别冰岛 F-Road 封路绕行复合信号', () => {
      const query =
        '我查到下个月冰岛内陆 F-Road 可能会因为融雪延迟开放，如果到时候真的封路了，系统能帮我绕行吗？需要多花几天？';
      const signals = util.extractSubSignals(query);

      expect(signals.scenario_planning_requested).toBe(true);
    });

    it('应识别 D2 供应链验证信号', () => {
      const query = '智能体能否100%确保新藏线沿途充电桩不会让我趴窝？';
      const signals = util.extractSubSignals(query);

      expect(signals.supply_chain_verification_requested).toBe(true);
    });

    it('应自动生成双轨拓扑行程单产品契约模版', () => {
      const sampleSegments = ['seg_iceland_westf_01'];
      const branches = util.generateContingencyTemplate(sampleSegments);

      expect(branches).toHaveLength(1);
      expect(branches[0].trigger_condition).toContain('seg_iceland_westf_01');
      expect(branches[0].alternative_route_token).toContain('via_fallback_engine');
      expect(branches[0].expected_utility_ratio).toBe(0.85);
    });

    it('buildPlanningIntentPayload 在 scenario + segmentIds 时附带 contingency_branches', () => {
      const payload = util.buildPlanningIntentPayload({
        text: '如果 Day 3 冰川徒步取消了，后面酒店会全废吗？',
        segmentIds: ['seg_day3_glacier'],
      });

      expect(payload.sub_signals.scenario_planning_requested).toBe(true);
      expect(payload.contingency_branches).toHaveLength(1);
      expect(payload.contingency_branches![0].impacted_segment_ids).toEqual(['seg_day3_glacier']);
    });
  });

  describe('D2: 供应链确定性防御与证据层级熔断测试', () => {
    it('当数据源仅为 L1 (历史统计) 但用户逼问“100%确保”时，系统应触发安全熔断，拒绝承诺', () => {
      const userQuery = '智能体能否100%确保新藏线沿途充电桩不会让我趴窝？';
      const result = util.enforceSupplyChainSafety(userQuery, EvidenceLevel.L1_HISTORICAL_STAT);

      expect(result.safeToPromise).toBe(false);
      expect(result.enforcedLevel).toBe(EvidenceLevel.L1_HISTORICAL_STAT);
      expect(result.processedResponsePrefix).toContain('Decision OS 供应链安全警告');
      expect(result.processedResponsePrefix).toContain('系统已拦截绝对承诺');
    });

    it('当数据源达到 L3 (确定性实时) 时，允许放行并正确标注证据层级', () => {
      const userQuery = '确认一下 5 月底这些加油站开不开。';
      const result = util.enforceSupplyChainSafety(userQuery, EvidenceLevel.L3_DETERMINISTIC);

      expect(result.safeToPromise).toBe(true);
      expect(result.enforcedLevel).toBe(EvidenceLevel.L3_DETERMINISTIC);
      expect(result.processedResponsePrefix).toBe(
        `> **[Evidence Level: ${EvidenceLevel.L3_DETERMINISTIC}]**`,
      );
    });

    it('L3 + 用户含绝对承诺措辞时仍允许放行（有实时真理源）', () => {
      const userQuery = '能否100%确保充电桩间隔？';
      const result = util.enforceSupplyChainSafety(userQuery, EvidenceLevel.L3_DETERMINISTIC);

      expect(result.safeToPromise).toBe(true);
      expect(result.enforcedLevel).toBe(EvidenceLevel.L3_DETERMINISTIC);
    });

    it('无绝对承诺措辞时 L1 数据源不触发熔断', () => {
      const userQuery = '西峡湾 5 月加油站大概开不开？';
      const result = util.enforceSupplyChainSafety(userQuery, EvidenceLevel.L1_HISTORICAL_STAT);

      expect(result.safeToPromise).toBe(true);
      expect(result.processedResponsePrefix).toContain('L1_HISTORICAL_STAT');
    });
  });
});
