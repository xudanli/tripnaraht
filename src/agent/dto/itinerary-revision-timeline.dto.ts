import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One node on the decision timeline (revision + synthesized narrative). */
export class RevisionTimelineItemDto {
  @ApiProperty()
  revision_id!: string;

  @ApiProperty({ enum: ['BASELINE', 'CONFIRMED', 'ROLLBACK'], description: 'ROLLBACK = 物理回滚产生的新跃迁' })
  kind!: string;

  @ApiProperty()
  created_at!: Date;

  @ApiPropertyOptional()
  parent_revision_id?: string | null;

  @ApiPropertyOptional({ description: '一键回滚锚点：父版本 id（恢复该 revision 的 snapshot）；BASELINE 为 null' })
  rollback_to_revision_id?: string | null;

  @ApiPropertyOptional()
  resolution_type?: string | null;

  @ApiPropertyOptional()
  alternative_id?: string | null;

  @ApiPropertyOptional()
  resolution_patch_summary?: string | null;

  @ApiPropertyOptional()
  delta_cost_usd?: number | null;

  @ApiPropertyOptional()
  delta_time_minutes?: number | null;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object' },
    description: '结构化中断字段；display_name 由 Narrator 结合 snapshot 解析（景点名 / 站点名等）。',
  })
  interrupted_items?: Array<{ item_id: string; field: string; display_name?: string }>;

  @ApiPropertyOptional({
    description: 'Human-readable list of affected place / booking node names (from Narrator + snapshot).',
  })
  impact_summary?: string;

  @ApiProperty({
    description: '人类可读摘要（默认 zh）。后续可改为 i18n key + 参数或 narrative_en 并列字段。',
  })
  narrative!: string;

  @ApiPropertyOptional({ example: 'zh', description: '预留多语言：zh | en | …' })
  narrative_locale?: string;
}

export class RevisionTimelineResponseDto {
  @ApiProperty()
  trip_id!: string;

  @ApiProperty({ type: RevisionTimelineItemDto, isArray: true })
  revisions!: RevisionTimelineItemDto[];
}
