/**
 * Country Knowledge Service — Decision OS 可计算常识库（V2 CountryProfile）
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assembleCountryProfileResponse,
  prismaRowToCountryFacts,
} from '../country-profile-v2.mapper';
import type {
  CountryProfileV2Compliance,
  CountryProfileV2Data,
  DrivingSide,
  RoadSurfaceForEta,
} from '../types/country-profile-v2.types';
import {
  computeRouteEtaModifier,
  getDrivingEtaPenaltyCoefficients,
} from '../utils/country-driving-policy.util';

export interface CountryKnowledgeConfig {
  isoCode: string;
  schemaVersion: number;
  profile: CountryProfileV2Data;
  complianceInfo: CountryProfileV2Compliance;
  facts: ReturnType<typeof prismaRowToCountryFacts>;
}

@Injectable()
export class CountryKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async getCountryConfig(countryCode: string): Promise<CountryKnowledgeConfig> {
    const iso = countryCode.trim().toUpperCase();
    const row = await this.prisma.countryProfile.findUnique({
      where: { isoCode: iso },
    });
    if (!row) {
      throw new NotFoundException(`未找到国家代码为 ${iso} 的国家档案`);
    }
    const profile = assembleCountryProfileResponse(row);
    const complianceInfo = (row.complianceInfo ?? {}) as CountryProfileV2Compliance;
    return {
      isoCode: iso,
      schemaVersion: 2,
      profile,
      complianceInfo,
      facts: prismaRowToCountryFacts(row),
    };
  }

  getEtaPenaltyCoefficients(complianceInfo: CountryProfileV2Compliance | unknown) {
    return getDrivingEtaPenaltyCoefficients(complianceInfo);
  }

  /**
   * 估算行程段时间乘数（左舵习惯 + 路面类型），与业务示例对齐。
   */
  estimateRouteEtaModifier(
    countryCode: string,
    opts: {
      roadSurfaces?: RoadSurfaceForEta[];
      userHabitDrivingSide?: DrivingSide;
    },
  ): Promise<number> {
    return this.getCountryConfig(countryCode).then((cfg) =>
      computeRouteEtaModifier({
        complianceInfo: cfg.complianceInfo,
        roadSurfaces: opts.roadSurfaces,
        userHabitDrivingSide: opts.userHabitDrivingSide,
      }),
    );
  }

  applyEtaToBaseMinutes(
    baseMinutes: number,
    countryCode: string,
    roadSurfaces: RoadSurfaceForEta[],
    userHabitDrivingSide: DrivingSide = 'RIGHT',
  ): Promise<number> {
    return this.estimateRouteEtaModifier(countryCode, {
      roadSurfaces,
      userHabitDrivingSide,
    }).then((modifier) => Math.round(baseMinutes * modifier));
  }
}
