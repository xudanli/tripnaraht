/**
 * Result-page bootstrap BFF.
 * Path: GET /api/iceland-self-drive/trips/:tripId/bootstrap
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { IcelandSelfDriveBootstrapService } from './services/iceland-self-drive-bootstrap.service';

@ApiTags('iceland-self-drive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('iceland-self-drive/trips')
export class IcelandSelfDriveBootstrapController {
  constructor(private readonly bootstrap: IcelandSelfDriveBootstrapService) {}

  @Get(':tripId/bootstrap')
  @ApiOperation({ summary: '结果页 bootstrap：进度 + checklist + generationStatus' })
  async getBootstrap(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
  ) {
    const data = await this.bootstrap.getBootstrap(user.userId, tripId);
    return successResponse(data);
  }
}
