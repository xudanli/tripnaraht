// src/trips/decision/evaluation/e2e-case-storage.service.ts
/**
 * E2E Case Storage Service
 * 
 * 负责 E2E Case 的存储和加载
 * 支持文件系统和数据库两种存储方式
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { E2ECase } from './e2e-case.types';

@Injectable()
export class E2ECaseStorageService {
  private readonly logger = new Logger(E2ECaseStorageService.name);
  private readonly casesDir: string;

  constructor(private readonly prisma: PrismaService) {
    // E2E Cases 存储目录（相对于项目根目录）
    this.casesDir = path.resolve(__dirname, '../../../e2e-cases');
  }

  /**
   * 从文件系统加载 E2E Case
   */
  async loadCaseFromFile(caseId: string): Promise<E2ECase | null> {
    try {
      const filePath = path.join(this.casesDir, `${caseId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const testCase = JSON.parse(content) as E2ECase;
      this.logger.debug(`从文件加载 E2E Case: ${caseId}`);
      return testCase;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.debug(`E2E Case 文件不存在: ${caseId}`);
        return null;
      }
      this.logger.error(`加载 E2E Case 失败: ${caseId}, 错误: ${error.message}`);
      return null;
    }
  }

  /**
   * 从数据库加载 E2E Case（如果实现了数据库存储）
   */
  async loadCaseFromDatabase(caseId: string): Promise<E2ECase | null> {
    try {
      // TODO: 如果使用数据库存储，在这里实现
      // 目前返回 null，表示使用文件系统存储
      return null;
    } catch (error: any) {
      this.logger.error(`从数据库加载 E2E Case 失败: ${caseId}, 错误: ${error.message}`);
      return null;
    }
  }

  /**
   * 加载 E2E Case（优先从文件系统，然后数据库）
   */
  async loadCase(caseId: string): Promise<E2ECase | null> {
    // 1. 尝试从文件系统加载
    const fileCase = await this.loadCaseFromFile(caseId);
    if (fileCase) {
      return fileCase;
    }

    // 2. 尝试从数据库加载
    const dbCase = await this.loadCaseFromDatabase(caseId);
    if (dbCase) {
      return dbCase;
    }

    // 3. 尝试从内置示例加载（fallback）
    return this.loadCaseFromExamples(caseId);
  }

  /**
   * 从内置示例加载（fallback）
   */
  private async loadCaseFromExamples(caseId: string): Promise<E2ECase | null> {
    try {
      // 尝试从示例文件加载
      const examplePath = path.join(__dirname, 'e2e-cases', `${caseId}.ts`);
      // 注意：这里需要动态导入 TypeScript 文件，实际实现可能需要调整
      // 目前返回 null，表示需要手动创建 JSON 文件
      this.logger.debug(`尝试从示例加载 E2E Case: ${caseId}`);
      return null;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * 保存 E2E Case 到文件系统
   */
  async saveCase(testCase: E2ECase): Promise<void> {
    try {
      // 确保目录存在
      await fs.mkdir(this.casesDir, { recursive: true });

      // 保存为 JSON 文件
      const filePath = path.join(this.casesDir, `${testCase.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(testCase, null, 2), 'utf-8');
      this.logger.debug(`保存 E2E Case 到文件: ${testCase.id}`);
    } catch (error: any) {
      this.logger.error(`保存 E2E Case 失败: ${testCase.id}, 错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 列出所有可用的 E2E Cases
   */
  async listCases(): Promise<string[]> {
    try {
      // 列出文件系统中的所有 JSON 文件
      const files = await fs.readdir(this.casesDir);
      const cases = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''));
      return cases;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 目录不存在，返回空数组
        return [];
      }
      this.logger.error(`列出 E2E Cases 失败: ${error.message}`);
      return [];
    }
  }
}
