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
exports.TripsFromTemplateController = exports.TripTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trip_templates_service_1 = require("./trip-templates.service");
const trip_template_dto_1 = require("./dto/trip-template.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let TripTemplatesController = class TripTemplatesController {
    constructor(tripTemplatesService) {
        this.tripTemplatesService = tripTemplatesService;
    }
    async findAll(query) {
        try {
            const templates = await this.tripTemplatesService.findAll(query);
            return (0, standard_response_dto_1.successResponse)(templates);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findOne(id) {
        try {
            const template = await this.tripTemplatesService.findOne(id);
            return (0, standard_response_dto_1.successResponse)(template);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.TripTemplatesController = TripTemplatesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程模板列表',
        description: '获取不同主题的行程模板（如亲子游、特种兵旅游、休闲度假）。支持按主题、目的地筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'theme', required: false, enum: ['FAMILY', 'BACKPACKER', 'LEISURE', 'BUSINESS', 'HONEYMOON', 'ADVENTURE'] }),
    (0, swagger_1.ApiQuery)({ name: 'destination', required: false, example: 'JP' }),
    (0, swagger_1.ApiQuery)({ name: 'isPublic', required: false, type: Boolean, default: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回模板列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [trip_template_dto_1.GetTripTemplatesQueryDto]),
    __metadata("design:returntype", Promise)
], TripTemplatesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程模板详情',
        description: '根据模板ID获取模板的完整信息，包括配置详情。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '模板ID (UUID)', example: 'uuid' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回模板详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '模板不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripTemplatesController.prototype, "findOne", null);
exports.TripTemplatesController = TripTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('trip-templates'),
    (0, common_1.Controller)('trip-templates'),
    __metadata("design:paramtypes", [trip_templates_service_1.TripTemplatesService])
], TripTemplatesController);
let TripsFromTemplateController = class TripsFromTemplateController {
    constructor(tripTemplatesService) {
        this.tripTemplatesService = tripTemplatesService;
    }
    async createFromTemplate(dto, user) {
        try {
            const userId = user === null || user === void 0 ? void 0 : user.userId;
            if (!userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
            }
            const trip = await this.tripTemplatesService.createTripFromTemplate(dto, userId);
            return (0, standard_response_dto_1.successResponse)(trip);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
        }
    }
};
exports.TripsFromTemplateController = TripsFromTemplateController;
__decorate([
    (0, common_1.Post)('from-template'),
    (0, swagger_1.ApiOperation)({
        summary: '基于模板快速创建行程',
        description: '根据模板ID和用户提供的参数（目的地、日期、预算等）快速创建行程。模板的配置会自动应用到新行程中。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功创建行程（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [trip_template_dto_1.CreateTripFromTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], TripsFromTemplateController.prototype, "createFromTemplate", null);
exports.TripsFromTemplateController = TripsFromTemplateController = __decorate([
    (0, swagger_1.ApiTags)('trips'),
    (0, common_1.Controller)('trips'),
    __metadata("design:paramtypes", [trip_templates_service_1.TripTemplatesService])
], TripsFromTemplateController);
//# sourceMappingURL=trip-templates.controller.js.map