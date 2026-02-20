/**
 * Amadeus Direct Service
 *
 * 直接调用 Amadeus REST API，无需 MCP
 * 使用 AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET 获取 token，调用 Flight Offers Search
 *
 * @see https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface AmadeusDirectFlightOffer {
  type?: string;
  id?: string;
  source?: string;
  instantTicketingRequired?: boolean;
  nonHomogeneous?: boolean;
  oneWay?: boolean;
  lastTicketingDate?: string;
  numberOfBookableSeats?: number;
  itineraries?: Array<{
    duration?: string;
    segments?: Array<{
      departure?: { iataCode?: string; terminal?: string; at?: string };
      arrival?: { iataCode?: string; terminal?: string; at?: string };
      carrierCode?: string;
      number?: string;
      aircraft?: { code?: string };
      operating?: { carrierCode?: string };
      duration?: string;
      id?: string;
    }>;
  }>;
  price?: {
    currency?: string;
    total?: string;
    base?: string;
    fees?: Array<{ amount?: string; type?: string }>;
    grandTotal?: string;
  };
  pricingOptions?: { fareType?: string[]; includedCheckedBagsOnly?: boolean };
  validatingAirlineCodes?: string[];
  travelerPricings?: Array<{
    travelerId?: string;
    fareOption?: string;
    travelerType?: string;
    price?: { currency?: string; total?: string; base?: string };
    fareDetailsBySegment?: Array<{
      segmentId?: string;
      cabin?: string;
      fareBasis?: string;
      class?: string;
      includedCheckedBags?: { quantity?: number };
    }>;
  }>;
}

export interface AmadeusDirectFlightSearchResult {
  meta?: { count?: number };
  data?: AmadeusDirectFlightOffer[];
}

@Injectable()
export class AmadeusDirectService {
  private readonly logger = new Logger(AmadeusDirectService.name);
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private get baseUrl(): string {
    const hostname = process.env.AMADEUS_HOSTNAME || 'test';
    return hostname === 'production'
      ? 'https://api.amadeus.com'
      : 'https://test.api.amadeus.com';
  }

  constructor() {
    this.http = axios.create({
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });
  }

  get isAvailable(): boolean {
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
    return !!(clientId && clientSecret);
  }

  /** 城市/机场名到 IATA 代码映射 */
  private static readonly LOCATION_MAP: Record<string, string> = {
    北京: 'PEK',
    上海: 'PVG',
    广州: 'CAN',
    深圳: 'SZX',
    成都: 'CTU',
    杭州: 'HGH',
    西安: 'XIY',
    悉尼: 'SYD',
    曼谷: 'BKK',
    东京: 'NRT',
    大阪: 'KIX',
    首尔: 'ICN',
    新加坡: 'SIN',
    香港: 'HKG',
    伦敦: 'LON',
    巴黎: 'PAR',
    纽约: 'NYC',
    洛杉矶: 'LAX',
    旧金山: 'SFO',
  };

  private resolveLocationCode(input: string): string {
    const trimmed = input.trim().toUpperCase();
    if (trimmed.length === 3) return trimmed;
    return AmadeusDirectService.LOCATION_MAP[input.trim()] || trimmed;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Amadeus API 凭证未配置（AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET）');
    }

    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);

    const { data } = await this.http.post<{ access_token?: string; expires_in?: number }>(
      `${this.baseUrl}/v1/security/oauth2/token`,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (!data?.access_token) {
      throw new Error('获取 Amadeus access token 失败');
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in || 1799) * 1000;
    return this.accessToken;
  }

  /**
   * 搜索航班（与 AmadeusService.searchFlightOffers 兼容的返回格式）
   */
  async searchFlightOffers(params: {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    adults: number;
    returnDate?: string;
    children?: number;
    infants?: number;
    travelClass?: string;
    includedAirlineCodes?: string;
    excludedAirlineCodes?: string;
    nonStop?: boolean;
    max?: number;
    currencyCode?: string;
    maxPrice?: number;
  }): Promise<{ data?: AmadeusDirectFlightOffer[] }> {
    const token = await this.getAccessToken();
    const origin = this.resolveLocationCode(params.originLocationCode);
    const destination = this.resolveLocationCode(params.destinationLocationCode);

    const searchParams: Record<string, string | number | boolean> = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: params.departureDate,
      adults: params.adults,
    };
    if (params.returnDate) searchParams.returnDate = params.returnDate;
    if (params.children != null) searchParams.children = params.children;
    if (params.infants != null) searchParams.infants = params.infants;
    if (params.travelClass) searchParams.travelClass = params.travelClass;
    if (params.includedAirlineCodes) searchParams.includedAirlineCodes = params.includedAirlineCodes;
    if (params.excludedAirlineCodes) searchParams.excludedAirlineCodes = params.excludedAirlineCodes;
    if (params.nonStop != null) searchParams.nonStop = params.nonStop;
    if (params.max != null) searchParams.max = params.max;
    if (params.currencyCode) searchParams.currencyCode = params.currencyCode;
    if (params.maxPrice != null) searchParams.maxPrice = params.maxPrice;

    const { data } = await this.http.get<AmadeusDirectFlightSearchResult>(
      `${this.baseUrl}/v2/shopping/flight-offers`,
      {
        params: searchParams,
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return { data: data?.data || [] };
  }

  /** 兼容 planning-assistant 调用的 searchFlights 别名 */
  async searchFlights(params: Parameters<AmadeusDirectService['searchFlightOffers']>[0]) {
    return this.searchFlightOffers(params);
  }
}
