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
exports.MessageHistoryResponseDto = exports.MessageDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class MessageDto {
}
exports.MessageDto = MessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息ID' }),
    __metadata("design:type", String)
], MessageDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '角色', enum: ['user', 'assistant'] }),
    __metadata("design:type", String)
], MessageDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息内容' }),
    __metadata("design:type", String)
], MessageDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '时间戳' }),
    __metadata("design:type", String)
], MessageDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '意图' }),
    __metadata("design:type", String)
], MessageDto.prototype, "intent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联数据' }),
    __metadata("design:type", Object)
], MessageDto.prototype, "data", void 0);
class MessageHistoryResponseDto {
}
exports.MessageHistoryResponseDto = MessageHistoryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息列表', type: [MessageDto] }),
    __metadata("design:type", Array)
], MessageHistoryResponseDto.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数量' }),
    __metadata("design:type", Number)
], MessageHistoryResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '限制数量' }),
    __metadata("design:type", Number)
], MessageHistoryResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '偏移量' }),
    __metadata("design:type", Number)
], MessageHistoryResponseDto.prototype, "offset", void 0);
//# sourceMappingURL=message-history-response.dto.js.map