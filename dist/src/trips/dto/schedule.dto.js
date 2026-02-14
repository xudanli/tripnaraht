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
exports.SaveScheduleDto = exports.ScheduleResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ScheduleResponseDto {
}
exports.ScheduleResponseDto = ScheduleResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期（YYYY-MM-DD）', example: '2024-05-01' }),
    __metadata("design:type", String)
], ScheduleResponseDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程计划（DayScheduleResult）' }),
    __metadata("design:type", Object)
], ScheduleResponseDto.prototype, "schedule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已保存到数据库', example: true }),
    __metadata("design:type", Boolean)
], ScheduleResponseDto.prototype, "persisted", void 0);
class SaveScheduleDto {
}
exports.SaveScheduleDto = SaveScheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程计划（DayScheduleResult）' }),
    __metadata("design:type", Object)
], SaveScheduleDto.prototype, "schedule", void 0);
//# sourceMappingURL=schedule.dto.js.map