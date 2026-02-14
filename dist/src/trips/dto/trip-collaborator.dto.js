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
exports.CollaboratorResponseDto = exports.AddCollaboratorDto = exports.CollaboratorRole = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var CollaboratorRole;
(function (CollaboratorRole) {
    CollaboratorRole["VIEWER"] = "VIEWER";
    CollaboratorRole["EDITOR"] = "EDITOR";
    CollaboratorRole["OWNER"] = "OWNER";
})(CollaboratorRole || (exports.CollaboratorRole = CollaboratorRole = {}));
class AddCollaboratorDto {
}
exports.AddCollaboratorDto = AddCollaboratorDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户邮箱', example: 'user@example.com' }),
    (0, class_validator_1.IsEmail)({}, { message: '无效的邮箱地址' }),
    __metadata("design:type", String)
], AddCollaboratorDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '角色',
        enum: CollaboratorRole,
        example: CollaboratorRole.EDITOR,
    }),
    (0, class_validator_1.IsEnum)(CollaboratorRole),
    __metadata("design:type", String)
], AddCollaboratorDto.prototype, "role", void 0);
class CollaboratorResponseDto {
}
exports.CollaboratorResponseDto = CollaboratorResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '协作者ID' }),
    __metadata("design:type", String)
], CollaboratorResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    __metadata("design:type", String)
], CollaboratorResponseDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户ID' }),
    __metadata("design:type", String)
], CollaboratorResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '角色', enum: CollaboratorRole }),
    __metadata("design:type", String)
], CollaboratorResponseDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], CollaboratorResponseDto.prototype, "createdAt", void 0);
//# sourceMappingURL=trip-collaborator.dto.js.map