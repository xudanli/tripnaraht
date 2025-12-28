// src/users/users.controller.ts
import { Controller, Get, Put, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
      const profile = await this.usersService.getProfile(user.userId);
      return successResponse(profile);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

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
      const profile = await this.usersService.updateProfile(user.userId, dto);
      return successResponse(profile);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
