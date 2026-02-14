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
exports.UpdateIntentResponseDto = exports.IntentResponseDto = exports.BudgetConfigDto = exports.UpdateIntentRequestDto = exports.ConstraintsDto = exports.PacingConfigDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class PacingConfigDto {
}
exports.PacingConfigDto = PacingConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每日最大活动数' }),
    __metadata("design:type", Number)
], PacingConfigDto.prototype, "maxDailyActivities", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '休息间隔（小时）' }),
    __metadata("design:type", Number)
], PacingConfigDto.prototype, "restIntervalHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '节奏等级', enum: ['relaxed', 'standard', 'tight'] }),
    __metadata("design:type", String)
], PacingConfigDto.prototype, "level", void 0);
class ConstraintsDto {
}
exports.ConstraintsDto = ConstraintsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每日步行限制（公里）' }),
    __metadata("design:type", Number)
], ConstraintsDto.prototype, "dailyWalkLimit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '早起者' }),
    __metadata("design:type", Boolean)
], ConstraintsDto.prototype, "earlyRiser", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '夜猫子' }),
    __metadata("design:type", Boolean)
], ConstraintsDto.prototype, "nightOwl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '必去地点 ID 数组', type: [Number] }),
    __metadata("design:type", Array)
], ConstraintsDto.prototype, "mustPlaces", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '避免地点 ID 数组', type: [Number] }),
    __metadata("design:type", Array)
], ConstraintsDto.prototype, "avoidPlaces", void 0);
class UpdateIntentRequestDto {
}
exports.UpdateIntentRequestDto = UpdateIntentRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '节奏配置', type: PacingConfigDto }),
    __metadata("design:type", PacingConfigDto)
], UpdateIntentRequestDto.prototype, "pacingConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '偏好设置', type: [String] }),
    __metadata("design:type", Array)
], UpdateIntentRequestDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '约束条件', type: ConstraintsDto }),
    __metadata("design:type", ConstraintsDto)
], UpdateIntentRequestDto.prototype, "constraints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '规划策略', enum: ['safe', 'experience', 'challenge'] }),
    __metadata("design:type", String)
], UpdateIntentRequestDto.prototype, "planningPolicy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总预算' }),
    __metadata("design:type", Number)
], UpdateIntentRequestDto.prototype, "totalBudget", void 0);
class BudgetConfigDto {
}
exports.BudgetConfigDto = BudgetConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总预算' }),
    __metadata("design:type", Number)
], BudgetConfigDto.prototype, "totalBudget", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '货币', default: 'CNY' }),
    __metadata("design:type", String)
], BudgetConfigDto.prototype, "currency", void 0);
class IntentResponseDto {
}
exports.IntentResponseDto = IntentResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程 ID' }),
    __metadata("design:type", String)
], IntentResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '节奏配置', type: PacingConfigDto }),
    __metadata("design:type", PacingConfigDto)
], IntentResponseDto.prototype, "pacingConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预算配置', type: BudgetConfigDto }),
    __metadata("design:type", BudgetConfigDto)
], IntentResponseDto.prototype, "budgetConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据' }),
    __metadata("design:type", Object)
], IntentResponseDto.prototype, "metadata", void 0);
class UpdateIntentResponseDto {
}
exports.UpdateIntentResponseDto = UpdateIntentResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], UpdateIntentResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程信息', type: IntentResponseDto }),
    __metadata("design:type", IntentResponseDto)
], UpdateIntentResponseDto.prototype, "trip", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据' }),
    __metadata("design:type", Object)
], UpdateIntentResponseDto.prototype, "metadata", void 0);
//# sourceMappingURL=trip-intent.dto.js.map