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
exports.ApiErrorResponseDto = exports.ApiSuccessResponseDto = exports.ApiErrorDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ApiErrorDto {
}
exports.ApiErrorDto = ApiErrorDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: [
            'VALIDATION_ERROR',
            'NOT_FOUND',
            'PROVIDER_ERROR',
            'BUSINESS_ERROR',
            'INTERNAL_ERROR',
            'UNSUPPORTED_ACTION',
        ],
        example: 'VALIDATION_ERROR',
    }),
    __metadata("design:type", String)
], ApiErrorDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'poiId is required' }),
    __metadata("design:type", String)
], ApiErrorDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object, example: { field: 'poiId' } }),
    __metadata("design:type", Object)
], ApiErrorDto.prototype, "details", void 0);
class ApiSuccessResponseDto {
}
exports.ApiSuccessResponseDto = ApiSuccessResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [true], example: true }),
    __metadata("design:type", Boolean)
], ApiSuccessResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Object)
], ApiSuccessResponseDto.prototype, "data", void 0);
class ApiErrorResponseDto {
}
exports.ApiErrorResponseDto = ApiErrorResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [false], example: false }),
    __metadata("design:type", Boolean)
], ApiErrorResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ApiErrorDto }),
    __metadata("design:type", ApiErrorDto)
], ApiErrorResponseDto.prototype, "error", void 0);
//# sourceMappingURL=api-response.dto.js.map