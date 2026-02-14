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
exports.ExecuteDto = exports.QueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class QueryDto {
}
exports.QueryDto = QueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'SQL 查询语句（SELECT）',
        example: 'SELECT * FROM users WHERE id = $1',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '查询参数（可选）',
        example: [1],
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], QueryDto.prototype, "params", void 0);
class ExecuteDto {
}
exports.ExecuteDto = ExecuteDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'SQL 执行语句（INSERT, UPDATE, DELETE）',
        example: 'INSERT INTO users (name, email) VALUES ($1, $2)',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExecuteDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '执行参数（可选）',
        example: ['John Doe', 'john@example.com'],
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ExecuteDto.prototype, "params", void 0);
//# sourceMappingURL=postgresql.dto.js.map