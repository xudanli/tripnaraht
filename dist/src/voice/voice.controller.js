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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const voice_service_1 = require("./voice.service");
const voice_parse_dto_1 = require("./dto/voice-parse.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
let VoiceController = class VoiceController {
    constructor(voiceService) {
        this.voiceService = voiceService;
    }
    async parse(body) {
        return this.voiceService.parseTranscript(body.transcript, body.schedule);
    }
    async transcribe(file, body) {
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
    async speak(body) {
        return this.voiceService.speak(body.text, {
            locale: body.locale,
            voice: body.voice,
            format: body.format,
        });
    }
};
exports.VoiceController = VoiceController;
__decorate([
    (0, common_1.Post)('parse'),
    (0, swagger_1.ApiOperation)({
        summary: '解析语音文本',
        description: '将语音转文字的 transcript 解析为结构化的动作建议。\n\n' +
            '**支持的动作类型**：\n' +
            '- `QUERY_NEXT_STOP`：查询下一站\n' +
            '- `MOVE_POI_TO_MORNING`：移动 POI 到上午\n\n' +
            '**返回格式**：\n' +
            '- 如果信息充足：返回可执行的 action\n' +
            '- 如果信息不足：返回 clarification（需要用户选择）',
    }),
    (0, swagger_1.ApiBody)({ type: voice_parse_dto_1.VoiceParseRequestDto }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "parse", null);
__decorate([
    (0, common_1.Post)('transcribe'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    (0, swagger_1.ApiOperation)({
        summary: '转写音频文件为文字（ASR）',
        description: '将音频文件转换为文字 transcript。\n\n' +
            '**支持的功能**：\n' +
            '- 多种音频格式（MP3, WAV, OGG 等）\n' +
            '- 多语言识别（中文、英文、日文等）\n' +
            '- 词级时间戳（可选）\n\n' +
            '**后端可插拔 provider**：\n' +
            '- OpenAI Whisper\n' +
            '- Google Speech-to-Text\n' +
            '- Azure Speech\n' +
            '- Mock（开发和测试）',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "transcribe", null);
__decorate([
    (0, common_1.Post)('speak'),
    (0, swagger_1.ApiOperation)({
        summary: '将文字转换为语音（TTS）',
        description: '将文字转换为语音音频。\n\n' +
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
    }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "speak", null);
exports.VoiceController = VoiceController = __decorate([
    (0, swagger_1.ApiTags)('voice'),
    (0, swagger_1.ApiExtraModels)(api_response_dto_1.ApiSuccessResponseDto, api_response_dto_1.ApiErrorResponseDto),
    (0, common_1.Controller)('voice'),
    __metadata("design:paramtypes", [voice_service_1.VoiceService])
], VoiceController);
//# sourceMappingURL=voice.controller.js.map