import { Injectable } from '@nestjs/common';
import type { RegionIntent } from '../interfaces/region-intent.types';
import { ICELAND_REGION_INTENT_BY_ID } from '../regions/iceland-region-intents';

/** 关键词 / 正则 → regionId（权重作置信度上界）；label 用于 observability */
const REGION_TEXT_HINTS: ReadonlyArray<{
  pattern: RegExp;
  regionId: string;
  weight: number;
  label: string;
}> = [
  {
    pattern: /黄金圈|冰岛黄金圈|金圈(?!口)/,
    regionId: 'golden_circle',
    weight: 0.92,
    label: 'golden_circle:zh_golden_circle',
  },
  {
    pattern: /Golden\s*Circle|Thingvellir|Þingvellir/i,
    regionId: 'golden_circle',
    weight: 0.88,
    label: 'golden_circle:en_golden_circle_or_thingvellir',
  },
  {
    pattern: /Gullfoss.*Geysir|Geysir.*Gullfoss|Geysir|Gullfoss/i,
    regionId: 'golden_circle',
    weight: 0.72,
    label: 'golden_circle:geysir_gullfoss',
  },
];

@Injectable()
export class RegionIntentResolverService {
  /**
   * 按稳定 regionId 取意图（冰岛表；其它国家可扩展多注册表）
   */
  resolveFromRegionId(regionId: string): RegionIntent | undefined {
    const id = regionId.trim().toLowerCase();
    return ICELAND_REGION_INTENT_BY_ID[id];
  }

  /**
   * 从自然语言中猜测区域（Phase 1：规则 + 正则，无 ML）
   */
  resolveFromText(text: string): {
    regionIntent?: RegionIntent;
    matchedRegionId?: string;
    confidence: number;
    matchedBy?: 'message_text';
    matchedRegionKeyword?: string;
  } {
    if (!text?.trim()) {
      return { confidence: 0 };
    }
    /** Phase 2.3：用户明确排除黄金圈时，不因泛化英文/景点名误命中 */
    const gcExclusion =
      /(?:不含|不要|不安排|排除|勿|别|跳过).{0,8}黄金圈|黄金圈.{0,8}(?:除外|不要|跳过)|(?:(?:no|without|exclude|skip)\s+)(?:the\s+)?golden\s+circle/i;
    if (gcExclusion.test(text)) {
      return { confidence: 0 };
    }
    let best:
      | { regionId: string; weight: number; label: string }
      | undefined;
    for (const hint of REGION_TEXT_HINTS) {
      if (hint.pattern.test(text)) {
        if (!best || hint.weight > best.weight) {
          best = { regionId: hint.regionId, weight: hint.weight, label: hint.label };
        }
      }
    }
    if (!best) {
      return { confidence: 0 };
    }
    const regionIntent = this.resolveFromRegionId(best.regionId);
    return {
      regionIntent,
      matchedRegionId: best.regionId,
      confidence: best.weight,
      matchedBy: 'message_text',
      matchedRegionKeyword: best.label,
    };
  }
}
