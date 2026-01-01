// src/contact/contact.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiExtraModels,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ContactService, MulterFile } from './services/contact.service';
import { StandardResponse, successResponse, errorResponse } from '../common/dto/standard-response.dto';
import { ContactMessageResponseDto } from './dto/contact-message.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('contact')
@ApiExtraModels(ApiSuccessResponseDto, ApiErrorResponseDto, ContactMessageResponseDto)
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('message')
  @Public() // 可选认证，支持匿名提交
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  @ApiOperation({
    summary: '发送联系消息',
    description: `
发送联系消息，支持文本和图片上传。

**功能特性**：
- 支持匿名用户提交（可选认证）
- 支持文本消息和多图片上传
- 消息和图片至少需要提供其中一项
- 图片格式：jpg, jpeg, png, gif, webp
- 单张图片最大 5MB
- 最多上传 5 张图片

**限流策略**：
- 匿名用户：每小时 3 次
- 已认证用户：每小时 10 次

**通知**：提交成功后会自动发送邮件通知到客服邮箱。
    `.trim(),
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '用户输入的文本消息内容',
          example: '发现了错误或有好的想法要分享......',
        },
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: '图片文件数组，支持多图上传（最多5张）',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '消息发送成功',
    type: ContactMessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数无效',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { 
              type: 'string', 
              enum: ['INVALID_REQUEST', 'FILE_TOO_LARGE', 'INVALID_FILE_TYPE', 'TOO_MANY_FILES'],
              example: 'INVALID_REQUEST'
            },
            message: { type: 'string', example: '消息和图片不能同时为空' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 413,
    description: '文件过大',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'FILE_TOO_LARGE' },
            message: { type: 'string', example: '图片文件过大，单个文件不能超过 5MB' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 415,
    description: '不支持的文件类型',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'INVALID_FILE_TYPE' },
            message: { type: 'string', example: '不支持的图片格式，仅支持 jpg, jpeg, png, gif, webp' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: '请求频率过高',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'RATE_LIMIT_EXCEEDED' },
            message: { type: 'string', example: '发送消息过于频繁，请稍后再试' },
            details: {
              type: 'object',
              properties: {
                resetTime: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  @ApiBearerAuth()
  async sendMessage(
    @Body() body: { message?: string },
    @UploadedFiles() files: MulterFile[] | undefined,
    @Req() req: Request,
  ): Promise<StandardResponse<ContactMessageResponseDto>> {
    try {
      // 从请求中获取用户ID（如果已认证）
      const userId = (req as any).user?.id || (req as any).user?.userId;
      
      // 获取客户端IP地址
      const ipAddress = req.ip || 
                       req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                       req.socket.remoteAddress ||
                       'unknown';

      const result = await this.contactService.createContactMessage(
        body.message,
        files,
        userId,
        ipAddress,
      );

      return successResponse(result);
    } catch (error: any) {
      // 如果是 HttpException（如 BadRequestException），直接返回其响应
      if (error instanceof HttpException) {
        throw error;
      }

      // 其他错误，返回内部错误
      this.contactService['logger'].error(`发送联系消息失败: ${error.message}`, error.stack);
      return errorResponse('INTERNAL_ERROR', '服务器内部错误，请稍后重试');
    }
  }
}
