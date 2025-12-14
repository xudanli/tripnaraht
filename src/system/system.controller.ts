// src/system/system.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { successResponse } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  @ApiOperation({
    summary: '获取系统能力/状态',
    description:
      '返回系统各功能模块的状态信息，用于前端提示"某能力暂不可用"。\n\n' +
      '**返回内容**：\n' +
      '- OCR Provider 状态（mock/google/unavailable）\n' +
      '- POI Provider 状态（mock/google/osm/unavailable）\n' +
      '- ASR Provider 状态（mock/openai/google/azure/unavailable）\n' +
      '- TTS Provider 状态（mock/openai/google/azure/unavailable）\n' +
      '- LLM Provider 状态（mock/openai/anthropic/google/unavailable）\n' +
      '- 限流信息\n' +
      '- 功能开关状态',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回系统状态',
    type: ApiSuccessResponseDto,
  })
  getStatus() {
    const status = this.systemService.getStatus();
    return successResponse(status);
  }
}
