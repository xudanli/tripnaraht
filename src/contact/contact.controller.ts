// src/contact/contact.controller.ts
import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFiles,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
  BadRequestException,
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
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ContactService, MulterFile } from './services/contact.service';
import { StandardResponse, successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ContactMessageResponseDto } from './dto/contact-message.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { GetContactMessagesQueryDto, UpdateContactMessageStatusDto, ReplyContactMessageDto } from './dto/admin-contact.dto';
import { Query, Param, Put, Body as BodyParam, NotFoundException as NotFoundExceptionClass } from '@nestjs/common';

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

  // ==================== 管理接口 ====================

  @Get('admin/messages')
  @ApiOperation({
    summary: '获取联系消息列表（管理接口）',
    description: '获取联系消息列表，支持分页、状态筛选、搜索。需要管理员权限。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'read', 'replied', 'resolved'], description: '状态筛选' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: '用户ID筛选' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词（消息内容）' })
  @ApiResponse({
    status: 200,
    description: '成功返回消息列表',
    type: ApiSuccessResponseDto,
  })
  async getContactMessages(@Query() query: GetContactMessagesQueryDto) {
    try {
      const result = await this.contactService.getContactMessages(query);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('admin/messages/:id')
  @ApiOperation({
    summary: '获取联系消息详情（管理接口）',
    description: '根据消息ID获取消息详细信息，包括图片。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: '消息ID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回消息详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '消息不存在',
    type: ApiErrorResponseDto,
  })
  async getContactMessageById(@Param('id') messageId: string) {
    try {
      const message = await this.contactService.getContactMessageById(messageId);
      return successResponse(message);
    } catch (error: any) {
      if (error instanceof NotFoundExceptionClass) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put('admin/messages/:id/status')
  @ApiOperation({
    summary: '更新联系消息状态（管理接口）',
    description: '更新联系消息的状态（pending/read/replied/resolved）。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: '消息ID', type: String })
  @ApiBody({ type: UpdateContactMessageStatusDto })
  @ApiResponse({
    status: 200,
    description: '成功更新消息状态',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '消息不存在',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async updateContactMessageStatus(
    @Param('id') messageId: string,
    @BodyParam() dto: UpdateContactMessageStatusDto,
  ) {
    try {
      const message = await this.contactService.updateContactMessageStatus(messageId, dto.status);
      return successResponse(message);
    } catch (error: any) {
      if (error instanceof NotFoundExceptionClass) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('admin/messages/:id/reply')
  @ApiOperation({
    summary: '回复联系消息（管理接口）',
    description: '回复联系消息，会自动将状态更新为replied。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: '消息ID', type: String })
  @ApiBody({ type: ReplyContactMessageDto })
  @ApiResponse({
    status: 200,
    description: '成功回复消息',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '消息不存在',
    type: ApiErrorResponseDto,
  })
  async replyContactMessage(
    @Param('id') messageId: string,
    @BodyParam() dto: ReplyContactMessageDto,
  ) {
    try {
      // 先更新状态为replied
      const message = await this.contactService.updateContactMessageStatus(messageId, 'replied');
      
      // TODO: 这里可以添加发送回复邮件的逻辑
      // await this.contactService.sendReplyEmail(messageId, dto.reply);
      
      return successResponse({
        ...message,
        reply: dto.reply,
        repliedAt: new Date(),
      });
    } catch (error: any) {
      if (error instanceof NotFoundExceptionClass) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
