// src/users/users.controller.ts
import { Controller, Get, Put, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({
    summary: '获取当前用户的偏好画像',
    description: '获取当前用户的偏好画像（如喜欢的景点类型、忌口食物、是否偏好小众景点等）。如果用户没有设置过偏好，返回空画像。\n\n注意：实际使用时，用户ID应从认证中间件（JWT token）中获取。这里暂时使用默认用户ID。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回用户画像（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getProfile() {
    try {
      // TODO: 从认证中间件获取当前用户ID
      // 暂时使用默认用户ID，实际应该从 JWT token 中获取
      const userId = 'default-user'; // 实际应该从 req.user 或认证中间件获取
      const profile = await this.usersService.getProfile(userId);
      return successResponse(profile);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put('profile')
  @ApiOperation({
    summary: '更新用户偏好信息',
    description: '更新或创建用户偏好信息。支持部分更新。\n\n注意：实际使用时，用户ID应从认证中间件（JWT token）中获取。这里暂时使用默认用户ID。',
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
  async updateProfile(@Body() dto: UpdateUserProfileDto) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      // 暂时使用默认用户ID，实际应该从 JWT token 中获取
      const userId = 'default-user'; // 实际应该从 req.user 或认证中间件获取
      const profile = await this.usersService.updateProfile(userId, dto);
      return successResponse(profile);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
