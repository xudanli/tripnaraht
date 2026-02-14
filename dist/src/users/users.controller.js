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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const user_profile_dto_1 = require("./dto/user-profile.dto");
const admin_user_dto_1 = require("./dto/admin-user.dto");
const current_user_dto_1 = require("./dto/current-user.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async getCurrentUser(user) {
        try {
            if (!user || !user.userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
            }
            const currentUser = await this.usersService.getCurrentUser(user.userId);
            return (0, standard_response_dto_1.successResponse)(currentUser);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateCurrentUser(dto, user) {
        try {
            if (!user || !user.userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
            }
            const updatedUser = await this.usersService.updateCurrentUser(user.userId, dto);
            return (0, standard_response_dto_1.successResponse)(updatedUser);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async deleteCurrentUser(dto, user) {
        try {
            if (!user || !user.userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
            }
            const result = await this.usersService.deleteCurrentUser(user.userId, dto.confirmText);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getProfile(user) {
        try {
            if (!user || !user.userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
            }
            const profile = await this.usersService.getProfile(user.userId);
            return (0, standard_response_dto_1.successResponse)(profile);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateProfile(dto, user) {
        try {
            if (!user || !user.userId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
            }
            const profile = await this.usersService.updateProfile(user.userId, dto);
            return (0, standard_response_dto_1.successResponse)(profile);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUsers(query) {
        try {
            const result = await this.usersService.getUsers(query);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUserStats() {
        try {
            const stats = await this.usersService.getUserStats();
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUserById(userId) {
        try {
            const user = await this.usersService.getUserById(userId);
            return (0, standard_response_dto_1.successResponse)(user);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUserDetail(userId) {
        try {
            const detail = await this.usersService.getUserDetail(userId);
            return (0, standard_response_dto_1.successResponse)(detail);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateUser(userId, dto) {
        try {
            const user = await this.usersService.updateUser(userId, dto);
            return (0, standard_response_dto_1.successResponse)(user);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async deleteUser(userId) {
        try {
            const result = await this.usersService.deleteUser(userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({
        summary: '获取当前用户信息',
        description: '获取当前已登录用户的基本信息。\n\n需要认证：使用 JWT Bearer token。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回当前用户信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: '未认证或 token 无效',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getCurrentUser", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('me'),
    (0, swagger_1.ApiOperation)({
        summary: '更新当前用户信息',
        description: '更新当前已登录用户的基本信息（显示名称、头像）。\n\n需要认证：使用 JWT Bearer token。',
    }),
    (0, swagger_1.ApiBody)({ type: current_user_dto_1.UpdateCurrentUserDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新用户信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: '未认证或 token 无效',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [current_user_dto_1.UpdateCurrentUserDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateCurrentUser", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('me'),
    (0, swagger_1.ApiOperation)({
        summary: '删除当前用户账户',
        description: '永久删除当前用户账户及其所有关联数据。此操作不可撤销！\n\n需要认证：使用 JWT Bearer token。\n\n请求体中需包含 confirmText="确认删除" 以确认操作。',
    }),
    (0, swagger_1.ApiBody)({ type: current_user_dto_1.DeleteAccountDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除账户',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '未确认删除操作',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: '未认证或 token 无效',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [current_user_dto_1.DeleteAccountDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "deleteCurrentUser", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: '获取当前用户的偏好画像',
        description: '获取当前用户的偏好画像（如喜欢的景点类型、忌口食物、是否偏好小众景点等）。如果用户没有设置过偏好，返回空画像。\n\n需要认证：使用 JWT Bearer token。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回用户画像（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: '未认证或 token 无效',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: '更新用户偏好信息',
        description: '更新或创建用户偏好信息。支持部分更新。\n\n需要认证：使用 JWT Bearer token。',
    }),
    (0, swagger_1.ApiBody)({ type: user_profile_dto_1.UpdateUserProfileDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新用户画像（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: '未认证或 token 无效',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_profile_dto_1.UpdateUserProfileDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin'),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户列表（管理接口）',
        description: '获取用户列表，支持分页、搜索、筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: '搜索关键词（邮箱、显示名称）' }),
    (0, swagger_1.ApiQuery)({ name: 'emailVerified', required: false, type: Boolean, description: '邮箱验证状态' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回用户列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_user_dto_1.GetUsersQueryDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUsers", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户统计信息（管理接口）',
        description: '获取用户相关的统计数据，包括总用户数、验证状态、新增用户等。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回用户统计信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户详情（管理接口）',
        description: '根据用户ID获取用户详细信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '用户ID', type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回用户详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '用户不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/:id/detail'),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户详情（包含关联数据）（管理接口）',
        description: '获取用户详细信息，包括偏好设置、行程统计等关联数据。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '用户ID', type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回用户详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '用户不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新用户信息（管理接口）',
        description: '更新用户信息，包括显示名称、邮箱、邮箱验证状态、头像等。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '用户ID', type: String }),
    (0, swagger_1.ApiBody)({ type: admin_user_dto_1.UpdateUserDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新用户信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '用户不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateUser", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '删除用户（管理接口）',
        description: '永久删除指定用户及其所有关联数据。此操作不可撤销！',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '用户ID', type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除用户',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '用户不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "deleteUser", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map