import { AlertSeverity } from '../dto/safetravel.dto';
import type { SafetravelRSSRefined } from '../interfaces/safetravel-rss-refined.interface';
import {
  mergeSafetravelRssRefinedWithLlm,
  parseLlmRefinementJson,
  shouldRunSafetravelRssLlmRefine,
} from './safetravel-rss-llm-merge.util';

describe('safetravel-rss-llm-merge.util', () => {
  it('merge never downgrades severity', () => {
    const rule: SafetravelRSSRefined = {
      severity: AlertSeverity.CRITICAL,
      title: 'Road closed',
      body: 'Road 1 closed',
    };
    const merged = mergeSafetravelRssRefinedWithLlm(rule, {
      severity: 'low',
      title: 'ignored',
      body: 'LLM body',
      affected_regions: [],
    });
    expect(merged.severity).toBe(AlertSeverity.CRITICAL);
    expect(merged.title).toBe('Road closed');
    expect(merged.body).toBe('LLM body');
  });

  it('merge upgrades severity when LLM is higher', () => {
    const rule: SafetravelRSSRefined = {
      severity: AlertSeverity.LOW,
      title: 'Possible closure',
      body: 'Possible closure of road 1',
    };
    const merged = mergeSafetravelRssRefinedWithLlm(rule, {
      severity: 'high',
      title: 'x',
      body: 'y',
      affected_regions: ['South'],
    });
    expect(merged.severity).toBe(AlertSeverity.HIGH);
    expect(merged.affected_regions).toContain('South');
  });

  it('parseLlmRefinementJson strips markdown fences', () => {
    const o = parseLlmRefinementJson('```json\n{"severity":"medium","title":"t","body":"b","affected_regions":[]}\n```');
    expect(o?.severity).toBe('medium');
  });

  it('shouldRunSafetravelRssLlmRefine detects possible closure', () => {
    const rule: SafetravelRSSRefined = {
      severity: AlertSeverity.MEDIUM,
      title: 'Orange alert: Possible closure',
      body: 'Possible closure of road 1 due to weather',
    };
    expect(shouldRunSafetravelRssLlmRefine('auto', rule, { id: '1', title: rule.title, description: '' })).toBe(true);
  });
});
