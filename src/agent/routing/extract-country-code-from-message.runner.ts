/**
 * 消息 → 国家代码（含区域 hint 短路，从 ClaudeOrchestrator 迁出）。
 */

import type { Logger } from '@nestjs/common';
import {
  detectDestinationRegionHint,
  extractCountryCodeFromMessage as extractCountryCodeFromMessageUtil,
} from '../utils/extract-country-code-from-message.util';

export function extractCountryCodeFromMessage(
  message: string,
  logger?: Pick<Logger, 'debug'>,
): string | undefined {
  const region = detectDestinationRegionHint(message);
  if (region) {
    logger?.debug(
      `[Claude Orchestrator] destination region hint ${region.regionCode}, skip fake country code`,
    );
    return undefined;
  }
  return extractCountryCodeFromMessageUtil(message);
}
