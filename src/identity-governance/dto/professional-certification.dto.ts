import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SaveProfessionalDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  destinations?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  experienceSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  qualifications?: Array<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  businessCompliance?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  insurance?: Record<string, unknown>;
}

export class ReviewProfessionalCertDto {
  @IsString()
  action!: 'approve' | 'reject' | 'need_more_info' | 'suspend' | 'revoke';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CreateOrganizationDraftDto {
  @IsString()
  @MaxLength(200)
  displayName!: string;
}
