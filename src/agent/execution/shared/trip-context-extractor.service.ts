/**
 * TripContextExtractorService
 *
 * 抽离自 Orchestrator.extractTripContextFromState
 * 从 trip_plan_request 构建 TripContext，用于准备度检查
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable } from '@nestjs/common';
import {
  TripContext,
  TravelerProfile,
  ItineraryInfo,
} from '../../../trips/readiness/types/trip-context.types';

/** 旅行请求最小字段（兼容 TripPlanRequest / PhaseExecutorContext.tripPlanRequest） */
export interface TripRequestForContext {
  destination?: string | { lat: number; lng: number };
  date_range?: { start_date: string; end_date: string };
  start_date?: string;
  constraints?: {
    budget?: { total?: number; currency?: string };
    /** 与 `TripPlanRequest.constraints` 对齐的最小字段（Gate / 准备度） */
    vehicle_type?: '2WD' | '4WD';
  };
}

@Injectable()
export class TripContextExtractorService {
  /**
   * 从 trip_plan_request 提取 TripContext
   * @param tripRequest 旅行请求（可为 null/undefined）
   */
  extract(tripRequest: TripRequestForContext | null | undefined): TripContext {
    if (!tripRequest) {
      return {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      };
    }

    // 提取目的地国家代码
    const destination =
      typeof tripRequest.destination === 'string' ? tripRequest.destination : 'UNKNOWN';
    const countryCode = destination.split('-')[0] || destination.split(',')[0] || 'UNKNOWN';

    // 构建 TravelerProfile
    const traveler: TravelerProfile = {
      nationality: undefined,
      residencyCountry: undefined,
      tags: [],
      budgetLevel: tripRequest.constraints?.budget?.total
        ? tripRequest.constraints.budget.total > 5000
          ? 'high'
          : tripRequest.constraints.budget.total > 2000
            ? 'medium'
            : 'low'
        : undefined,
      riskTolerance: undefined,
    };

    // 构建 ItineraryInfo
    const itinerary: ItineraryInfo = {
      countries: [countryCode],
      activities: [],
      season: tripRequest.date_range?.start_date
        ? this.extractSeason(tripRequest.date_range.start_date)
        : undefined,
    };

    return {
      traveler,
      trip: {
        startDate: tripRequest.date_range?.start_date || tripRequest.start_date,
        endDate: tripRequest.date_range?.end_date,
      },
      itinerary,
    };
  }

  /**
   * 从日期提取季节（北半球简化版）
   */
  extractSeason(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1; // 0-11 -> 1-12

      if (month >= 3 && month <= 5) return 'spring';
      if (month >= 6 && month <= 8) return 'summer';
      if (month >= 9 && month <= 11) return 'autumn';
      return 'winter';
    } catch {
      return 'all';
    }
  }
}
