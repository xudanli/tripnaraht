/**
 * Amadeus MCP Controller
 * 
 * 提供 Amadeus 航班搜索的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AmadeusService } from './amadeus.service';
import { AmadeusDirectService } from './amadeus-direct.service';
import { AmadeusSearchFlightOffersDto } from './dto/amadeus-search.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('amadeus')
@Controller('amadeus')
@Public() // 临时开放，生产环境可能需要认证
export class AmadeusController {
  private readonly logger = new Logger(AmadeusController.name);

  constructor(
    private readonly amadeusService: AmadeusService,
    @Optional() private readonly amadeusDirectService?: AmadeusDirectService,
  ) {}

  @Post('search/flights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '搜索航班',
    description: '使用 Amadeus API 搜索航班，支持单程和往返航班',
  })
  @ApiBody({ type: AmadeusSearchFlightOffersDto })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: '服务器错误',
    type: ApiErrorResponseDto,
  })
  async searchFlights(@Body() dto: AmadeusSearchFlightOffersDto) {
    try {
      this.logger.log(`Searching flights: ${dto.originLocationCode} -> ${dto.destinationLocationCode}`);

      const searchParams = {
        originLocationCode: dto.originLocationCode,
        destinationLocationCode: dto.destinationLocationCode,
        departureDate: dto.departureDate,
        adults: dto.adults,
        returnDate: dto.returnDate,
        children: dto.children,
        infants: dto.infants,
        travelClass: dto.travelClass,
        includedAirlineCodes: dto.includedAirlineCodes,
        excludedAirlineCodes: dto.excludedAirlineCodes,
        nonStop: dto.nonStop,
        currencyCode: dto.currencyCode,
        maxPrice: dto.maxPrice,
        max: dto.max,
      };

      let result: any;
      if (this.amadeusDirectService?.isAvailable) {
        result = await this.amadeusDirectService.searchFlightOffers(searchParams);
      } else {
        result = await this.amadeusService.searchFlightOffers({
        originLocationCode: dto.originLocationCode,
        destinationLocationCode: dto.destinationLocationCode,
        departureDate: dto.departureDate,
        adults: dto.adults,
        returnDate: dto.returnDate,
        children: dto.children,
        infants: dto.infants,
        travelClass: dto.travelClass,
        includedAirlineCodes: dto.includedAirlineCodes,
        excludedAirlineCodes: dto.excludedAirlineCodes,
        nonStop: dto.nonStop,
        currencyCode: dto.currencyCode,
        maxPrice: dto.maxPrice,
        max: dto.max,
        });
      }

      // 解析结果（Direct 返回 { data }，MCP 返回 { content }）
      if (result?.data) {
        return successResponse(result);
      }
      if (result && result.content && result.content[0]) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            return successResponse(data);
          } catch (parseError) {
            return successResponse({ raw: content.text });
          }
        }
      }

      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Search flights failed:', error);
      
      if (error.message?.includes('OAuth authorization required')) {
        return errorResponse(
          ErrorCode.UNAUTHORIZED,
          '需要完成 OAuth 认证',
          {
            message: error.message,
            authorizationUrl: error.message.split('Visit: ')[1] || '',
          },
        );
      }

      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '搜索航班失败',
      );
    }
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Ping 测试',
    description: '测试 Amadeus MCP 服务器连接',
  })
  @ApiResponse({
    status: 200,
    description: '测试成功',
    type: ApiSuccessResponseDto,
  })
  async ping() {
    try {
      const result = await this.amadeusService.ping();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Ping failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || 'Ping 失败',
      );
    }
  }

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 Amadeus MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      const result = await this.amadeusService.listTools();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('auth/status')
  @ApiOperation({
    summary: '检查授权状态',
    description: '检查当前是否已完成 Amadeus OAuth 授权',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async checkAuthStatus() {
    try {
      const status = await this.amadeusService.checkAuthStatus();
      return successResponse(status);
    } catch (error: any) {
      this.logger.error('Check auth status failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查授权状态失败',
      );
    }
  }

  @Get('auth/url')
  @ApiOperation({
    summary: '获取授权 URL',
    description: '获取 Amadeus OAuth 授权 URL，用户需要访问此 URL 完成授权',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '已授权或获取失败',
    type: ApiErrorResponseDto,
  })
  async getAuthorizationUrl() {
    try {
      const result = await this.amadeusService.getAuthorizationUrl();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Get authorization URL failed:', error);
      
      if (error.message?.includes('Already authorized')) {
        return errorResponse(
          ErrorCode.BAD_REQUEST,
          '已经完成授权，无需再次授权',
        );
      }

      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取授权 URL 失败',
      );
    }
  }

  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证授权',
    description: '验证指定的 connectionId 是否已完成授权',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: '连接 ID（从授权 URL 获取）',
          example: 'example-connection-id',
        },
      },
      required: ['connectionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '验证成功',
    type: ApiSuccessResponseDto,
  })
  async verifyAuthorization(@Body('connectionId') connectionId: string) {
    try {
      if (!connectionId) {
        return errorResponse(
          ErrorCode.BAD_REQUEST,
          'connectionId 不能为空',
        );
      }

      const result = await this.amadeusService.verifyAuthorization(connectionId);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Verify authorization failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '验证授权失败',
      );
    }
  }
}
