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
exports.UpdateReservationTaskDto = exports.UpdateTripRailPassProfileDto = exports.ValidateComplianceDto = exports.SimulateTravelDaysDto = exports.PlanReservationsDto = exports.CheckReservationDto = exports.RecommendPassDto = exports.CheckEligibilityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CheckEligibilityDto {
}
exports.CheckEligibilityDto = CheckEligibilityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户居住国（ISO 3166-1 alpha-2）' }),
    __metadata("design:type", String)
], CheckEligibilityDto.prototype, "residencyCountry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行国家集合', type: [String] }),
    __metadata("design:type", Array)
], CheckEligibilityDto.prototype, "travelCountries", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否跨居住国' }),
    __metadata("design:type", Boolean)
], CheckEligibilityDto.prototype, "isCrossResidencyCountry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '出行日期' }),
    __metadata("design:type", String)
], CheckEligibilityDto.prototype, "departureDate", void 0);
class RecommendPassDto {
}
exports.RecommendPassDto = RecommendPassDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户居住国' }),
    __metadata("design:type", String)
], RecommendPassDto.prototype, "residencyCountry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行国家集合', type: [String] }),
    __metadata("design:type", Array)
], RecommendPassDto.prototype, "travelCountries", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预期 rail 段数' }),
    __metadata("design:type", Number)
], RecommendPassDto.prototype, "estimatedRailSegments", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '跨国数量' }),
    __metadata("design:type", Number)
], RecommendPassDto.prototype, "crossCountryCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否每天都坐火车' }),
    __metadata("design:type", Boolean)
], RecommendPassDto.prototype, "isDailyTravel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['city_hopping', 'stay_extended'], description: '停留模式' }),
    __metadata("design:type", String)
], RecommendPassDto.prototype, "stayMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['LOW', 'MEDIUM', 'HIGH'], description: '预算敏感度' }),
    __metadata("design:type", String)
], RecommendPassDto.prototype, "budgetSensitivity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行天数' }),
    __metadata("design:type", Number)
], RecommendPassDto.prototype, "tripDurationDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行日期范围' }),
    __metadata("design:type", Object)
], RecommendPassDto.prototype, "tripDateRange", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['EURAIL', 'INTERRAIL'], description: 'Pass Family' }),
    __metadata("design:type", String)
], RecommendPassDto.prototype, "passFamily", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户偏好' }),
    __metadata("design:type", Object)
], RecommendPassDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '样本 segments（用于模拟）', type: [Object] }),
    __metadata("design:type", Array)
], RecommendPassDto.prototype, "sampleSegments", void 0);
class CheckReservationDto {
}
exports.CheckReservationDto = CheckReservationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Segment', type: Object }),
    __metadata("design:type", Object)
], CheckReservationDto.prototype, "segment", void 0);
class PlanReservationsDto {
}
exports.PlanReservationsDto = PlanReservationsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Segments', type: [Object] }),
    __metadata("design:type", Array)
], PlanReservationsDto.prototype, "segments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户偏好' }),
    __metadata("design:type", Object)
], PlanReservationsDto.prototype, "userPreferences", void 0);
class SimulateTravelDaysDto {
}
exports.SimulateTravelDaysDto = SimulateTravelDaysDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Segments', type: [Object] }),
    __metadata("design:type", Array)
], SimulateTravelDaysDto.prototype, "segments", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pass Profile', type: Object }),
    __metadata("design:type", Object)
], SimulateTravelDaysDto.prototype, "passProfile", void 0);
class ValidateComplianceDto {
}
exports.ValidateComplianceDto = ValidateComplianceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pass Profile', type: Object }),
    __metadata("design:type", Object)
], ValidateComplianceDto.prototype, "passProfile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Segments', type: [Object] }),
    __metadata("design:type", Array)
], ValidateComplianceDto.prototype, "segments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reservation Tasks', type: [Object] }),
    __metadata("design:type", Array)
], ValidateComplianceDto.prototype, "reservationTasks", void 0);
class UpdateTripRailPassProfileDto {
}
exports.UpdateTripRailPassProfileDto = UpdateTripRailPassProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trip ID' }),
    __metadata("design:type", String)
], UpdateTripRailPassProfileDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Pass Profile', type: Object }),
    __metadata("design:type", Object)
], UpdateTripRailPassProfileDto.prototype, "railPassProfile", void 0);
class UpdateReservationTaskDto {
}
exports.UpdateReservationTaskDto = UpdateReservationTaskDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Task ID' }),
    __metadata("design:type", String)
], UpdateReservationTaskDto.prototype, "taskId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['NEEDED', 'PLANNED', 'BOOKED', 'FAILED', 'FALLBACK_APPLIED'], description: '状态' }),
    __metadata("design:type", String)
], UpdateReservationTaskDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '订座引用号' }),
    __metadata("design:type", String)
], UpdateReservationTaskDto.prototype, "bookingRef", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '实际费用（EUR）' }),
    __metadata("design:type", Number)
], UpdateReservationTaskDto.prototype, "cost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '失败原因' }),
    __metadata("design:type", String)
], UpdateReservationTaskDto.prototype, "failReason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备用方案 ID' }),
    __metadata("design:type", String)
], UpdateReservationTaskDto.prototype, "fallbackPlanId", void 0);
//# sourceMappingURL=railpass.dto.js.map