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
exports.TestConfigDto = exports.CreateOrUpdateDestinationClarificationConfigDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateOrUpdateDestinationClarificationConfigDto {
}
exports.CreateOrUpdateDestinationClarificationConfigDto = CreateOrUpdateDestinationClarificationConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地名称' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrUpdateDestinationClarificationConfigDto.prototype, "destinationName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否启用' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateOrUpdateDestinationClarificationConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '配置内容', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateOrUpdateDestinationClarificationConfigDto.prototype, "config", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateOrUpdateDestinationClarificationConfigDto.prototype, "metadata", void 0);
class TestConfigDto {
}
exports.TestConfigDto = TestConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前参数', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], TestConfigDto.prototype, "currentParams", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户输入' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TestConfigDto.prototype, "userInput", void 0);
//# sourceMappingURL=create-or-update-config.dto.js.map