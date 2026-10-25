/**
 * Traveler Memory / Trip Override HTTP（M5 产品入口）。
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from '../../common/dto/standard-response.dto';
import { TripOverrideService } from './trip-override.service';
import { RegistrationSeedService } from './registration-seed.service';
import type { RegistrationSeedRequestV1 } from './registration-seed.types';
import type {
  ApplyHabitInheritRequestV1,
  ApplyTripDifferentRequestV1,
  TripOverrideItemInputV1,
} from './trip-override.types';

@ApiTags('Traveler Memory')
@Controller('traveler-memory')
export class TravelerMemoryController {
  constructor(
    private readonly tripOverride: TripOverrideService,
    private readonly registrationSeedService: RegistrationSeedService,
  ) {}

  @Public()
  @Get('travelers/:userId/habit-summary')
  @ApiOperation({ summary: 'Nara 对我的了解 — 习惯摘要卡' })
  async getHabitSummary(@Param('userId') userId: string) {
    return successResponse(await this.tripOverride.getHabitSummary(userId));
  }

  @Public()
  @Post('travelers/:userId/registration-seed')
  @ApiOperation({
    summary: '注册轻量种子 — 显式 CONSTRAINT/PREFERENCE（非 8×5 问卷）',
  })
  async applyRegistrationSeed(
    @Param('userId') userId: string,
    @Body()
    body: RegistrationSeedRequestV1 & { syncOsL1?: boolean },
  ) {
    const { syncOsL1, ...seed } = body ?? {};
    try {
      const out = await this.registrationSeedService.applySeed(userId, seed, {
        syncOsL1,
      });
      if ('error' in out) {
        return errorResponse(ErrorCode.BAD_REQUEST, out.error);
      }
      return successResponse(out);
    } catch (err) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  @Public()
  @Get('trips/:tripId/overrides')
  @ApiOperation({ summary: '列出本次旅行 L2 Override' })
  listOverrides(@Param('tripId') tripId: string) {
    return successResponse({
      tripId,
      mode: this.tripOverride.getTripMemoryMode(tripId),
      overrides: this.tripOverride.listTripOverrides(tripId),
    });
  }

  @Public()
  @Post('trips/:tripId/inherit-habit')
  @ApiOperation({ summary: '按我的习惯 — 继承 L1，不污染长期画像' })
  async inheritHabit(
    @Param('tripId') tripId: string,
    @Body()
    body: { userId: string; clearExistingOverrides?: boolean },
  ) {
    if (!body?.userId?.trim()) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'userId required');
    }
    const req: ApplyHabitInheritRequestV1 = {
      userId: body.userId.trim(),
      tripId,
      clearExistingOverrides: body.clearExistingOverrides,
    };
    try {
      return successResponse(await this.tripOverride.applyHabitInherit(req));
    } catch (err) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  @Public()
  @Post('trips/:tripId/trip-different')
  @ApiOperation({ summary: '这次不一样 — 只写 Trip Override' })
  async tripDifferent(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      userId: string;
      overrides: TripOverrideItemInputV1[];
      replaceExisting?: boolean;
    },
  ) {
    if (!body?.userId?.trim()) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'userId required');
    }
    if (!Array.isArray(body.overrides) || body.overrides.length === 0) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'overrides required');
    }
    const req: ApplyTripDifferentRequestV1 = {
      userId: body.userId.trim(),
      tripId,
      overrides: body.overrides,
      replaceExisting: body.replaceExisting,
    };
    try {
      return successResponse(await this.tripOverride.applyTripDifferent(req));
    } catch (err) {
      return errorResponse(
        ErrorCode.BAD_REQUEST,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  @Public()
  @Delete('trips/:tripId/overrides')
  @ApiOperation({ summary: '清除本次旅行 Override（可回到按习惯）' })
  clearOverrides(
    @Param('tripId') tripId: string,
    @Query('includeModeMarker') includeModeMarker?: string,
  ) {
    const n = this.tripOverride.clearTripOverrides(tripId, {
      includeModeMarker: includeModeMarker === '1' || includeModeMarker === 'true',
    });
    return successResponse({ tripId, clearedCount: n, l1Untouched: true });
  }
}
