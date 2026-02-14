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
var CitiesController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CitiesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const cities_service_1 = require("./cities.service");
const city_dto_1 = require("./dto/city.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let CitiesController = CitiesController_1 = class CitiesController {
    constructor(citiesService) {
        this.citiesService = citiesService;
        this.logger = new common_1.Logger(CitiesController_1.name);
    }
    async findAll(query) {
        try {
            this.logger.debug(`[CitiesController] 收到城市查询请求: ${JSON.stringify(query)}`);
            const result = await this.citiesService.findAll(query);
            this.logger.debug(`[CitiesController] ✅ 返回城市列表: ${result.cities.length} 个城市 (total=${result.total}, hasMore=${result.hasMore})`);
            return (0, standard_response_dto_1.successResponse)({
                cities: result.cities,
                total: result.total,
                hasMore: result.hasMore,
                limit: result.limit,
                offset: result.offset,
                ...(query.countryCode && {
                    countryCode: query.countryCode.toUpperCase(),
                }),
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get cities: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async findOne(id) {
        try {
            const city = await this.citiesService.findOne(id);
            return (0, standard_response_dto_1.successResponse)(city);
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to get city ${id}: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
};
exports.CitiesController = CitiesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取城市列表',
        description: '支持按国家代码过滤和关键词搜索。可以同时使用 countryCode 和 q 参数进行组合查询。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'countryCode',
        required: false,
        description: '国家代码（ISO 3166-1 alpha-2），例如：JP',
        example: 'JP',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'q',
        required: false,
        description: '搜索关键词（支持中文名、英文名、名称），例如：东京',
        example: '东京',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        description: '返回数量限制',
        example: 50,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'offset',
        required: false,
        description: '偏移量（用于分页）',
        example: 0,
        type: Number,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回城市列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [city_dto_1.GetCitiesQueryDto]),
    __metadata("design:returntype", Promise)
], CitiesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取城市详情',
        description: '根据城市 ID 获取完整的城市信息，包括坐标、时区等',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: '城市 ID',
        example: 1,
        type: Number,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回城市详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '城市不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CitiesController.prototype, "findOne", null);
exports.CitiesController = CitiesController = CitiesController_1 = __decorate([
    (0, swagger_1.ApiTags)('cities'),
    (0, common_1.Controller)('cities'),
    __metadata("design:paramtypes", [cities_service_1.CitiesService])
], CitiesController);
//# sourceMappingURL=cities.controller.js.map