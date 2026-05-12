import { Injectable } from '@nestjs/common';

@Injectable()
export class DrivePricingQuoteSkill {
  /**
   * Placeholder skill interface for fetching a drive/ride-share quote.
   * In production, this can be backed by a real provider (rideshare, maps tolls, etc).
   */
  async execute(_params: { lat: number; lng: number }): Promise<{ quote_usd: number; currency: 'USD'; source: string }> {
    // Default safe fallback (no external IO).
    return { quote_usd: 50, currency: 'USD', source: 'DEFAULT_PLACEHOLDER' };
  }
}

