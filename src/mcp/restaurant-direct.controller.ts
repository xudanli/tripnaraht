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
import { RestaurantDirectService, RestaurantSearchParams } from './restaurant-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('restaurant')
@Controller('api/restaurant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RestaurantDirectController {
  constructor(private readonly restaurantService: RestaurantDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Restaurant 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.restaurantService.isServiceAvailable(),
    };
  }

  @Post('search')
  @ApiOperation({ summary: '搜索餐厅' })
  @ApiResponse({ status: 200, description: '餐厅搜索结果' })
  async searchRestaurants(
    @CurrentUser() user: any,
    @Body() body: RestaurantSearchParams,
  ) {
    try {
      const result = await this.restaurantService.searchRestaurants(body);
      return {
        ...result,
        success: true,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to search restaurants',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('details/:placeId')
  @ApiOperation({ summary: '获取餐厅详情' })
  @ApiResponse({ status: 200, description: '餐厅详情' })
  async getRestaurantDetails(
    @Param('placeId') placeId: string,
    @Query('language') language?: string,
  ) {
    try {
      const details = await this.restaurantService.getRestaurantDetails(placeId, language);
      
      if (!details) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'RESTAURANT_NOT_FOUND',
              message: 'Restaurant not found',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        restaurant: details,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to get restaurant details',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('nearby')
  @ApiOperation({ summary: '附近搜索餐厅' })
  @ApiResponse({ status: 200, description: '附近餐厅列表' })
  async nearbySearch(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('priceLevel') priceLevel?: string,
    @Query('minRating') minRating?: string,
    @Query('openNow') openNow?: string,
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

      const results = await this.restaurantService.nearbySearch({
        location,
        radius: radius ? parseInt(radius) : undefined,
        type,
        keyword,
        priceLevel: priceLevel ? parseInt(priceLevel) as 1 | 2 | 3 | 4 : undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        openNow: openNow === 'true' ? true : openNow === 'false' ? false : undefined,
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
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to search nearby restaurants',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('preferences')
  @ApiOperation({ summary: '获取用户餐厅偏好' })
  @ApiResponse({ status: 200, description: '用户偏好' })
  async getUserPreferences(@CurrentUser() user: any) {
    try {
      const preferences = await this.restaurantService.getUserPreferences(user.id);
      
      return {
        success: true,
        preferences: preferences || {
          cuisine: [],
          priceRange: 'medium',
          dietaryRestrictions: [],
          favoriteRestaurants: [],
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to get user preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('preferences')
  @ApiOperation({ summary: '保存用户餐厅偏好' })
  @ApiResponse({ status: 200, description: '偏好保存成功' })
  async saveUserPreferences(
    @CurrentUser() user: any,
    @Body() body: {
      cuisine?: string[];
      priceRange?: string;
      dietaryRestrictions?: string[];
      favoriteRestaurants?: string[];
    },
  ) {
    try {
      await this.restaurantService.saveUserPreferences(user.id, body);
      
      return {
        success: true,
        message: 'Preferences saved successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to save user preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('recommend')
  @ApiOperation({ summary: '智能推荐餐厅（基于用户偏好和上下文）' })
  @ApiResponse({ status: 200, description: '推荐餐厅列表' })
  async recommendRestaurants(
    @CurrentUser() user: any,
    @Body() body: {
      location: { lat: number; lng: number };
      time?: string; // ISO 8601 date string
      budget?: number;
      radius?: number;
    },
  ) {
    try {
      const context = {
        location: body.location,
        time: body.time ? new Date(body.time) : undefined,
        budget: body.budget,
        radius: body.radius,
      };

      const recommendations = await this.restaurantService.recommendRestaurants(
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
            code: 'RESTAURANT_ERROR',
            message: error.message || 'Failed to recommend restaurants',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
