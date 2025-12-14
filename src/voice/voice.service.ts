// src/voice/voice.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { AssistantSuggestion, AssistantAction } from '../assist/dto/action.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { StandardResponse } from '../common/dto/standard-response.dto';
import {
  generateVoiceSuggestionId,
  generateClarificationSuggestionId,
} from '../common/utils/suggestion-id.util';
import { LlmVoiceParserService } from './services/llm-voice-parser.service';
import { AsrProvider } from '../providers/asr/asr.provider.interface';
import { TtsProvider } from '../providers/tts/tts.provider.interface';
import { MockAsrProvider } from '../providers/asr/mock-asr.provider';
import { MockTtsProvider } from '../providers/tts/mock-tts.provider';

/**
 * 语音解析服务
 * 
 * 将语音转文字的 transcript 解析为结构化的动作建议
 * 支持规则匹配（默认）和 LLM 解析（可选）
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  constructor(
    @Optional() private readonly llmParser?: LlmVoiceParserService,
    @Optional() private readonly asrProvider?: AsrProvider,
    @Optional() private readonly ttsProvider?: TtsProvider
  ) {
    // 如果没有注入 provider，使用 Mock Provider
    if (!this.asrProvider) {
      this.asrProvider = new MockAsrProvider();
    }
    if (!this.ttsProvider) {
      this.ttsProvider = new MockTtsProvider();
    }
  }

  /**
   * 解析语音文本，返回动作建议
   * 
   * @param transcript 语音转文字的结果
   * @param schedule 当前行程计划
   * @returns 统一格式的响应
   */
  async parseTranscript(
    transcript: string,
    schedule: DayScheduleResult
  ): Promise<StandardResponse<{ suggestions: AssistantSuggestion[] }>> {
    try {
      const text = transcript.trim().toLowerCase();
      let suggestions: AssistantSuggestion[] = [];

      // 尝试使用 LLM 解析（如果启用）
      if (this.llmParser) {
        const llmSuggestions = await this.llmParser.parseWithLlm(transcript, schedule);
        if (llmSuggestions && llmSuggestions.length > 0) {
          this.logger.log(`LLM parser returned ${llmSuggestions.length} suggestions`);
          return successResponse({ suggestions: llmSuggestions });
        }
        // LLM 解析失败或未启用，回退到规则匹配
      }

      if (!text) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'transcript is required',
          { field: 'transcript' }
        );
      }

      // 规则 1: 查询下一站
      if (this.isQueryNextStop(text)) {
        const nextStop = this.findNextStop(schedule);
        
        suggestions.push({
          id: generateVoiceSuggestionId('QUERY_NEXT_STOP', undefined, text),
          title: nextStop
            ? `下一站是：${nextStop.name}（${this.formatTime(nextStop.startMin)}）`
            : '今天没有更多行程了',
          description: nextStop
            ? `预计 ${this.formatTime(nextStop.startMin)} 到达 ${nextStop.name}`
            : undefined,
          confidence: 'HIGH',
          action: { type: 'QUERY_NEXT_STOP' },
        });
      }

      // 规则 2: 移动 POI 到上午
      if (this.isMoveToMorning(text)) {
        const poiMatch = this.extractPoiName(text, schedule);
        
        if (poiMatch.poiId) {
          // 找到了明确的 POI
          suggestions.push({
            id: generateVoiceSuggestionId('MOVE_POI_TO_MORNING', poiMatch.poiId, text),
            title: `把「${poiMatch.poiName}」挪到上午`,
            description: `将 ${poiMatch.poiName} 调整到上午时间段`,
            confidence: 'HIGH',
            action: {
              type: 'MOVE_POI_TO_MORNING',
              poiId: poiMatch.poiId,
              poiName: poiMatch.poiName,
              preferredRange: 'AM',
            },
          });
        } else {
          // 需要澄清
          const availablePois = this.getAvailablePois(schedule);
          
          if (availablePois.length === 0) {
            return errorResponse(
              ErrorCode.BUSINESS_ERROR,
              '当前行程中没有可移动的 POI',
              { field: 'schedule.stops' }
            );
          }
          
          suggestions.push({
            id: generateClarificationSuggestionId('MOVE_POI_TO_MORNING'),
            title: '要把哪个景点挪到上午？',
            description: '请选择要移动的景点',
            confidence: 'MEDIUM',
            clarification: {
              question: '要把哪个景点挪到上午？',
              options: availablePois.map((poi) => ({
                label: poi.name,
                value: poi.id,
              })),
            },
          });
        }
      }

      // 如果没有匹配到任何规则，返回空数组（不算错误）
      return successResponse({
        suggestions,
      });
    } catch (error: any) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '解析语音文本时发生错误',
        { originalError: error.name }
      );
    }
  }

  /**
   * 判断是否为查询下一站的意图
   */
  private isQueryNextStop(text: string): boolean {
    const patterns = [
      /下一站|接下来|下一个|下个地方|下一个景点|下一站是什么|接下来去哪|下一个去哪/,
    ];
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 判断是否为移动到上午的意图
   */
  private isMoveToMorning(text: string): boolean {
    const patterns = [
      /挪到上午|放到上午|改到上午|移到上午|移动到上午|放到早上|改到早上/,
    ];
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 从文本中提取 POI 名称/ID
   */
  private extractPoiName(
    text: string,
    schedule: DayScheduleResult
  ): { poiId?: string; poiName?: string } {
    // 获取所有 POI
    const pois = schedule.stops.filter((s) => s.kind === 'POI');

    // 尝试匹配 POI 名称
    for (const poi of pois) {
      const name = poi.name?.toLowerCase() || '';
      if (name && text.includes(name)) {
        return {
          poiId: poi.id,
          poiName: poi.name,
        };
      }
    }

    // 尝试匹配常见的代词（"这个"、"那个" - 需要上下文，这里简化处理）
    // 在实际应用中，可能需要更复杂的上下文理解

    return {};
  }

  /**
   * 获取可用的 POI 列表（用于澄清）
   */
  private getAvailablePois(schedule: DayScheduleResult) {
    return schedule.stops
      .filter((s) => s.kind === 'POI')
      .map((s) => ({
        id: s.id,
        name: s.name || '未命名',
      }));
  }

  /**
   * 查找下一个行程点
   */
  private findNextStop(schedule: DayScheduleResult) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 找到第一个还未开始的 POI
    return schedule.stops.find(
      (s) => s.kind === 'POI' && s.startMin >= nowMin
    );
  }

  /**
   * 格式化时间（分钟数 → HH:mm）
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * 转写音频文件为文字
   * 
   * @param audioBuffer 音频文件 Buffer
   * @param options 选项（语言、格式等）
   * @returns 统一格式的响应
   */
  async transcribe(
    audioBuffer: Buffer,
    options?: {
      language?: string;
      format?: string;
    }
  ): Promise<StandardResponse<{
    transcript: string;
    words?: Array<{
      word: string;
      start: number;
      end: number;
    }>;
    language?: string;
    confidence?: number;
  }>> {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '音频文件不能为空',
          { field: 'audioBuffer' }
        );
      }

      const result = await this.asrProvider!.transcribe(audioBuffer, options);

      return successResponse({
        transcript: result.transcript,
        words: result.words,
        language: result.language,
        confidence: result.confidence,
      });
    } catch (error: any) {
      this.logger.error(`转写音频失败: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.PROVIDER_ERROR,
        error.message || '转写音频时发生错误',
        { provider: 'ASR' }
      );
    }
  }

  /**
   * 将文字转换为语音
   * 
   * @param text 要转换的文字
   * @param options 选项（语言、声音、格式等）
   * @returns 统一格式的响应
   */
  async speak(
    text: string,
    options?: {
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
    try {
      if (!text || text.trim().length === 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '文字内容不能为空',
          { field: 'text' }
        );
      }

      const result = await this.ttsProvider!.speak(text, options);

      return successResponse({
        audioBuffer: result.audioBuffer,
        audioUrl: result.audioUrl,
        format: result.format,
        duration: result.duration,
      });
    } catch (error: any) {
      this.logger.error(`文字转语音失败: ${error.message}`, error.stack);
      return errorResponse(
        ErrorCode.PROVIDER_ERROR,
        error.message || '文字转语音时发生错误',
        { provider: 'TTS' }
      );
    }
  }
}
