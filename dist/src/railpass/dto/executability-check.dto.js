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
exports.RegeneratePlanDto = exports.CheckExecutabilityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CheckExecutabilityDto {
}
exports.CheckExecutabilityDto = CheckExecutabilityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pass Profile', type: Object }),
    __metadata("design:type", Object)
], CheckExecutabilityDto.prototype, "passProfile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Rail Segments', type: [Object] }),
    __metadata("design:type", Array)
], CheckExecutabilityDto.prototype, "segments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reservation Tasks', type: [Object] }),
    __metadata("design:type", Array)
], CheckExecutabilityDto.prototype, "reservationTasks", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Place ID -> Name 映射（可选，用于显示地点名称）', type: Object }),
    __metadata("design:type", Object)
], CheckExecutabilityDto.prototype, "placeNames", void 0);
class RegeneratePlanDto {
}
exports.RegeneratePlanDto = RegeneratePlanDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trip ID' }),
    __metadata("design:type", String)
], RegeneratePlanDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['MORE_STABLE', 'MORE_ECONOMICAL', 'MORE_AFFORDABLE', 'CUSTOM'],
        description: '改方案策略：更稳/更省/更便宜'
    }),
    __metadata("design:type", String)
], RegeneratePlanDto.prototype, "strategy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '自定义参数' }),
    __metadata("design:type", Object)
], RegeneratePlanDto.prototype, "customParams", void 0);
//# sourceMappingURL=executability-check.dto.js.map