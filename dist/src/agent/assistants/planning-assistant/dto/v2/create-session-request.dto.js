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
exports.CreateSessionRequestDto = exports.SessionContextDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class SessionContextDto {
}
exports.SessionContextDto = SessionContextDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '关联已创建行程ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SessionContextDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '初始目的地' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SessionContextDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '初始偏好' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], SessionContextDto.prototype, "preferences", void 0);
class CreateSessionRequestDto {
}
exports.CreateSessionRequestDto = CreateSessionRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionRequestDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '初始上下文' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SessionContextDto),
    __metadata("design:type", SessionContextDto)
], CreateSessionRequestDto.prototype, "context", void 0);
//# sourceMappingURL=create-session-request.dto.js.map