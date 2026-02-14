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
exports.RollbackVersionDto = exports.ExecuteDraftDto = exports.SaveDraftDto = exports.GenerateDraftDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class GenerateDraftDto {
}
exports.GenerateDraftDto = GenerateDraftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '旅行规划请求' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    __metadata("design:type", Object)
], GenerateDraftDto.prototype, "trip_plan_request", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成配置' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], GenerateDraftDto.prototype, "config", void 0);
class SaveDraftDto {
}
exports.SaveDraftDto = SaveDraftDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '工作流草案' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    __metadata("design:type", Object)
], SaveDraftDto.prototype, "draft", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否自动保存', default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SaveDraftDto.prototype, "is_auto_save", void 0);
class ExecuteDraftDto {
}
exports.ExecuteDraftDto = ExecuteDraftDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '执行选项' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteDraftDto.prototype, "options", void 0);
class RollbackVersionDto {
}
exports.RollbackVersionDto = RollbackVersionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '版本 ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RollbackVersionDto.prototype, "version_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '确认回滚', default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RollbackVersionDto.prototype, "confirm", void 0);
//# sourceMappingURL=chain-of-work.dto.js.map