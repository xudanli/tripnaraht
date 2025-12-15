// src/vision/vision.controller.ts

import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { VisionService } from './vision.service';
import { AssistantSuggestion } from '../assist/dto/action.dto';
import { StandardResponse, successResponse } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

// Multer file type
interface MulterFile {
  buffer: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
}

@ApiTags('vision')
@ApiExtraModels(ApiSuccessResponseDto, ApiErrorResponseDto)
@Controller('vision')
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  @Post('poi-recommend')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
    })
  )
  @ApiOperation({
    summary: '拍照识别 POI 推荐',
    description:
      '上传图片（招牌/菜单），通过 OCR 提取文字，然后搜索附近的 POI 并返回候选列表和"加入行程"建议。\n\n' +
      '**流程**：\n' +
      '1. OCR 提取文字（招牌店名/地址/菜单关键词）\n' +
      '2. POI Resolver：用文字 + 用户定位搜索 POI\n' +
      '3. 返回候选 POI 列表（带距离/评分/营业状态）\n' +
      '4. 每个候选提供"加入行程"建议（action: ADD_POI_TO_SCHEDULE）',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'lat', 'lng'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: '图片文件（支持 jpeg/png，最大 6MB）',
        },
        lat: {
          type: 'number',
          description: '用户当前位置纬度',
          example: 35.6762,
        },
        lng: {
          type: 'number',
          description: '用户当前位置经度',
          example: 139.6503,
        },
        locale: {
          type: 'string',
          description: '语言代码（可选），如 zh-CN, ja-JP, en-US',
          example: 'zh-CN',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回 POI 候选列表和建议（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            ocrResult: {
              type: 'object',
              properties: {
                fullText: { type: 'string' },
                lines: { type: 'array', items: { type: 'string' } },
              },
            },
            candidates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  distanceM: { type: 'number' },
                  rating: { type: 'number' },
                  isOpenNow: { type: 'boolean' },
                },
              },
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'vision:abc12345' },
                  title: { type: 'string' },
                  confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                  action: { type: 'object' },
                  poiInfo: { type: 'object' },
                },
              },
            },
          },
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'PROVIDER_ERROR' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async poiRecommend(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { lat: string; lng: string; locale?: string }
  ): Promise<StandardResponse<{
    ocrResult: { fullText: string; lines: string[] };
    candidates: Array<any>;
    suggestions: AssistantSuggestion[];
  }>> {
    if (!file) {
      throw new BadRequestException('请上传图片文件');
    }

    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);

    if (isNaN(lat) || isNaN(lng)) {
      throw new BadRequestException('lat 和 lng 必须是有效的数字');
    }

      return this.visionService.poiRecommend(file.buffer, {
        lat,
        lng,
        locale: body.locale,
      });
  }

  @Get('capabilities')
  @ApiOperation({
    summary: '查询 Vision 服务能力',
    description:
      '返回 Vision 服务支持的能力，包括支持的文件格式、最大尺寸、是否支持 HEIC 等。\n\n' +
      '用于前端在上传前验证文件是否符合要求。',
  })
  @ApiResponse({
    status: 200,
    description: '返回 Vision 服务能力（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            supportedFormats: {
              type: 'array',
              items: { type: 'string' },
              example: ['image/jpeg', 'image/png', 'image/heic'],
            },
            maxFileSize: { type: 'number', description: '最大文件大小（字节）', example: 6291456 },
            maxFileSizeMB: { type: 'number', description: '最大文件大小（MB）', example: 6 },
            supportsHeic: { type: 'boolean', example: true },
            requiresCompression: { type: 'boolean', description: '是否需要前端压缩', example: false },
            compressionRecommendation: {
              type: 'string',
              description: '压缩建议',
              example: '建议上传前压缩到 2MB 以下',
            },
            supportsExifRotation: { type: 'boolean', description: '是否支持 EXIF 旋转', example: true },
          },
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async getCapabilities(): Promise<StandardResponse<{
    supportedFormats: string[];
    maxFileSize: number;
    maxFileSizeMB: number;
    supportsHeic: boolean;
    requiresCompression: boolean;
    compressionRecommendation?: string;
    supportsExifRotation: boolean;
  }>> {
    return successResponse({
      supportedFormats: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
      maxFileSize: 6 * 1024 * 1024, // 6MB
      maxFileSizeMB: 6,
      supportsHeic: true,
      requiresCompression: false,
      compressionRecommendation: '建议上传前压缩到 2MB 以下以获得更好的性能',
      supportsExifRotation: true,
    });
  }
}
