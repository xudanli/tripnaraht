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
exports.TripMetricsResponseDto = exports.TripMetricsSummaryDto = exports.DayMetricsResponseDto = exports.TravelTimeByModeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class TravelTimeByModeDto {
}
exports.TravelTimeByModeDto = TravelTimeByModeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '步行时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "walking", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '自驾时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "driving", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '公共交通时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "transit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '火车/高铁时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "train", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '飞机时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "flight", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '轮渡时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "ferry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '骑行时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "bicycle", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '出租车时间（分钟）' }),
    __metadata("design:type", Number)
], TravelTimeByModeDto.prototype, "taxi", void 0);
class DayMetricsResponseDto {
}
exports.DayMetricsResponseDto = DayMetricsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（YYYY-MM-DD）', example: '2025-01-01' }),
    __metadata("design:type", String)
], DayMetricsResponseDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '指标数据' }),
    __metadata("design:type", Object)
], DayMetricsResponseDto.prototype, "metrics", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '冲突列表' }),
    __metadata("design:type", Array)
], DayMetricsResponseDto.prototype, "conflicts", void 0);
class TripMetricsSummaryDto {
}
exports.TripMetricsSummaryDto = TripMetricsSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总步行距离（公里）' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "totalWalk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总车程（分钟）' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "totalDrive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总缓冲时间（分钟）' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "totalBuffer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总疲劳指数' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "totalFatigue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总花费' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "totalCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平均每日步行距离（公里）' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "averageWalkPerDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平均每日车程（分钟）' }),
    __metadata("design:type", Number)
], TripMetricsSummaryDto.prototype, "averageDrivePerDay", void 0);
class TripMetricsResponseDto {
}
exports.TripMetricsResponseDto = TripMetricsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程 ID' }),
    __metadata("design:type", String)
], TripMetricsResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每日指标列表', type: [DayMetricsResponseDto] }),
    __metadata("design:type", Array)
], TripMetricsResponseDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摘要信息', type: TripMetricsSummaryDto }),
    __metadata("design:type", TripMetricsSummaryDto)
], TripMetricsResponseDto.prototype, "summary", void 0);
//# sourceMappingURL=trip-metrics.dto.js.map