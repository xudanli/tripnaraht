import { Injectable } from '@nestjs/common';
import type { CountryRoadConstraintInput, CountryRoadConstraintPack, RouteConstraintHintInput, RouteConstraintPackHint } from '../../types/guide-route-constraint.types';
import type { GuideRouteAvailability } from '../../types/guide-spatial.types';
import { GenericRoadConstraintPack } from './generic-road-constraint.pack';
import { IcelandRoadConstraintPack } from './iceland-road-constraint.pack';

/** @deprecated 使用 CountryRoadConstraintInput */
export type GuideDayConstraintInput = CountryRoadConstraintInput;

/**
 * 通用 RouteConstraintGateway：按 countryCode 选择 Pack，Planner 只依赖此入口。
 */
@Injectable()
export class GuideRouteConstraintGateway {
  private readonly packsByCountry = new Map<
    string,
    import('../../types/guide-route-constraint.types').CountryRoadConstraintPack
  >();

  constructor(
    private readonly genericPack: GenericRoadConstraintPack,
    icelandPack: IcelandRoadConstraintPack,
  ) {
    this.registerPack(icelandPack);
  }

  private registerPack(
    pack: import('../../types/guide-route-constraint.types').CountryRoadConstraintPack,
  ) {
    for (const code of pack.supportedCountryCodes) {
      if (code !== '*') {
        this.packsByCountry.set(code.toUpperCase(), pack);
      }
    }
  }

  resolvePack(countryCode?: string): CountryRoadConstraintPack {
    const cc = countryCode?.toUpperCase();
    if (cc && this.packsByCountry.has(cc)) {
      return this.packsByCountry.get(cc)!;
    }
    return this.genericPack;
  }

  registeredCountryCodes(): string[] {
    return Array.from(this.packsByCountry.keys());
  }

  async assessDayRoute(input: CountryRoadConstraintInput): Promise<GuideRouteAvailability> {
    return this.resolvePack(input.countryCode).assessDayRoute(input);
  }

  /**
   * 从当前国家 Pack 获取出行条件补充提示，供 pendingConfirmations 合并。
   */
  getPackHints(input: RouteConstraintHintInput): RouteConstraintPackHint[] {
    const countryCode =
      input.countryCode?.toUpperCase() ??
      input.travelContext?.countryCode?.toUpperCase();
    const pack = this.resolvePack(countryCode);
    return pack.getTravelContextHints?.({
      countryCode,
      travelContext: input.travelContext,
    }) ?? [];
  }
}
