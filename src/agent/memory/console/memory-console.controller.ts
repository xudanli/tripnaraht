import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { UserMemoryConsoleService } from './user-memory-console.service';
import { PatchUserTravelProfileL1Dto } from './memory-console.dto';

@ApiTags('Agent Memory OS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent/memory/v1')
export class MemoryConsoleController {
  constructor(private readonly consoleService: UserMemoryConsoleService) {}

  @Get('console')
  @ApiOperation({ summary: 'Memory Console 聚合读（L0/L1/L2 + trip Sink patches）' })
  @ApiQuery({ name: 'trip_id', required: false })
  async getConsole(@CurrentUser() user: CurrentUserPayload, @Query('trip_id') tripId?: string) {
    return this.consoleService.getConsole(user.userId, tripId);
  }

  @Patch('console/l1')
  @ApiOperation({ summary: '修正 L1 用户旅行画像（partial）' })
  async patchL1(@CurrentUser() user: CurrentUserPayload, @Body() body: PatchUserTravelProfileL1Dto) {
    const l1 = await this.consoleService.patchL1(user.userId, body);
    return { success: true, l1 };
  }

  @Delete('console/l1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空 L1（重置为默认冷启动画像）' })
  async deleteL1(@CurrentUser() user: CurrentUserPayload) {
    await this.consoleService.deleteL1(user.userId);
    return { success: true, reset_to_default: true, deleted_at: new Date().toISOString() };
  }

  @Delete('console/l0/:fieldKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 L0 单字段' })
  @ApiParam({ name: 'fieldKey', example: 'tags' })
  async deleteL0(@CurrentUser() user: CurrentUserPayload, @Param('fieldKey') fieldKey: string) {
    await this.consoleService.deleteL0Field(user.userId, fieldKey);
    return { success: true, field_key: fieldKey };
  }

  @Delete('console/l2/:decisionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 L2 路线决策记忆' })
  @ApiParam({ name: 'decisionId', example: 'uuid' })
  async deleteL2(@CurrentUser() user: CurrentUserPayload, @Param('decisionId') decisionId: string) {
    await this.consoleService.deleteL2Decision(user.userId, decisionId);
    return { success: true, removed_decision_id: decisionId, deleted_at: new Date().toISOString() };
  }

  @Delete('console/trip/:tripId/constraints/:patchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 Task 级 Constraint Sink patch' })
  async deletePatch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @Param('patchId') patchId: string,
  ) {
    const remaining = await this.consoleService.deleteTripConstraintPatch(user.userId, tripId, patchId);
    return { success: true, trip_id: tripId, removed_patch_id: patchId, remaining_patch_count: remaining };
  }

  @Get('export')
  @ApiOperation({ summary: 'GDPR Export（JSON）' })
  async exportMemory(@CurrentUser() user: CurrentUserPayload) {
    const payload = await this.consoleService.exportUserMemory(user.userId);
    return payload;
  }
}
