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
import { HotelDirectService, HotelSearchParams } from './hotel-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('hotel')
@Controller('api/hotel')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HotelDirectController {
  constructor(private readonly hotelService: HotelDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Hotel 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.hotelService.isServiceAvailable(),
    };
  }

  @Post('search')
  @ApiOperation({ summary: '搜索酒店' })
  @ApiResponse({ status: 200, description: '酒店搜索结果' })
  async searchHotels(
    @CurrentUser() user: any,
    @Body() body: HotelSearchParams,
  ) {
    try {
      const result = await this.hotelService.searchHotels(body);
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to search hotels',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('details/:placeId')
  @ApiOperation({ summary: '获取酒店详情' })
  @ApiResponse({ status: 200, description: '酒店详情' })
  async getHotelDetails(
    @Param('placeId') placeId: string,
    @Query('language') language?: string,
  ) {
    try {
      const details = await this.hotelService.getHotelDetails(placeId, language);
      
      if (!details) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'HOTEL_NOT_FOUND',
              message: 'Hotel not found',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        hotel: details,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to get hotel details',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('nearby')
  @ApiOperation({ summary: '附近搜索酒店' })
  @ApiResponse({ status: 200, description: '附近酒店列表' })
  async nearbySearch(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('priceLevel') priceLevel?: string,
    @Query('minRating') minRating?: string,
    @Query('language') language?: string,
  ) {
    try {
      const location = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      };

      if (isNaN(location.lat) || isNaN(location.lng)) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'INVALID_PARAMS',
              message: 'Invalid latitude or longitude',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const results = await this.hotelService.nearbySearch({
        location,
        radius: radius ? parseInt(radius) : undefined,
        type,
        keyword,
        priceLevel: priceLevel ? parseInt(priceLevel) as 1 | 2 | 3 | 4 : undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        language,
      });

      return {
        success: true,
        results,
        count: results.length,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to search nearby hotels',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('preferences')
  @ApiOperation({ summary: '获取用户酒店偏好' })
  @ApiResponse({ status: 200, description: '用户偏好' })
  async getUserPreferences(@CurrentUser() user: any) {
    try {
      const preferences = await this.hotelService.getUserPreferences(user.id);
      
      return {
        success: true,
        preferences: preferences || {
          hotelType: [],
          priceRange: 'medium',
          amenities: [],
          favoriteHotels: [],
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to get user preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('preferences')
  @ApiOperation({ summary: '保存用户酒店偏好' })
  @ApiResponse({ status: 200, description: '偏好保存成功' })
  async saveUserPreferences(
    @CurrentUser() user: any,
    @Body() body: {
      hotelType?: string[];
      priceRange?: string;
      amenities?: string[];
      favoriteHotels?: string[];
    },
  ) {
    try {
      await this.hotelService.saveUserPreferences(user.id, body);
      
      return {
        success: true,
        message: 'Preferences saved successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to save user preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('recommend')
  @ApiOperation({ summary: '智能推荐酒店（基于用户偏好和上下文）' })
  @ApiResponse({ status: 200, description: '推荐酒店列表' })
  async recommendHotels(
    @CurrentUser() user: any,
    @Body() body: {
      location: { lat: number; lng: number };
      checkIn?: string; // YYYY-MM-DD
      checkOut?: string; // YYYY-MM-DD
      guests?: number;
      radius?: number;
    },
  ) {
    try {
      const context = {
        location: body.location,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guests: body.guests,
        radius: body.radius,
      };

      const recommendations = await this.hotelService.recommendHotels(
        user.id,
        context,
      );

      return {
        success: true,
        recommendations,
        count: recommendations.length,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'HOTEL_ERROR',
            message: error.message || 'Failed to recommend hotels',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
