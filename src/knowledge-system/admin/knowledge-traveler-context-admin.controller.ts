import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { successResponse } from '../../common/dto/standard-response.dto';
import { KnowledgeTravelerContextService } from '../traveler-context/knowledge-traveler-context.service';

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge/traveler-context')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeTravelerContextAdminController {
  private readonly logger = new Logger(KnowledgeTravelerContextAdminController.name);

  constructor(private readonly travelerContext: KnowledgeTravelerContextService) {}

  @Get()
  @ApiOperation({ summary: 'ETC consume coverage (env)' })
  @ApiQuery({ name: 'tripId', required: false, description: 'If set, also return inspect summary' })
  async coverage(@Query('tripId') tripId?: string) {
    const stats = this.travelerContext.coverageStats();
    if (!tripId) return successResponse(stats);
    const view = await this.travelerContext.inspect(tripId);
    return successResponse({
      ...stats,
      tripId,
      sourceBreakdownKeys: Object.keys(view.sourceBreakdown),
      tripOverridesApplied: view.effectiveTravelerContext.tripOverridesApplied,
    });
  }

  @Get(':tripId/diff')
  @ApiOperation({ summary: 'L1 Memory → L2 Override → Effective diff' })
  @ApiParam({ name: 'tripId' })
  async diff(@Param('tripId') tripId: string) {
    return successResponse(await this.travelerContext.diff(tripId));
  }

  @Get(':tripId')
  @ApiOperation({
    summary: 'EffectiveTravelerContext inspector',
    description:
      'Shows ETC + sourceBreakdown. Use tripId=demo-ks-phase4 for seeded L1→L2 override demo.',
  })
  @ApiParam({ name: 'tripId' })
  async inspect(@Param('tripId') tripId: string) {
    const data = await this.travelerContext.inspect(tripId);
    this.logger.debug(
      `ETC inspect trip=${tripId} mode=${data.consumeMode} keys=${Object.keys(data.sourceBreakdown).length}`,
    );
    return successResponse(data);
  }
}
