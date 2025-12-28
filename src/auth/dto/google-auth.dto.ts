// src/auth/dto/google-auth.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
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

