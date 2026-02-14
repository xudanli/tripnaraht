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
exports.TripStateDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class TripStateDto {
}
exports.TripStateDto = TripStateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前日期 ID', example: 'day-uuid' }),
    __metadata("design:type", String)
], TripStateDto.prototype, "currentDayId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前行程项 ID', example: 'item-uuid' }),
    __metadata("design:type", String)
], TripStateDto.prototype, "currentItemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '下一站信息' }),
    __metadata("design:type", Object)
], TripStateDto.prototype, "nextStop", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预计到达时间（ISO 格式）' }),
    __metadata("design:type", String)
], TripStateDto.prototype, "eta", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '时区', example: 'Asia/Tokyo' }),
    __metadata("design:type", String)
], TripStateDto.prototype, "timezone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前时间（ISO 格式）', example: '2024-05-01T10:30:00.000Z' }),
    __metadata("design:type", String)
], TripStateDto.prototype, "now", void 0);
//# sourceMappingURL=trip-state.dto.js.map