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
exports.RouteDirectionInteractionListDto = exports.RouteDirectionInteractionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const route_direction_card_dto_1 = require("./route-direction-card.dto");
class RouteDirectionInteractionDto {
}
exports.RouteDirectionInteractionDto = RouteDirectionInteractionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路线方向卡片',
        type: route_direction_card_dto_1.RouteDirectionCardDto
    }),
    __metadata("design:type", route_direction_card_dto_1.RouteDirectionCardDto)
], RouteDirectionInteractionDto.prototype, "direction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '匹配分数（0-100）',
        example: 85.5
    }),
    __metadata("design:type", Number)
], RouteDirectionInteractionDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '分数分解',
        type: Object
    }),
    __metadata("design:type", Object)
], RouteDirectionInteractionDto.prototype, "scoreBreakdown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '推荐解释（为什么推荐这条路线）',
        example: '这条路线完美匹配您的偏好：摄影、自然探索，且当前月份为最佳旅行时间。'
    }),
    __metadata("design:type", String)
], RouteDirectionInteractionDto.prototype, "explanation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '为什么没有选择其他路线',
        type: Object
    }),
    __metadata("design:type", Object)
], RouteDirectionInteractionDto.prototype, "whyNotOthers", void 0);
class RouteDirectionInteractionListDto {
}
exports.RouteDirectionInteractionListDto = RouteDirectionInteractionListDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路线方向列表',
        type: [RouteDirectionInteractionDto]
    }),
    __metadata("design:type", Array)
], RouteDirectionInteractionListDto.prototype, "directions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码',
        example: 'IS'
    }),
    __metadata("design:type", String)
], RouteDirectionInteractionListDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '当前月份',
        example: 7
    }),
    __metadata("design:type", Number)
], RouteDirectionInteractionListDto.prototype, "month", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户偏好',
        type: [String],
        example: ['photography', 'nature']
    }),
    __metadata("design:type", Array)
], RouteDirectionInteractionListDto.prototype, "preferences", void 0);
//# sourceMappingURL=route-direction-interaction.dto.js.map