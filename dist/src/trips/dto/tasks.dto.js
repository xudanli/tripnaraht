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
exports.UpdateTaskStatusDto = exports.TaskDto = exports.TaskCategory = exports.TaskPriority = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["HIGH"] = "high";
    TaskPriority["MEDIUM"] = "medium";
    TaskPriority["LOW"] = "low";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
var TaskCategory;
(function (TaskCategory) {
    TaskCategory["PREFERENCE"] = "PREFERENCE";
    TaskCategory["SCHEDULE"] = "SCHEDULE";
    TaskCategory["SAFETY"] = "SAFETY";
    TaskCategory["BUDGET"] = "BUDGET";
    TaskCategory["OTHER"] = "OTHER";
})(TaskCategory || (exports.TaskCategory = TaskCategory = {}));
class TaskDto {
}
exports.TaskDto = TaskDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '任务ID', example: 'task-1' }),
    __metadata("design:type", String)
], TaskDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '任务文本', example: '确认你能接受的最长驾驶时长' }),
    __metadata("design:type", String)
], TaskDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已完成', example: false }),
    __metadata("design:type", Boolean)
], TaskDto.prototype, "completed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '优先级', enum: TaskPriority, example: TaskPriority.HIGH }),
    __metadata("design:type", String)
], TaskDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '任务分类', enum: TaskCategory, example: TaskCategory.PREFERENCE }),
    __metadata("design:type", String)
], TaskDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '跳转路由', example: '/dashboard/trips/{tripId}' }),
    __metadata("design:type", String)
], TaskDto.prototype, "route", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '元数据', type: Object, additionalProperties: true }),
    __metadata("design:type", Object)
], TaskDto.prototype, "metadata", void 0);
class UpdateTaskStatusDto {
}
exports.UpdateTaskStatusDto = UpdateTaskStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已完成', example: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateTaskStatusDto.prototype, "completed", void 0);
//# sourceMappingURL=tasks.dto.js.map