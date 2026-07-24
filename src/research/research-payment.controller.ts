import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { ResearchPaymentService } from './research-payment.service';

class SubmitPriceLockDto {
  @IsInt()
  @Min(1)
  lockedPriceUsd!: number;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

@ApiTags('research')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research')
export class ResearchPaymentController {
  constructor(private readonly payments: ResearchPaymentService) {}

  @Get('payments/catalog')
  @ApiOperation({ summary: 'Sprint 4B — 研究支付 SKU 与法务文案' })
  getCatalog() {
    return successResponse(this.payments.getPaymentCatalog());
  }

  @Get('sessions/:sessionId/payments/deposit/status')
  @ApiOperation({ summary: 'Sprint 4B — 订金支付状态' })
  async depositStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const result = await this.payments.getDepositStatus(sessionId, user.userId);
    return successResponse(result);
  }

  @Post('sessions/:sessionId/payments/deposit/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4B — 发起可退订金（Stripe PI 或沙箱）' })
  async startDeposit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const result = await this.payments.startDeposit(sessionId, user.userId);
    return successResponse(result);
  }

  @Post('sessions/:sessionId/payments/deposit/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4B — 确认订金支付（前端 Stripe 完成后或沙箱）' })
  async confirmDeposit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const result = await this.payments.confirmDeposit(sessionId, user.userId);
    return successResponse(result);
  }

  @Post('sessions/:sessionId/payments/deposit/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4B — 一键全额退款' })
  async refundDeposit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const result = await this.payments.refundDeposit(sessionId, user.userId);
    return successResponse(result);
  }

  @Post('sessions/:sessionId/price-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sprint 4B — 价格锁定意向（无支付）' })
  async priceLock(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: SubmitPriceLockDto,
  ) {
    const result = await this.payments.submitPriceLock(sessionId, user.userId, body);
    return successResponse(result);
  }
}
