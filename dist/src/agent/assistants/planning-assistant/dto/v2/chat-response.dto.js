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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatResponseDto = exports.RoutingInfoDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const suggested_action_dto_1 = require("./shared/suggested-action.dto");
const destination_recommendation_dto_1 = require("./shared/destination-recommendation.dto");
const plan_candidate_dto_1 = require("./shared/plan-candidate.dto");
const hotel_dto_1 = require("./shared/hotel.dto");
class RoutingInfoDto {
}
exports.RoutingInfoDto = RoutingInfoDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '目标接口',
        enum: [
            'recommendations', 'generate', 'compare',
            'hotel', 'airbnb', 'accommodation',
            'restaurant', 'flight', 'rail', 'carRental',
            'weather', 'search', 'translate', 'currency', 'image',
            'chat'
        ]
    }),
    __metadata("design:type", String)
], RoutingInfoDto.prototype, "target", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路由原因' }),
    __metadata("design:type", String)
], RoutingInfoDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '提取的参数' }),
    __metadata("design:type", Object)
], RoutingInfoDto.prototype, "params", void 0);
class ChatResponseDto {
}
exports.ChatResponseDto = ChatResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '回复消息（英文）' }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '回复消息（中文）' }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "messageCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '主要回复消息（根据语言参数自动选择）' }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "reply", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '主要回复消息（中文）' }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "replyCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '当前阶段',
        enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED', 'ADJUSTING']
    }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '智能路由信息（如果路由到业务接口）' }),
    __metadata("design:type", RoutingInfoDto)
], ChatResponseDto.prototype, "routing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '建议操作', type: [suggested_action_dto_1.SuggestedActionDto] }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "suggestedActions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    __metadata("design:type", String)
], ChatResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目的地推荐列表（当路由到推荐接口时包含）',
        type: [destination_recommendation_dto_1.DestinationRecommendationDto]
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "recommendations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '方案候选列表（当路由到方案生成接口时包含）',
        type: [plan_candidate_dto_1.PlanCandidateDto]
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "plans", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '酒店列表（当路由到酒店搜索接口时包含）',
        type: [hotel_dto_1.HotelDto]
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "hotels", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Airbnb 房源列表（当路由到 Airbnb 搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "airbnbListings", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '餐厅列表（当路由到餐厅搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "restaurants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '天气信息（当路由到天气查询接口时包含）'
    }),
    __metadata("design:type", Object)
], ChatResponseDto.prototype, "weather", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '搜索结果（当路由到 Web 搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "searchResults", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '航班列表（当路由到航班搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "flights", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '铁路路线列表（当路由到铁路查询接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "railRoutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '租车列表（当路由到租车搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "carRentals", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '翻译结果（当路由到翻译接口时包含）'
    }),
    __metadata("design:type", Object)
], ChatResponseDto.prototype, "translation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '货币转换结果（当路由到货币转换接口时包含）'
    }),
    __metadata("design:type", Object)
], ChatResponseDto.prototype, "currencyConversion", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '图片列表（当路由到图片搜索接口时包含）'
    }),
    __metadata("design:type", Array)
], ChatResponseDto.prototype, "images", void 0);
//# sourceMappingURL=chat-response.dto.js.map