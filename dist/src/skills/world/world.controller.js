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
exports.WorldController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const world_build_context_skill_1 = require("./world-build-context.skill");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
let WorldController = class WorldController {
    constructor(worldBuildContextSkill) {
        this.worldBuildContextSkill = worldBuildContextSkill;
    }
    async buildContext(input) {
        try {
            const result = await this.worldBuildContextSkill.execute(input);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(error.status === 404 ? standard_response_dto_1.ErrorCode.NOT_FOUND : standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '构建世界模型失败');
        }
    }
};
exports.WorldController = WorldController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('buildContext'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '构建世界模型上下文',
        description: `
根据 tripId 或原始参数构建完整的世界模型上下文（WorldModelContext）。

**功能**：
- PhysicalRealityModel（物理现实模型）：DEM证据、道路状态、危险区域、渡轮状态、气候季节性
- HumanCapabilityModel（人体能力模型）：体能、节奏、风险承受度
- RouteDirection（路线方向）：路线哲学、季节性、约束

**输入**：
- tripId（推荐）：从 Trip 中提取所有信息
- 或原始参数：countryCode, season, duration, partyProfile

**返回**：
- world: 完整的世界模型上下文
- missingPieces: 缺失的数据片段
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({
        description: '世界模型构建请求',
        schema: {
            type: 'object',
            properties: {
                tripId: {
                    type: 'string',
                    description: '行程 ID（推荐）',
                    example: '9a4dbd2e-e76a-4fd3-bab0-09332fb2581b',
                },
                countryCode: {
                    type: 'string',
                    description: '国家代码（ISO 3166-1 alpha-2）',
                    example: 'IS',
                },
                season: {
                    type: 'number',
                    description: '季节（月份 1-12）',
                    example: 7,
                },
                duration: {
                    type: 'number',
                    description: '行程天数',
                    example: 8,
                },
                partyProfile: {
                    type: 'object',
                    description: '团队画像',
                    properties: {
                        mobilityProfile: { type: 'string' },
                        riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
                        fitness: { type: 'string', enum: ['low', 'medium', 'high'] },
                        pace: { type: 'string', enum: ['relaxed', 'moderate', 'intense'] },
                    },
                },
                routeDirectionId: {
                    type: 'string',
                    description: '路线方向 ID（可选）',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回世界模型上下文',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Trip 不存在',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorldController.prototype, "buildContext", null);
exports.WorldController = WorldController = __decorate([
    (0, swagger_1.ApiTags)('world'),
    (0, common_1.Controller)('world'),
    __metadata("design:paramtypes", [world_build_context_skill_1.WorldBuildContextSkill])
], WorldController);
//# sourceMappingURL=world.controller.js.map