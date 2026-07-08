import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CTRE_API_TAG } from './constants/ctre.constants';
import { successResponse } from '../common/dto/standard-response.dto';
import type { PlannerDraftIR } from './contracts/planner-draft-ir.types';
import type { TravelCompilerOptions } from './contracts/travel-compiler.types';
import { TravelCompilerService } from './travel-compiler.service';

class CompileTravelDraftDto {
  draft!: PlannerDraftIR;
  options?: TravelCompilerOptions;
}

@ApiTags('Travel Compiler', CTRE_API_TAG)
@Controller('travel/compiler')
export class TravelCompilerController {
  constructor(private readonly compiler: TravelCompilerService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compile Planner Draft IR into Canonical Travel Graph (CTRE)',
    description: 'Travel Compiler / CTRE — Lexical → Canonicalization → Route Resolution → Graph',
  })
  async compile(@Body() body: CompileTravelDraftDto) {
    const data = await this.compiler.compile(body.draft, body.options);
    return successResponse(data);
  }
}
