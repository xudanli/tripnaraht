/**
 * File Extractor MCP Controller
 * 
 * 提供 File Extractor MCP 服务的 API 端点
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
import { FileExtractorMcpService } from './file-extractor-mcp.service';
import { ExtractMetadataDto, ExtractFileContentDto } from './dto/file-extractor.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('file-extractor-mcp')
@Controller('file-extractor-mcp')
@Public() // 临时开放，生产环境可能需要认证
export class FileExtractorMcpController {
  private readonly logger = new Logger(FileExtractorMcpController.name);

  constructor(
    private readonly fileExtractorMcpService: FileExtractorMcpService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查服务状态',
    description: '检查 File Extractor MCP 服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务状态',
    type: ApiSuccessResponseDto,
  })
  health() {
    return successResponse({
      available: this.fileExtractorMcpService.isAvailable(),
      service: 'file-extractor-mcp',
    });
  }

  @Get('tools')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 File Extractor MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '工具列表',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      if (!this.fileExtractorMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'File Extractor MCP service is not available. Please check configuration.',
        );
      }

      const tools = await this.fileExtractorMcpService.listTools();
      return successResponse({ tools: tools.tools || [] });
    } catch (error: any) {
      this.logger.error('Failed to list tools:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Post('extract-metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提取文件元数据',
    description: '从文件的公开 URL 提取元数据信息',
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
      if (!this.fileExtractorMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'File Extractor MCP service is not available. Please check configuration.',
        );
      }

      const result = await this.fileExtractorMcpService.extractMetadata(dto.url);
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
    description: '从文件的公开 URL 提取内容，支持分页、搜索等功能',
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
      if (!this.fileExtractorMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'File Extractor MCP service is not available. Please check configuration.',
        );
      }

      const result = await this.fileExtractorMcpService.extractFileContent(dto.url, {
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
