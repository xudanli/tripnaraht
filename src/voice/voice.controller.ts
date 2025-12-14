// src/voice/voice.controller.ts

import { Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiExtraModels, ApiConsumes } from '@nestjs/swagger';
import { VoiceService } from './voice.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { StandardResponse } from '../common/dto/standard-response.dto';
import { AssistantSuggestion } from '../assist/dto/action.dto';
import { VoiceParseRequestDto } from './dto/voice-parse.dto';
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

@ApiTags('voice')
@ApiExtraModels(ApiSuccessResponseDto, ApiErrorResponseDto)
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('parse')
  @ApiOperation({
    summary: '解析语音文本',
    description:
      '将语音转文字的 transcript 解析为结构化的动作建议。\n\n' +
      '**支持的动作类型**：\n' +
      '- `QUERY_NEXT_STOP`：查询下一站\n' +
      '- `MOVE_POI_TO_MORNING`：移动 POI 到上午\n\n' +
      '**返回格式**：\n' +
      '- 如果信息充足：返回可执行的 action\n' +
      '- 如果信息不足：返回 clarification（需要用户选择）',
  })
  @ApiBody({ type: VoiceParseRequestDto })
  @ApiResponse({
    status: 200,
    description: '返回动作建议列表（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'voice:abc12345' },
                  title: { type: 'string', example: '下一站是：东京塔（09:00）' },
                  description: { type: 'string', example: '预计 09:00 到达 东京塔' },
                  confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], example: 'HIGH' },
                  action: { type: 'object' },
                  clarification: { type: 'object' },
                },
              },
            },
          },
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async parse(
    @Body() body: { transcript: string; schedule: DayScheduleResult }
  ): Promise<StandardResponse<{ suggestions: AssistantSuggestion[] }>> {
    return this.voiceService.parseTranscript(body.transcript, body.schedule);
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    })
  )
  @ApiOperation({
    summary: '转写音频文件为文字（ASR）',
    description:
      '将音频文件转换为文字 transcript。\n\n' +
      '**支持的功能**：\n' +
      '- 多种音频格式（MP3, WAV, OGG 等）\n' +
      '- 多语言识别（中文、英文、日文等）\n' +
      '- 词级时间戳（可选）\n\n' +
      '**后端可插拔 provider**：\n' +
      '- OpenAI Whisper\n' +
      '- Google Speech-to-Text\n' +
      '- Azure Speech\n' +
      '- Mock（开发和测试）',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: '音频文件（支持 MP3, WAV, OGG 等，最大 10MB）',
        },
        language: {
          type: 'string',
          description: '语言代码（可选），如 zh-CN, en-US, ja-JP',
          example: 'zh-CN',
        },
        format: {
          type: 'string',
          description: '音频格式（可选），如 audio/mpeg, audio/wav',
          example: 'audio/mpeg',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回转写结果（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            transcript: { type: 'string', example: '下一站是哪里？' },
            words: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  word: { type: 'string' },
                  start: { type: 'number', description: '开始时间（秒）' },
                  end: { type: 'number', description: '结束时间（秒）' },
                },
              },
            },
            language: { type: 'string', example: 'zh-CN' },
            confidence: { type: 'number', example: 0.95 },
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
  async transcribe(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { language?: string; format?: string }
  ): Promise<StandardResponse<{
    transcript: string;
    words?: Array<{ word: string; start: number; end: number }>;
    language?: string;
    confidence?: number;
  }>> {
    if (!file) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请上传音频文件',
        },
      };
    }

    return this.voiceService.transcribe(file.buffer, {
      language: body.language,
      format: body.format,
    });
  }

  @Post('speak')
  @ApiOperation({
    summary: '将文字转换为语音（TTS）',
    description:
      '将文字转换为语音音频。\n\n' +
      '**支持的功能**：\n' +
      '- 多语言合成（中文、英文、日文等）\n' +
      '- 多种声音选择\n' +
      '- 多种音频格式（MP3, WAV, OGG）\n\n' +
      '**后端可插拔 provider**：\n' +
      '- OpenAI TTS\n' +
      '- Google Text-to-Speech\n' +
      '- Azure Speech\n' +
      '- Mock（开发和测试）\n\n' +
      '**使用场景**：\n' +
      '- 驾驶/走路场景价值巨大\n' +
      '- 语音助手回复',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: '要转换的文字',
          example: '下一站是东京塔，预计 09:00 到达',
        },
        locale: {
          type: 'string',
          description: '语言代码（可选），如 zh-CN, en-US, ja-JP',
          example: 'zh-CN',
        },
        voice: {
          type: 'string',
          description: '声音名称（可选），如 alloy, echo, fable',
          example: 'alloy',
        },
        format: {
          type: 'string',
          enum: ['mp3', 'wav', 'ogg'],
          description: '音频格式（可选）',
          example: 'mp3',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回音频数据或 URL（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            audioBuffer: {
              type: 'string',
              format: 'binary',
              description: '音频 Buffer（Base64 编码）',
            },
            audioUrl: {
              type: 'string',
              description: '音频 URL（如果返回 URL）',
            },
            format: { type: 'string', enum: ['mp3', 'wav', 'ogg'] },
            duration: { type: 'number', description: '音频时长（秒）' },
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
  async speak(
    @Body() body: {
      text: string;
      locale?: string;
      voice?: string;
      format?: 'mp3' | 'wav' | 'ogg';
    }
  ): Promise<StandardResponse<{
    audioBuffer?: Buffer;
    audioUrl?: string;
    format: 'mp3' | 'wav' | 'ogg';
    duration?: number;
  }>> {
    return this.voiceService.speak(body.text, {
      locale: body.locale,
      voice: body.voice,
      format: body.format,
    });
  }
}
