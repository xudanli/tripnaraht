import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileExtractorDirectService } from '../../mcp/file-extractor-direct.service';
import {
  DEFAULT_GUIDE_SOURCE_CONFIDENCE,
  GUIDE_CONTENT_MAX_CHARS,
  GUIDE_CREDIBILITY_LEVEL,
  GUIDE_FILE_MAX_BYTES,
  GUIDE_PARSE_STATUS,
  GUIDE_SOURCE_TYPE,
  GUIDE_TO_PLAN_SESSION_STATUS,
} from '../constants/guide-to-plan-status.constants';
import type { ImportGuideTextDto } from '../dto/guide-to-plan.dto';
import { GuideToPlanSessionService } from '../guide-to-plan-session.service';
import type { GuideImportPreviewView, ImportedGuideView } from '../types/guide-to-plan.types';
import { estimateImportPreview } from '../utils/guide-import-preview.util';

const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: string }> = [
  { pattern: /xiaohongshu\.com|xhslink\.com/i, platform: 'xiaohongshu' },
  { pattern: /douyin\.com|iesdouyin\.com/i, platform: 'douyin' },
  { pattern: /mp\.weixin\.qq\.com/i, platform: 'wechat' },
  { pattern: /bilibili\.com|b23\.tv/i, platform: 'bilibili' },
];

const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'xlsx',
  'xls',
  'csv',
  'txt',
  'md',
]);

@Injectable()
export class GuideIngestService {
  private readonly logger = new Logger(GuideIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: GuideToPlanSessionService,
    private readonly fileExtractor: FileExtractorDirectService,
  ) {}

  async importGuide(
    userId: string,
    sessionId: string,
    dto: ImportGuideTextDto,
  ): Promise<ImportedGuideView> {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireCanImport(session, '导入攻略');

    if (dto.sourceType === GUIDE_SOURCE_TYPE.LINK && !dto.sourceUrl?.trim() && !dto.content?.trim()) {
      throw new BadRequestException('链接导入需提供 sourceUrl 或粘贴正文 content');
    }
    if (dto.sourceType === GUIDE_SOURCE_TYPE.TEXT && !dto.content?.trim()) {
      throw new BadRequestException('文字导入需提供 content');
    }
    if (
      dto.sourceType === GUIDE_SOURCE_TYPE.MANUAL &&
      !dto.manualInspirations?.length
    ) {
      throw new BadRequestException('手动灵感需提供 manualInspirations');
    }

    const rawContent = this.resolveRawContent(dto);
    if (!rawContent && dto.sourceType !== GUIDE_SOURCE_TYPE.LINK) {
      throw new BadRequestException('content or manualInspirations is required');
    }
    if (rawContent && rawContent.length > GUIDE_CONTENT_MAX_CHARS) {
      throw new BadRequestException(
        `攻略内容不能超过 ${GUIDE_CONTENT_MAX_CHARS.toLocaleString()} 字`,
      );
    }

    const sourcePlatform =
      dto.sourceUrl != null ? this.detectPlatform(dto.sourceUrl) : null;

    const guide = await this.prisma.importedGuide.create({
      data: {
        sessionId,
        title: dto.title ?? this.inferTitle(dto, rawContent),
        sourceType: dto.sourceType,
        sourceUrl: dto.sourceUrl ?? null,
        sourcePlatform,
        rawContent: rawContent ?? null,
        parseStatus: GUIDE_PARSE_STATUS.PENDING,
        sourceConfidence: DEFAULT_GUIDE_SOURCE_CONFIDENCE,
        credibilityLevel: GUIDE_CREDIBILITY_LEVEL.L1,
      },
    });

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING },
    });

    this.logger.log(
      `Imported guide ${guide.id} into session ${sessionId} (${dto.sourceType})`,
    );

    return this.sessionService.serializeGuide(guide);
  }

  async importScreenshot(
    userId: string,
    sessionId: string,
    opts: {
      title?: string;
      ocrText: string;
      imageUrl?: string;
    },
  ): Promise<ImportedGuideView> {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireCanImport(session, '导入攻略');

    const ocrText = opts.ocrText.trim();
    if (!ocrText) {
      throw new BadRequestException('OCR 文字为空');
    }
    if (ocrText.length > GUIDE_CONTENT_MAX_CHARS) {
      throw new BadRequestException(
        `OCR 文字超过 ${GUIDE_CONTENT_MAX_CHARS.toLocaleString()} 字上限`,
      );
    }

    const guide = await this.prisma.importedGuide.create({
      data: {
        sessionId,
        title: opts.title ?? '攻略截图',
        sourceType: GUIDE_SOURCE_TYPE.SCREENSHOT,
        ocrText,
        rawContent: ocrText,
        imageUrl: opts.imageUrl ?? null,
        sourceMetadata: {
          wordCount: ocrText.length,
        },
        parseStatus: GUIDE_PARSE_STATUS.PENDING,
        sourceConfidence: DEFAULT_GUIDE_SOURCE_CONFIDENCE,
        credibilityLevel: GUIDE_CREDIBILITY_LEVEL.L1,
      },
    });

    await this.touchCollecting(sessionId);
    return this.sessionService.serializeGuide(guide);
  }

  async importFile(
    userId: string,
    sessionId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    opts?: { title?: string },
  ): Promise<ImportedGuideView> {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireCanImport(session, '导入攻略');

    if (!file.buffer?.length) {
      throw new BadRequestException('请上传攻略文件');
    }
    if (file.size > GUIDE_FILE_MAX_BYTES) {
      throw new BadRequestException(`文件大小不能超过 ${GUIDE_FILE_MAX_BYTES / 1024 / 1024}MB`);
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `不支持的文件格式 .${ext}，支持 PDF、Word、Excel、CSV、TXT`,
      );
    }

    if (!this.fileExtractor.isServiceAvailable()) {
      throw new BadRequestException('文件解析服务不可用');
    }

    const extracted = await this.fileExtractor.extractFromBuffer(
      file.originalname,
      file.buffer,
    );
    const text = String(extracted.content ?? '').trim();
    if (!text) {
      throw new BadRequestException('未能从文件中提取到文字内容');
    }
    if (text.length > GUIDE_CONTENT_MAX_CHARS) {
      throw new BadRequestException(
        `提取的文字超过 ${GUIDE_CONTENT_MAX_CHARS.toLocaleString()} 字上限，请拆分文件`,
      );
    }

    const guide = await this.prisma.importedGuide.create({
      data: {
        sessionId,
        title: opts?.title ?? file.originalname,
        sourceType: GUIDE_SOURCE_TYPE.FILE,
        rawContent: text,
        sourceMetadata: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          pageCount: extracted.totalPages,
          wordCount: extracted.wordCount,
          format: extracted.format,
        },
        parseStatus: GUIDE_PARSE_STATUS.PENDING,
        sourceConfidence: DEFAULT_GUIDE_SOURCE_CONFIDENCE,
        credibilityLevel: GUIDE_CREDIBILITY_LEVEL.L1,
      },
    });

    await this.touchCollecting(sessionId);
    this.logger.log(`Imported file guide ${guide.id}: ${file.originalname}`);
    return this.sessionService.serializeGuide(guide);
  }

  async deleteGuide(userId: string, sessionId: string, guideId: string): Promise<void> {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireCanImport(session, '删除攻略');
    const guide = await this.prisma.importedGuide.findFirst({
      where: { id: guideId, sessionId },
    });
    if (!guide) {
      throw new BadRequestException('攻略不存在');
    }
    await this.prisma.importedGuide.delete({ where: { id: guideId } });
  }

  async getImportPreview(userId: string, sessionId: string): Promise<GuideImportPreviewView> {
    await this.sessionService.requireSession(userId, sessionId);
    const guides = await this.prisma.importedGuide.findMany({
      where: { sessionId },
      select: { rawContent: true, ocrText: true, sourceMetadata: true },
    });

    const combined = guides
      .map((g) => [g.rawContent, g.ocrText].filter(Boolean).join('\n'))
      .join('\n\n');

    return estimateImportPreview(combined, guides.length);
  }

  private async touchCollecting(sessionId: string) {
    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING },
    });
  }

  private resolveRawContent(dto: ImportGuideTextDto): string | null {
    if (dto.manualInspirations?.length) {
      return dto.manualInspirations.join('\n');
    }
    const content = dto.content?.trim();
    if (content) return content;
    if (dto.sourceType === GUIDE_SOURCE_TYPE.LINK && dto.sourceUrl) {
      return dto.sourceUrl;
    }
    return null;
  }

  private inferTitle(dto: ImportGuideTextDto, rawContent: string | null): string | null {
    if (dto.title) return dto.title;
    if (dto.sourceType === GUIDE_SOURCE_TYPE.MANUAL) return '旅行灵感';
    if (dto.sourceUrl) {
      const platform = this.detectPlatform(dto.sourceUrl);
      if (platform === 'xiaohongshu') return '小红书攻略';
      if (platform === 'bilibili') return 'B站攻略';
      if (platform === 'wechat') return '公众号攻略';
      return '导入攻略';
    }
    const firstLine = rawContent?.split('\n').find((l) => l.trim().length > 0);
    if (firstLine && firstLine.length <= 80) return firstLine.trim();
    return '导入攻略';
  }

  private detectPlatform(url: string): string {
    for (const { pattern, platform } of PLATFORM_PATTERNS) {
      if (pattern.test(url)) return platform;
    }
    return 'unknown';
  }
}
