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
import { ImageDirectService, ImageSearchParams } from './image-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('image')
@Controller('api/image')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ImageDirectController {
  constructor(private readonly imageService: ImageDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Image 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.imageService.isServiceAvailable(),
    };
  }

  @Post('search')
  @ApiOperation({ summary: '搜索图片' })
  @ApiResponse({ status: 200, description: '搜索结果' })
  async searchImages(
    @Body() body: ImageSearchParams,
  ) {
    try {
      const result = await this.imageService.searchImages(body);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to search images',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('details/:photoId')
  @ApiOperation({ summary: '获取图片详情' })
  @ApiResponse({ status: 200, description: '图片详情' })
  async getImageDetails(
    @Param('photoId') photoId: string,
    @Query('source') source?: 'pexels' | 'unsplash',
  ) {
    try {
      const details = await this.imageService.getImageDetails(
        parseInt(photoId),
        source || 'pexels'
      );
      
      if (!details) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'IMAGE_NOT_FOUND',
              message: 'Image not found',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        photo: details,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to get image details',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('curated')
  @ApiOperation({ summary: '获取推荐图片' })
  @ApiResponse({ status: 200, description: '推荐图片列表' })
  async getCuratedPhotos(
    @Query('perPage') perPage?: number,
    @Query('page') page?: number,
  ) {
    try {
      const result = await this.imageService.getCuratedPhotos({
        perPage: perPage ? parseInt(perPage.toString()) : undefined,
        page: page ? parseInt(page.toString()) : undefined,
      });
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to get curated photos',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('preferences')
  @ApiOperation({ summary: '获取用户图片偏好设置' })
  @ApiResponse({ status: 200, description: '用户设置' })
  async getUserImagePreferences(@CurrentUser() user: any) {
    try {
      const preferences = await this.imageService.getUserImagePreferences(user.id);
      
      return {
        success: true,
        preferences: preferences || {
          preferredStyles: [],
          preferredColors: [],
          preferredOrientations: [],
          favoriteImages: [],
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to get user image preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('preferences')
  @ApiOperation({ summary: '保存用户图片偏好设置' })
  @ApiResponse({ status: 200, description: '设置保存成功' })
  async saveUserImagePreferences(
    @CurrentUser() user: any,
    @Body() body: {
      preferredStyles?: string[];
      preferredColors?: string[];
      preferredOrientations?: string[];
      favoriteImages?: number[];
    },
  ) {
    try {
      await this.imageService.saveUserImagePreferences(user.id, body);
      
      return {
        success: true,
        message: 'Preferences saved successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to save user image preferences',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('recommend')
  @ApiOperation({ summary: '智能推荐图片（基于用户偏好）' })
  @ApiResponse({ status: 200, description: '推荐结果' })
  async recommendImages(
    @CurrentUser() user: any,
    @Body() body: {
      query?: string;
      perPage?: number;
      page?: number;
    },
  ) {
    try {
      const result = await this.imageService.recommendImages(user.id, body);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'IMAGE_ERROR',
            message: error.message || 'Failed to recommend images',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
