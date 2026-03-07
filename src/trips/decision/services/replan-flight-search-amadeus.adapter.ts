/**
 * REPLAN 航班替换 - Amadeus 适配器
 *
 * 专利实施例 2（6.2.9）：FlightAgentService 搜索替代航班
 * 实现 IReplanFlightSearch，当 Amadeus 可用时提供航班搜索
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AmadeusDirectService } from '../../../mcp/amadeus-direct.service';
import type { IReplanFlightSearch } from '../../../decision/kernel/replan-flight-search.interface';
import type { EnvironmentFlight } from '../../../decision/kernel/decision-state.types';

const CITY_TO_IATA: Record<string, string> = {
  北京: 'PEK', 上海: 'PVG', 广州: 'CAN', 深圳: 'SZX', 成都: 'CTU', 杭州: 'HGH', 西安: 'XIY',
  悉尼: 'SYD', 曼谷: 'BKK', 东京: 'NRT', 大阪: 'KIX', 首尔: 'ICN', 新加坡: 'SIN', 香港: 'HKG',
  伦敦: 'LHR', 巴黎: 'CDG', 纽约: 'JFK', 洛杉矶: 'LAX', 旧金山: 'SFO', 雷克雅未克: 'KEF',
};

@Injectable()
export class ReplanFlightSearchAmadeusAdapter implements IReplanFlightSearch {
  private readonly logger = new Logger(ReplanFlightSearchAmadeusAdapter.name);

  constructor(
    @Optional() private readonly amadeus?: AmadeusDirectService,
  ) {}

  async searchAlternatives(
    origin: string,
    destination: string,
    departureDate: string,
  ): Promise<EnvironmentFlight[]> {
    if (!this.amadeus?.isAvailable) {
      this.logger.debug('[ReplanFlightSearch] Amadeus 未配置，跳过航班搜索');
      return [];
    }

    const originCode = this.toIata(origin);
    const destCode = this.toIata(destination);
    const date = departureDate.includes('T') ? departureDate.slice(0, 10) : departureDate;

    try {
      const { data } = await this.amadeus.searchFlightOffers({
        originLocationCode: originCode,
        destinationLocationCode: destCode,
        departureDate: date,
        adults: 1,
        max: 5,
      });

      if (!data?.length) return [];

      const result: EnvironmentFlight[] = data.slice(0, 5).map((offer) => {
        const seg0 = offer.itineraries?.[0]?.segments?.[0];
        const carrier = seg0?.carrierCode ?? '';
        const num = seg0?.number ?? '';
        const flight = `${carrier}${num}`.trim() || 'unknown';
        const price = offer.price?.total ? parseFloat(offer.price.total) : undefined;
        return { flight, status: 'scheduled' as const, price };
      });

      this.logger.debug(`[ReplanFlightSearch] 找到 ${result.length} 个替代航班: ${result.map((f) => f.flight).join(', ')}`);
      return result;
    } catch (e: unknown) {
      this.logger.warn(`[ReplanFlightSearch] 航班搜索失败: ${(e as Error)?.message}`);
      return [];
    }
  }

  private toIata(input: string): string {
    const s = (input ?? '').trim();
    if (s.length === 3 && /^[A-Z]{3}$/i.test(s)) return s.toUpperCase();
    if (CITY_TO_IATA[s]) return CITY_TO_IATA[s];
    const withoutCountry = s.replace(/^(中国|日本|韩国|美国|英国|法国|德国|澳大利亚|新加坡|泰国|马来西亚|印度尼西亚|越南|菲律宾|印度)\s*/i, '').trim();
    return CITY_TO_IATA[withoutCountry] ?? s.toUpperCase();
  }
}
