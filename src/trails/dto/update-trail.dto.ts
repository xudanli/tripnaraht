// src/trails/dto/update-trail.dto.ts

import { PartialType } from '@nestjs/swagger';
import { CreateTrailDto } from './create-trail.dto';

/**
 * 更新徒步路线 DTO
 * 所有字段都是可选的
 */
export class UpdateTrailDto extends PartialType(CreateTrailDto) {}

