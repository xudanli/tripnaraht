/**
 * File Extractor Direct Controller
 * 
 * 提供直接文件提取服务的 HTTP API 端点
 * 无需认证，完全自主实现
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { FileExtractorDirectService } from './file-extractor-direct.service';
import { ExtractMetadataDto, ExtractFileContentDto } from './dto/file-extractor.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('file-extractor-direct')
@Controller('file-extractor-direct')
@Public()
export class FileExtractorDirectController {
  private readonly logger = new Logger(FileExtractorDirectController.name);

  constructor(
    private readonly fileExtractorDirectService: FileExtractorDirectService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查服务状态',
    description: '检查 File Extractor Direct 服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务状态',
    type: ApiSuccessResponseDto,
  })
  health() {
    return successResponse({
      available: this.fileExtractorDirectService.isServiceAvailable(),
      service: 'file-extractor-direct',
      features: ['PDF', 'DOCX', 'XLSX', 'CSV'],
      authentication: 'none',
    });
  }

  @Post('extract-metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提取文件元数据',
    description: '从文件的公开 URL 提取元数据信息（无需认证）',
  })
  @ApiBody({ type: ExtractMetadataDto })
  @ApiResponse({
    status: 200,
    description: '元数据提取成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async extractMetadata(@Body() dto: ExtractMetadataDto) {
    try {
      if (!this.fileExtractorDirectService.isServiceAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'File Extractor Direct service is not available',
        );
      }

      const result = await this.fileExtractorDirectService.extractMetadata(dto.url);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to extract metadata:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '提取元数据失败',
      );
    }
  }

  @Post('extract-content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提取文件内容',
    description: '从文件的公开 URL 提取内容，支持分页、搜索等功能（无需认证）',
  })
  @ApiBody({ type: ExtractFileContentDto })
  @ApiResponse({
    status: 200,
    description: '内容提取成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async extractFileContent(@Body() dto: ExtractFileContentDto) {
    try {
      if (!this.fileExtractorDirectService.isServiceAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'File Extractor Direct service is not available',
        );
      }

      const result = await this.fileExtractorDirectService.extractFileContent(dto.url, {
        page: dto.page,
        limit: dto.limit,
        search: dto.search,
        sheet: dto.sheet,
        caseSensitive: dto.caseSensitive,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to extract file content:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '提取文件内容失败',
      );
    }
  }
}
