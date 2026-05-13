/**
 * Narrator 3.0 结项：确定性断言「EBP 立场 → 语气修饰符 / LLM 附录 / 多模态 hints」
 *（不调用真实 LLM，不依赖编排器全链路。）
 */

import type { ResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.types';
import {
  buildEbpLlmSystemPromptAppendixZh,
  buildMultimodalPresentationHints,
  mapReportToVoiceToneModifier,
} from './narrator-ebp-tone.util';

describe('Narrator 3.0 closure (deterministic)', () => {
  const complianceFirstWithKeyWrite: ResearchConflictNegotiationReport = {
    version: 1,
    has_conflicts: true,
    conflict_flags: ['KEY_WRITE_CONTENTION', 'CROSS_DOMAIN_COMPLIANCE_COMMERCE'],
    primary_narrative_stance: 'COMPLIANCE_FIRST',
    items: [
      {
        kind: 'KEY_WRITE_CONTENTION',
        summary:
          '多名 Member 对 research_data 键「route_alerts_bundle」均有写入：ComplianceResearchMember vs HotelResearchMember',
        detail: {
          key: 'route_alerts_bundle',
          sources: ['ComplianceResearchMember', 'HotelResearchMember'],
        },
      },
      {
        kind: 'CROSS_DOMAIN_COMPLIANCE_COMMERCE',
        summary: '同一轮研究中 Compliance 与 酒店/航班 域均发生更新，存在安全/合规与商业取舍叙事空间',
        detail: { domains: ['compliance', 'commerce'] },
      },
    ],
  };

  it('COMPLIANCE_FIRST：语气映射为 professional_authoritative', () => {
    expect(mapReportToVoiceToneModifier(complianceFirstWithKeyWrite)).toBe('professional_authoritative');
  });

  it('LLM 系统附录含「冲突仲裁」强指令与 items 语义', () => {
    const appendix = buildEbpLlmSystemPromptAppendixZh(complianceFirstWithKeyWrite);
    expect(appendix).toContain('primary_narrative_stance=COMPLIANCE_FIRST');
    expect(appendix).toContain('【冲突仲裁·须在用户可见叙述中体现】');
    expect(appendix).toContain('KEY_WRITE_CONTENTION');
    expect(appendix).toContain('CROSS_DOMAIN_COMPLIANCE_COMMERCE');
  });

  it('多模态 hints：合规优先的视觉与音频调制', () => {
    const mm = buildMultimodalPresentationHints(complianceFirstWithKeyWrite);
    expect(mm.visual_hint).toMatch(/高对比|降饱和/);
    expect(mm.audio_prosody).toMatch(/吐字清晰|节奏稳定/);
  });
});
