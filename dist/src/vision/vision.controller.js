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
exports.VisionController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const vision_service_1 = require("./vision.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
let VisionController = class VisionController {
    constructor(visionService) {
        this.visionService = visionService;
    }
    async poiRecommend(file, body) {
        if (!file) {
            throw new common_1.BadRequestException('请上传图片文件');
        }
        const lat = parseFloat(body.lat);
        const lng = parseFloat(body.lng);
        if (isNaN(lat) || isNaN(lng)) {
            throw new common_1.BadRequestException('lat 和 lng 必须是有效的数字');
        }
        return this.visionService.poiRecommend(file.buffer, {
            lat,
            lng,
            locale: body.locale,
        });
    }
    async getCapabilities() {
        return (0, standard_response_dto_1.successResponse)({
            supportedFormats: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
            maxFileSize: 6 * 1024 * 1024,
            maxFileSizeMB: 6,
            supportsHeic: true,
            requiresCompression: false,
            compressionRecommendation: '建议上传前压缩到 2MB 以下以获得更好的性能',
            supportsExifRotation: true,
        });
    }
};
exports.VisionController = VisionController;
__decorate([
    (0, common_1.Post)('poi-recommend'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        limits: { fileSize: 6 * 1024 * 1024 },
    })),
    (0, swagger_1.ApiOperation)({
        summary: '拍照识别 POI 推荐',
        description: '上传图片（招牌/菜单），通过 OCR 提取文字，然后搜索附近的 POI 并返回候选列表和"加入行程"建议。\n\n' +
            '**流程**：\n' +
            '1. OCR 提取文字（招牌店名/地址/菜单关键词）\n' +
            '2. POI Resolver：用文字 + 用户定位搜索 POI\n' +
            '3. 返回候选 POI 列表（带距离/评分/营业状态）\n' +
            '4. 每个候选提供"加入行程"建议（action: ADD_POI_TO_SCHEDULE）',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], VisionController.prototype, "poiRecommend", null);
__decorate([
    (0, common_1.Get)('capabilities'),
    (0, swagger_1.ApiOperation)({
        summary: '查询 Vision 服务能力',
        description: '返回 Vision 服务支持的能力，包括支持的文件格式、最大尺寸、是否支持 HEIC 等。\n\n' +
            '用于前端在上传前验证文件是否符合要求。',
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VisionController.prototype, "getCapabilities", null);
exports.VisionController = VisionController = __decorate([
    (0, swagger_1.ApiTags)('vision'),
    (0, swagger_1.ApiExtraModels)(api_response_dto_1.ApiSuccessResponseDto, api_response_dto_1.ApiErrorResponseDto),
    (0, common_1.Controller)('vision'),
    __metadata("design:paramtypes", [vision_service_1.VisionService])
], VisionController);
//# sourceMappingURL=vision.controller.js.map