import {
  Controller,
  Post,
  Body,
  Get,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StripeDirectService } from './stripe-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('stripe')
@Controller('api/stripe')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StripeDirectController {
  constructor(private readonly stripeService: StripeDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Stripe 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.stripeService.isServiceAvailable(),
    };
  }

  @Get('connection-status')
  @ApiOperation({ summary: '获取用户的 Stripe 连接状态' })
  @ApiResponse({ status: 200, description: '连接状态' })
  async getConnectionStatus(@CurrentUser() user: any) {
    try {
      const status = await this.stripeService.getConnectionStatus(user.id);
      return {
        success: true,
        ...status,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to get connection status',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('payment-intent')
  @ApiOperation({ summary: '创建支付意图' })
  @ApiResponse({ status: 200, description: '支付意图创建成功' })
  async createPaymentIntent(
    @CurrentUser() user: any,
    @Body() body: {
      amount: number; // Amount in cents
      currency?: string;
      metadata?: Record<string, string>;
      paymentMethodId?: string;
    },
  ) {
    try {
      const paymentIntent = await this.stripeService.createPaymentIntent({
        userId: user.id,
        amount: body.amount,
        currency: body.currency,
        metadata: body.metadata,
        paymentMethodId: body.paymentMethodId,
      });

      return {
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to create payment intent',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('payment-intent/:id/confirm')
  @ApiOperation({ summary: '确认支付意图' })
  @ApiResponse({ status: 200, description: '支付意图确认成功' })
  async confirmPaymentIntent(
    @Param('id') paymentIntentId: string,
    @Body() body: { paymentMethodId?: string },
  ) {
    try {
      const paymentIntent = await this.stripeService.confirmPaymentIntent(
        paymentIntentId,
        body.paymentMethodId,
      );

      return {
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to confirm payment intent',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('payment-intent/:id')
  @ApiOperation({ summary: '获取支付意图状态' })
  @ApiResponse({ status: 200, description: '支付意图信息' })
  async getPaymentIntent(@Param('id') paymentIntentId: string) {
    try {
      const paymentIntent = await this.stripeService.getPaymentIntent(paymentIntentId);

      return {
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          metadata: paymentIntent.metadata,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to get payment intent',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('refund')
  @ApiOperation({ summary: '处理退款' })
  @ApiResponse({ status: 200, description: '退款处理成功' })
  async refundPayment(
    @Body() body: {
      paymentIntentId: string;
      amount?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    },
  ) {
    try {
      const refund = await this.stripeService.refundPayment(
        body.paymentIntentId,
        body.amount,
        body.reason,
      );

      return {
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to process refund',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('payment-history')
  @ApiOperation({ summary: '获取支付历史' })
  @ApiResponse({ status: 200, description: '支付历史列表' })
  async getPaymentHistory(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('startingAfter') startingAfter?: string,
  ) {
    try {
      const paymentIntents = await this.stripeService.getPaymentHistory(
        user.id,
        limit ? parseInt(limit, 10) : 10,
        startingAfter,
      );

      return {
        success: true,
        paymentIntents: paymentIntents.map((pi) => ({
          id: pi.id,
          status: pi.status,
          amount: pi.amount,
          currency: pi.currency,
          created: pi.created,
          metadata: pi.metadata,
        })),
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to get payment history',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('connect/oauth/initiate')
  @ApiOperation({ summary: '初始化 Stripe Connect OAuth 流程' })
  @ApiResponse({ status: 200, description: 'OAuth 授权 URL' })
  async initiateConnectOAuth(
    @CurrentUser() user: any,
    @Query('redirectUri') redirectUri: string,
  ) {
    try {
      const authUrl = await this.stripeService.initiateConnectOAuth(user.id, redirectUri);

      return {
        success: true,
        authUrl,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to initiate OAuth',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('connect/oauth/callback')
  @ApiOperation({ summary: '完成 Stripe Connect OAuth 流程' })
  @ApiResponse({ status: 200, description: 'OAuth 完成成功' })
  async completeConnectOAuth(
    @CurrentUser() user: any,
    @Body() body: { code: string; state: string },
  ) {
    try {
      await this.stripeService.completeConnectOAuth(user.id, body.code, body.state);

      return {
        success: true,
        message: 'Stripe Connect OAuth completed successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'STRIPE_ERROR',
            message: error.message || 'Failed to complete OAuth',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
