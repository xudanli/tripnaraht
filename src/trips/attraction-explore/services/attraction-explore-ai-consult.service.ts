import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AttractionExploreAiConsultResult } from '../types/attraction-explore.types';

@Injectable()
export class AttractionExploreAiConsultService {
  private readonly logger = new Logger(AttractionExploreAiConsultService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly llm?: LlmService,
  ) {}

  async consult(input: {
    tripId: string;
    question?: string;
    candidateIds?: string[];
  }): Promise<AttractionExploreAiConsultResult> {
    const rows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: {
        tripId: input.tripId,
        ...(input.candidateIds?.length ? { id: { in: input.candidateIds } } : {}),
      },
      include: { Place: true },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });

    const candidateSummary = rows
      .map(
        (r) =>
          `- ${r.Place.nameCN} (placeId=${r.placeId}, priority=${r.priority}, candidateId=${r.id})`,
      )
      .join('\n');

    const question = input.question?.trim() || '请帮我看看候选清单是否合理，并给出调整建议。';

    if (this.llm) {
      try {
        const answer = await this.llm.humanizeResult({
          dataType: 'attraction_explore_consult',
          data: { question, candidates: candidateSummary || '（暂无候选）' },
        });

        return {
          answer,
          suggestedActions: this.buildHeuristicActions(rows, question),
        };
      } catch (error) {
        this.logger.warn(`AI consult fallback: ${error instanceof Error ? error.message : error}`);
      }
    }

    return {
        answer:
          rows.length > 0
            ? `当前共有 ${rows.length} 个候选。建议保留优先级为 must_go 的景点，并避免单日安排过多高体力景点。`
            : '候选清单为空，建议先从推荐分组或搜索中添加 3–5 个核心景点。',
        suggestedActions: this.buildHeuristicActions(rows, question),
    };
  }

  private buildHeuristicActions(
    rows: Array<{
      id: string;
      placeId: number;
      priority: string;
      Place: { nameCN: string };
    }>,
    question: string,
  ): AttractionExploreAiConsultResult['suggestedActions'] {
    const actions: NonNullable<AttractionExploreAiConsultResult['suggestedActions']> = [];

    const mustGo = rows.filter((r) => r.priority === 'must_go');
    if (mustGo.length > 3) {
      actions.push({
        action: 'change_priority',
        candidateId: mustGo[mustGo.length - 1].id,
        placeId: mustGo[mustGo.length - 1].placeId,
        priority: 'very_interested',
        label: `将「${mustGo[mustGo.length - 1].Place.nameCN}」降为「很感兴趣」以减轻行程压力`,
      });
    }

    if (/下雨|雨天|weather/i.test(question) && rows.length > 0) {
      actions.push({
        action: 'add_candidate',
        label: '考虑增加室内或温泉类候选以应对雨天',
      });
    }

    return actions.length ? actions : undefined;
  }
}
