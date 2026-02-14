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
exports.ApplyFallbackRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ApplyFallbackRequestDto {
}
exports.ApplyFallbackRequestDto = ApplyFallbackRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID', example: 'trip-uuid' }),
    __metadata("design:type", String)
], ApplyFallbackRequestDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '修复方案ID（从fallback响应中获取）', example: 'solution-uuid' }),
    __metadata("design:type", String)
], ApplyFallbackRequestDto.prototype, "solutionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否确认应用（默认true）', example: true }),
    __metadata("design:type", Boolean)
], ApplyFallbackRequestDto.prototype, "confirm", void 0);
//# sourceMappingURL=apply-fallback.dto.js.map