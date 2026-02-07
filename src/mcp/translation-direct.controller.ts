import {
  Controller,
  Post,
  Body,
  Get,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TranslationDirectService, TranslationParams } from './translation-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('translation')
@Controller('api/translation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TranslationDirectController {
  constructor(private readonly translationService: TranslationDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Translation 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.translationService.isServiceAvailable(),
    };
  }

  @Post('translate')
  @ApiOperation({ summary: '翻译文本' })
  @ApiResponse({ status: 200, description: '翻译结果' })
  async translate(
    @Body() body: TranslationParams,
  ) {
    try {
      const result = await this.translationService.translate(body);
      
      return {
        success: true,
        result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to translate text',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('detect')
  @ApiOperation({ summary: '检测语言' })
  @ApiResponse({ status: 200, description: '语言检测结果' })
  async detectLanguage(
    @Body() body: { text: string },
  ) {
    try {
      const result = await this.translationService.detectLanguage(body.text);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to detect language',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('languages')
  @ApiOperation({ summary: '获取支持的语言列表' })
  @ApiResponse({ status: 200, description: '支持的语言列表' })
  async getSupportedLanguages(
    @Query('target') target?: string,
  ) {
    try {
      const languages = await this.translationService.getSupportedLanguages(target);
      
      return {
        success: true,
        languages,
        count: languages.length,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to get supported languages',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('settings')
  @ApiOperation({ summary: '获取用户翻译设置' })
  @ApiResponse({ status: 200, description: '用户设置' })
  async getUserTranslationSettings(@CurrentUser() user: any) {
    try {
      const settings = await this.translationService.getUserTranslationSettings(user.id);
      
      return {
        success: true,
        settings: settings || {
          defaultTargetLanguage: 'en',
          preferredLanguages: [],
          autoDetect: true,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to get user translation settings',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('settings')
  @ApiOperation({ summary: '保存用户翻译设置' })
  @ApiResponse({ status: 200, description: '设置保存成功' })
  async saveUserTranslationSettings(
    @CurrentUser() user: any,
    @Body() body: {
      defaultTargetLanguage?: string;
      preferredLanguages?: string[];
      autoDetect?: boolean;
    },
  ) {
    try {
      await this.translationService.saveUserTranslationSettings(user.id, body);
      
      return {
        success: true,
        message: 'Settings saved successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to save user translation settings',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('smart-translate')
  @ApiOperation({ summary: '智能翻译（基于用户设置）' })
  @ApiResponse({ status: 200, description: '翻译结果' })
  async smartTranslate(
    @CurrentUser() user: any,
    @Body() body: {
      text: string;
      targetLanguage?: string;
    },
  ) {
    try {
      const result = await this.translationService.smartTranslate(
        user.id,
        body.text,
        body.targetLanguage
      );
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'TRANSLATION_ERROR',
            message: error.message || 'Failed to smart translate',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
