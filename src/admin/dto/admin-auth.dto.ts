import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@yourcompany.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'change-me-in-production' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}

export class AdminAuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  displayName?: string | null;

  @ApiProperty({ enum: ['USER', 'OPERATOR', 'ADMIN'], example: 'ADMIN' })
  platformRole!: string;
}

export class AdminAuthLoginResponseDto {
  @ApiProperty({ type: AdminAuthUserDto })
  user!: AdminAuthUserDto;

  @ApiProperty({ description: 'JWT access token (includes roles when platform role is set)' })
  accessToken!: string;

  @ApiProperty({ type: [String], example: ['ADMIN'] })
  roles!: string[];
}
