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
exports.TripSuggestionsResponseDto = exports.TripSuggestionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class TripSuggestionDto {
}
exports.TripSuggestionDto = TripSuggestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议类型' }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（英文）' }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标题（中文）' }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "titleCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（英文）' }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '描述（中文）' }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "descriptionCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '优先级', enum: ['low', 'medium', 'high'] }),
    __metadata("design:type", String)
], TripSuggestionDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作建议' }),
    __metadata("design:type", Object)
], TripSuggestionDto.prototype, "action", void 0);
class TripSuggestionsResponseDto {
}
exports.TripSuggestionsResponseDto = TripSuggestionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '建议列表', type: [TripSuggestionDto] }),
    __metadata("design:type", Array)
], TripSuggestionsResponseDto.prototype, "suggestions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成时间' }),
    __metadata("design:type", String)
], TripSuggestionsResponseDto.prototype, "generatedAt", void 0);
//# sourceMappingURL=trip-suggestions-response.dto.js.map