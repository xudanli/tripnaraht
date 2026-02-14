"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var VoiceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
const common_1 = require("@nestjs/common");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const suggestion_id_util_1 = require("../common/utils/suggestion-id.util");
const llm_voice_parser_service_1 = require("./services/llm-voice-parser.service");
const mock_asr_provider_1 = require("../providers/asr/mock-asr.provider");
const mock_tts_provider_1 = require("../providers/tts/mock-tts.provider");
let VoiceService = VoiceService_1 = class VoiceService {
    constructor(llmParser, asrProvider, ttsProvider) {
        this.llmParser = llmParser;
        this.asrProvider = asrProvider;
        this.ttsProvider = ttsProvider;
        this.logger = new common_1.Logger(VoiceService_1.name);
        if (!this.asrProvider) {
            this.asrProvider = new mock_asr_provider_1.MockAsrProvider();
        }
        if (!this.ttsProvider) {
            this.ttsProvider = new mock_tts_provider_1.MockTtsProvider();
        }
    }
    async parseTranscript(transcript, schedule) {
        try {
            const text = transcript.trim().toLowerCase();
            let suggestions = [];
            if (this.llmParser) {
                const llmSuggestions = await this.llmParser.parseWithLlm(transcript, schedule);
                if (llmSuggestions && llmSuggestions.length > 0) {
                    this.logger.log(`LLM parser returned ${llmSuggestions.length} suggestions`);
                    return (0, standard_response_dto_1.successResponse)({ suggestions: llmSuggestions });
                }
            }
            if (!text) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'transcript is required', { field: 'transcript' });
            }
            if (this.isQueryNextStop(text)) {
                const nextStop = this.findNextStop(schedule);
                suggestions.push({
                    id: (0, suggestion_id_util_1.generateVoiceSuggestionId)('QUERY_NEXT_STOP', undefined, text),
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
            if (this.isMoveToMorning(text)) {
                const poiMatch = this.extractPoiName(text, schedule);
                if (poiMatch.poiId) {
                    suggestions.push({
                        id: (0, suggestion_id_util_1.generateVoiceSuggestionId)('MOVE_POI_TO_MORNING', poiMatch.poiId, text),
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
                }
                else {
                    const availablePois = this.getAvailablePois(schedule);
                    if (availablePois.length === 0) {
                        return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '当前行程中没有可移动的 POI', { field: 'schedule.stops' });
                    }
                    suggestions.push({
                        id: (0, suggestion_id_util_1.generateClarificationSuggestionId)('MOVE_POI_TO_MORNING'),
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
            return (0, standard_response_dto_1.successResponse)({
                suggestions,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '解析语音文本时发生错误', { originalError: error.name });
        }
    }
    isQueryNextStop(text) {
        const patterns = [
            /下一站|接下来|下一个|下个地方|下一个景点|下一站是什么|接下来去哪|下一个去哪/,
        ];
        return patterns.some((pattern) => pattern.test(text));
    }
    isMoveToMorning(text) {
        const patterns = [
            /挪到上午|放到上午|改到上午|移到上午|移动到上午|放到早上|改到早上/,
        ];
        return patterns.some((pattern) => pattern.test(text));
    }
    extractPoiName(text, schedule) {
        var _a;
        const pois = schedule.stops.filter((s) => s.kind === 'POI');
        for (const poi of pois) {
            const name = ((_a = poi.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
            if (name && text.includes(name)) {
                return {
                    poiId: poi.id,
                    poiName: poi.name,
                };
            }
        }
        return {};
    }
    getAvailablePois(schedule) {
        return schedule.stops
            .filter((s) => s.kind === 'POI')
            .map((s) => ({
            id: s.id,
            name: s.name || '未命名',
        }));
    }
    findNextStop(schedule) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        return schedule.stops.find((s) => s.kind === 'POI' && s.startMin >= nowMin);
    }
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    async transcribe(audioBuffer, options) {
        try {
            if (!audioBuffer || audioBuffer.length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '音频文件不能为空', { field: 'audioBuffer' });
            }
            const result = await this.asrProvider.transcribe(audioBuffer, options);
            return (0, standard_response_dto_1.successResponse)({
                transcript: result.transcript,
                words: result.words,
                language: result.language,
                confidence: result.confidence,
            });
        }
        catch (error) {
            this.logger.error(`转写音频失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.PROVIDER_ERROR, error.message || '转写音频时发生错误', { provider: 'ASR' });
        }
    }
    async speak(text, options) {
        try {
            if (!text || text.trim().length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '文字内容不能为空', { field: 'text' });
            }
            const result = await this.ttsProvider.speak(text, options);
            return (0, standard_response_dto_1.successResponse)({
                audioBuffer: result.audioBuffer,
                audioUrl: result.audioUrl,
                format: result.format,
                duration: result.duration,
            });
        }
        catch (error) {
            this.logger.error(`文字转语音失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.PROVIDER_ERROR, error.message || '文字转语音时发生错误', { provider: 'TTS' });
        }
    }
};
exports.VoiceService = VoiceService;
exports.VoiceService = VoiceService = VoiceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_voice_parser_service_1.LlmVoiceParserService, Object, Object])
], VoiceService);
//# sourceMappingURL=voice.service.js.map