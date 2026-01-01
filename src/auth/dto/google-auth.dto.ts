// src/auth/dto/google-auth.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleCodeDto {
  @ApiProperty({
    description: 'Google OAuth authorization code',
    example: '4/0AX4XfWi...',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class GoogleIdTokenDto {
  @ApiProperty({
    description: 'Google ID Token (JWT)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2...',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'User information' })
  user!: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    emailVerified: boolean | null;
  };

  @ApiProperty({ description: 'Access token (JWT)' })
  accessToken!: string;
}

export class SendVerificationCodeDto {
  @ApiProperty({
    description: 'Email address to send verification code',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email!: string;
}

export class RegisterWithEmailDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Verification code sent to email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'Display name (optional)',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  displayName?: string;
}

export class LoginWithEmailDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: '无效的邮箱地址' })
  email!: string;

  @ApiProperty({
    description: 'Verification code sent to email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

