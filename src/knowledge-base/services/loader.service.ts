// src/knowledge-base/services/loader.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { KBFileData } from '../interfaces/knowledge-base.interface';

@Injectable()
export class LoaderService {
  private readonly logger = new Logger(LoaderService.name);
  private kbPath: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.kbPath = this.configService?.get('KB_PATH') || process.env.KB_PATH || './docs/iceland';
    this.logger.log(`📁 Knowledge Base Path: ${this.kbPath}`);
  }

  /**
   * 加载所有知识库文件
   */
  async loadAllFiles(): Promise<KBFileData[]> {
    const files: KBFileData[] = [];

    const walkDir = (dirPath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

            files.push({
              filename: entry.name,
              filepath: fullPath,
              content,
              metadata: content.metadata || {
                version: '1.0.0',
                credibility_score: 0.8,
                language: 'zh-CN',
                data_sources: [],
                last_updated: new Date().toISOString(),
              },
            });

            this.logger.log(`✅ 已加载: ${entry.name}`);
          } catch (error) {
            this.logger.error(`❌ 加载失败 ${entry.name}:`, error);
          }
        }
      }
    };

    walkDir(this.kbPath);
    this.logger.log(`\n📊 总共加载 ${files.length} 个文件`);
    return files;
  }

  /**
   * 保存文件到数据库
   * @param categoryOverride 管理端上传时可指定类别（如 travel_guides），不传则按文件名推断
   */
  async saveFile(fileData: KBFileData, categoryOverride?: string): Promise<string> {
    const category =
      categoryOverride?.trim() || this.detectCategory(fileData.filename);

    const file = await this.prisma.knowledgeFile.upsert({
      where: { filename: fileData.filename },
      update: {
        filepath: fileData.filepath,
        category,
        version: fileData.metadata.version,
        credibilityScore: fileData.metadata.credibility_score,
        dataSources: fileData.metadata.data_sources,
        lastUpdated: new Date(fileData.metadata.last_updated),
      },
      create: {
        filename: fileData.filename,
        filepath: fileData.filepath,
        category,
        version: fileData.metadata.version,
        language: fileData.metadata.language,
        credibilityScore: fileData.metadata.credibility_score,
        dataSources: fileData.metadata.data_sources,
        lastUpdated: new Date(fileData.metadata.last_updated),
      },
    });

    return file.id;
  }

  /**
   * 检测文件分类
   */
  private detectCategory(filename: string): string {
    if (filename.includes('rhythm') || filename.includes('persona') || filename.includes('feasibility')) {
      return 'decision_support';
    }
    if (filename.includes('rental') || filename.includes('packing')) {
      return 'practical_guides';
    }
    // compliance_rules: 法律法规、合规规则
    if (filename.includes('rules') || filename.includes('laws') || filename.includes('compliance')) {
      return 'compliance_rules';
    }
    if (filename.includes('risk') || filename.includes('hazard') || filename.includes('safety')) {
      return 'safety';
    }
    if (filename.includes('weather') || filename.includes('seasonal') || filename.includes('climate') || filename.includes('terrain')) {
      return 'geography_seasonal';
    }
    if (filename.includes('route') || filename.includes('ring-road') || filename.includes('circle') || 
        filename.includes('highlands') || filename.includes('westfjords') || filename.includes('snaefellsnes')) {
      return 'routes';
    }
    if (filename.includes('poi') || filename.includes('accommodation') || filename.includes('attraction') || filename.includes('service') || filename.includes('supplies')) {
      return 'pois';
    }
    if (filename.includes('accessibility')) {
      return 'accessibility';
    }
    return 'general';
  }
}
