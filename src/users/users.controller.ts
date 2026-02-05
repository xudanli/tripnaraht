// src/users/users.controller.ts
import { Controller, Get, Put, Delete, Body, BadRequestException, NotFoundException, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { GetUsersQueryDto, UserListResponseDto, UserResponseDto, UpdateUserDto } from './dto/admin-user.dto';
import { CurrentUserResponseDto, UpdateCurrentUserDto, DeleteAccountDto, DeleteAccountResponseDto } from './dto/current-user.dto';
import { UserStatsResponseDto, UserDetailResponseDto } from './dto/user-stats.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==================== 当前用户接口 ====================

  @Public()
  @Get('me')
  @ApiOperation({
    summary: '获取当前用户信息',
    description: '获取当前已登录用户的基本信息。\n\n需要认证：使用 JWT Bearer token。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回当前用户信息',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '未认证或 token 无效',
    type: ApiErrorResponseDto,
  })
  async getCurrentUser(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user || !user.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const currentUser = await this.usersService.getCurrentUser(user.userId);
      return successResponse(currentUser);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Put('me')
  @ApiOperation({
    summary: '更新当前用户信息',
    description: '更新当前已登录用户的基本信息（显示名称、头像）。\n\n需要认证：使用 JWT Bearer token。',
  })
  @ApiBody({ type: UpdateCurrentUserDto })
  @ApiResponse({
    status: 200,
    description: '成功更新用户信息',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '未认证或 token 无效',
    type: ApiErrorResponseDto,
  })
  async updateCurrentUser(
    @Body() dto: UpdateCurrentUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user || !user.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const updatedUser = await this.usersService.updateCurrentUser(user.userId, dto);
      return successResponse(updatedUser);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Delete('me')
  @ApiOperation({
    summary: '删除当前用户账户',
    description: '永久删除当前用户账户及其所有关联数据。此操作不可撤销！\n\n需要认证：使用 JWT Bearer token。\n\n请求体中需包含 confirmText="确认删除" 以确认操作。',
  })
  @ApiBody({ type: DeleteAccountDto })
  @ApiResponse({
    status: 200,
    description: '成功删除账户',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '未确认删除操作',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '未认证或 token 无效',
    type: ApiErrorResponseDto,
  })
  async deleteCurrentUser(
    @Body() dto: DeleteAccountDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user || !user.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.usersService.deleteCurrentUser(user.userId, dto.confirmText);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('profile')
  @ApiOperation({
    summary: '获取当前用户的偏好画像',
    description: '获取当前用户的偏好画像（如喜欢的景点类型、忌口食物、是否偏好小众景点等）。如果用户没有设置过偏好，返回空画像。\n\n需要认证：使用 JWT Bearer token。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回用户画像（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '未认证或 token 无效',
    type: ApiErrorResponseDto,
  })
  async getProfile(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user || !user.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.usersService.getProfile(user.userId);
      return successResponse(profile);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Put('profile')
  @ApiOperation({
    summary: '更新用户偏好信息',
    description: '更新或创建用户偏好信息。支持部分更新。\n\n需要认证：使用 JWT Bearer token。',
  })
  @ApiBody({ type: UpdateUserProfileDto })
  @ApiResponse({
    status: 200,
    description: '成功更新用户画像（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '未认证或 token 无效',
    type: ApiErrorResponseDto,
  })
  async updateProfile(
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user || !user.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.usersService.updateProfile(user.userId, dto);
      return successResponse(profile);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 管理接口 ====================

  @Public()
  @Get('admin')
  @ApiOperation({
    summary: '获取用户列表（管理接口）',
    description: '获取用户列表，支持分页、搜索、筛选。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词（邮箱、显示名称）' })
  @ApiQuery({ name: 'emailVerified', required: false, type: Boolean, description: '邮箱验证状态' })
  @ApiResponse({
    status: 200,
    description: '成功返回用户列表',
    type: ApiSuccessResponseDto,
  })
  async getUsers(@Query() query: GetUsersQueryDto) {
    try {
      const result = await this.usersService.getUsers(query);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/stats')
  @ApiOperation({
    summary: '获取用户统计信息（管理接口）',
    description: '获取用户相关的统计数据，包括总用户数、验证状态、新增用户等。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回用户统计信息',
    type: ApiSuccessResponseDto,
  })
  async getUserStats() {
    try {
      const stats = await this.usersService.getUserStats();
      return successResponse(stats);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/:id')
  @ApiOperation({
    summary: '获取用户详情（管理接口）',
    description: '根据用户ID获取用户详细信息。',
  })
  @ApiParam({ name: 'id', description: '用户ID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回用户详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '用户不存在',
    type: ApiErrorResponseDto,
  })
  async getUserById(@Param('id') userId: string) {
    try {
      const user = await this.usersService.getUserById(userId);
      return successResponse(user);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/:id/detail')
  @ApiOperation({
    summary: '获取用户详情（包含关联数据）（管理接口）',
    description: '获取用户详细信息，包括偏好设置、行程统计等关联数据。',
  })
  @ApiParam({ name: 'id', description: '用户ID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回用户详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '用户不存在',
    type: ApiErrorResponseDto,
  })
  async getUserDetail(@Param('id') userId: string) {
    try {
      const detail = await this.usersService.getUserDetail(userId);
      return successResponse(detail);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Put('admin/:id')
  @ApiOperation({
    summary: '更新用户信息（管理接口）',
    description: '更新用户信息，包括显示名称、邮箱、邮箱验证状态、头像等。',
  })
  @ApiParam({ name: 'id', description: '用户ID', type: String })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: '成功更新用户信息',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '用户不存在',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async updateUser(@Param('id') userId: string, @Body() dto: UpdateUserDto) {
    try {
      const user = await this.usersService.updateUser(userId, dto);
      return successResponse(user);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Delete('admin/:id')
  @ApiOperation({
    summary: '删除用户（管理接口）',
    description: '永久删除指定用户及其所有关联数据。此操作不可撤销！',
  })
  @ApiParam({ name: 'id', description: '用户ID', type: String })
  @ApiResponse({
    status: 200,
    description: '成功删除用户',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '用户不存在',
    type: ApiErrorResponseDto,
  })
  async deleteUser(@Param('id') userId: string) {
    try {
      const result = await this.usersService.deleteUser(userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
