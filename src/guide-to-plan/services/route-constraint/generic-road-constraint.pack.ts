import { Injectable } from '@nestjs/common';
import type {
  CountryRoadConstraintInput,
  CountryRoadConstraintPack,
  RouteConstraintContext,
  RouteConstraintHintInput,
  RouteConstraintPackHint,
} from '../../types/guide-route-constraint.types';
import type { GuideRouteAvailability } from '../../types/guide-spatial.types';
import { buildBaseRouteAvailability } from '../../utils/route-constraint/route-availability.util';

/**
 * 通用道路约束 Pack：日驾驶上限、路线是否存在。
 * 无国家专属规则时使用；各国 Pack 可在此基础上扩展。
 */
@Injectable()
export class GenericRoadConstraintPack implements CountryRoadConstraintPack {
  readonly supportedCountryCodes = ['*'] as const;

  async assessDayRoute(
    input: CountryRoadConstraintInput,
    _ctx?: RouteConstraintContext,
  ): Promise<GuideRouteAvailability> {
    return buildBaseRouteAvailability({
      routeExists: input.routeExists,
      drivingMinutes: input.drivingMinutes,
    });
  }

  getTravelContextHints(_input: RouteConstraintHintInput): RouteConstraintPackHint[] {
    return [];
  }
}
