/**
 * File Extractor Direct Service
 * 
 * 直接实现文件提取功能，不依赖外部 MCP 服务
 * 无需认证，完全自主控制
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
// pdf-parse v2.4.5 使用 PDFParse 类
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface FileMetadata {
  source: string;
  filename: string;
  format: string;
  size: number;
  mimeType?: string;
  pages?: number; // PDF, PPTX
  sheets?: string[]; // Excel
  [key: string]: any;
}

export interface FileContent {
  content: string | any;
  page?: number;
  totalPages?: number;
  sheet?: string;
  [key: string]: any;
}

@Injectable()
export class FileExtractorDirectService implements OnModuleInit {
  private readonly logger = new Logger(FileExtractorDirectService.name);
  private axiosInstance: AxiosInstance;
  private isAvailable: boolean = true;

  async onModuleInit() {
    // 初始化 HTTP 客户端（支持代理）
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    const httpsAgent = proxyUrl
      ? new HttpsProxyAgent<string>(proxyUrl)
      : new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
          rejectUnauthorized: true,
        });

    this.axiosInstance = axios.create({
      timeout: 60000, // 60秒超时
      httpsAgent,
      proxy: false,
      maxContentLength: 100 * 1024 * 1024, // 100MB 最大文件大小
      maxBodyLength: 100 * 1024 * 1024,
      headers: {
        'User-Agent': 'TripNARA/1.0',
      },
    });

    this.isAvailable = true;
    this.logger.log('File Extractor Direct Service initialized');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * 从 URL 下载文件
   */
  private async downloadFile(url: string): Promise<Buffer> {
    try {
      const response = await this.axiosInstance.get(url, {
        responseType: 'arraybuffer',
        validateStatus: (status) => status >= 200 && status < 400, // 允许 2xx 和 3xx
      });
      
      if (!response.data || response.data.length === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      return Buffer.from(response.data);
    } catch (error: any) {
      const errorMessage = error.response 
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message;
      this.logger.error(`Failed to download file from ${url}:`, errorMessage);
      throw new Error(`Failed to download file from ${url}: ${errorMessage}`);
    }
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(url: string): string {
    const urlPath = url.split('?')[0]; // 移除查询参数
    const parts = urlPath.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  /**
   * 提取文件元数据
   */
  async extractMetadata(url: string): Promise<FileMetadata> {
    try {
      const buffer = await this.downloadFile(url);
      const ext = this.getFileExtension(url);
      const filename = url.split('/').pop()?.split('?')[0] || 'unknown';

      const metadata: FileMetadata = {
        source: url,
        filename,
        format: ext.toUpperCase(),
        size: buffer.length,
      };

      // 根据文件类型提取额外元数据
      switch (ext) {
        case 'pdf':
          try {
            // pdf-parse v2.4.5 使用 PDFParse 类，接受 { data: buffer } 或 { url }
            const parser = new PDFParse({ data: buffer });
            const infoResult = await parser.getInfo({ parsePageInfo: false });
            metadata.pages = infoResult.total || 0;
            metadata.mimeType = 'application/pdf';
            metadata.title = infoResult.info?.Title;
            metadata.author = infoResult.info?.Author;
            await parser.destroy();
          } catch (error: any) {
            this.logger.warn('Failed to parse PDF metadata:', error.message);
            // 设置基本元数据
            metadata.mimeType = 'application/pdf';
          }
          break;

        case 'xlsx':
        case 'xls':
          try {
            if (ext === 'xls') {
              this.logger.warn('xls format not fully supported by exceljs, metadata may be limited');
            }
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer as any);
            metadata.sheets = workbook.worksheets.map((w) => w.name);
            metadata.mimeType = ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel';
          } catch (error: any) {
            this.logger.warn('Failed to parse Excel metadata:', error.message);
          }
          break;

        case 'csv':
          metadata.mimeType = 'text/csv';
          break;

        case 'docx':
          metadata.mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;

        case 'doc':
          metadata.mimeType = 'application/msword';
          break;

        case 'pptx':
          metadata.mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          // PPTX 解析需要额外库，这里先设置基本元数据
          break;
      }

      return metadata;
    } catch (error: any) {
      this.logger.error('Failed to extract metadata:', error);
      throw error;
    }
  }

  /**
   * 提取文件内容
   */
  async extractFileContent(
    url: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      sheet?: string;
      caseSensitive?: boolean;
    }
  ): Promise<FileContent> {
    try {
      const buffer = await this.downloadFile(url);
      const ext = this.getFileExtension(url);

      switch (ext) {
        case 'pdf':
          return await this.extractPdfContent(buffer, options);

        case 'docx':
          return await this.extractDocxContent(buffer, options);

        case 'xlsx':
        case 'xls':
          return await this.extractExcelContent(buffer, options);

        case 'csv':
          return await this.extractCsvContent(buffer, options);

        case 'pptx':
          throw new Error('PPTX extraction not yet implemented. Please use PDF conversion.');

        default:
          throw new Error(`Unsupported file format: ${ext}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to extract file content:', error);
      throw error;
    }
  }

  /**
   * 提取 PDF 内容
   */
  private async extractPdfContent(
    buffer: Buffer,
    options?: { page?: number; limit?: number }
  ): Promise<FileContent> {
    try {
      // pdf-parse v2.4.5 使用 PDFParse 类，接受 { data: buffer }
      const parser = new PDFParse({ data: buffer });
      
      // 先获取总页数
      const infoResult = await parser.getInfo({ parsePageInfo: false });
      const totalPages = infoResult.total || 0;

      // 如果指定了页码，只提取该页
      let textResult: any;
      if (options?.page !== undefined) {
        if (options.page < 1 || options.page > totalPages) {
          await parser.destroy();
          throw new Error(`Page ${options.page} is out of range (1-${totalPages})`);
        }
        // 使用 partial 参数提取特定页面（页码从 1 开始）
        textResult = await parser.getText({ partial: [options.page] });
      } else {
        // 提取所有页面
        textResult = await parser.getText();
      }

      let content = textResult.text || '';

      // 限制内容长度
      if (options?.limit && content.length > options.limit) {
        content = content.substring(0, options.limit) + '...';
      }

      await parser.destroy();

      return {
        content,
        page: options?.page || 1,
        totalPages,
      };
    } catch (error: any) {
      throw new Error(`Failed to extract PDF content: ${error.message}`);
    }
  }

  /**
   * 提取 DOCX 内容
   */
  private async extractDocxContent(
    buffer: Buffer,
    options?: { limit?: number }
  ): Promise<FileContent> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      let content = result.value;

      // 限制内容长度
      if (options?.limit && content.length > options.limit) {
        content = content.substring(0, options.limit) + '...';
      }

      return {
        content,
      };
    } catch (error: any) {
      throw new Error(`Failed to extract DOCX content: ${error.message}`);
    }
  }

  /**
   * 提取 Excel 内容
   */
  private async extractExcelContent(
    buffer: Buffer,
    options?: { search?: string; sheet?: string; caseSensitive?: boolean }
  ): Promise<FileContent> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheetNames = workbook.worksheets.map((w) => w.name);
      const sheetName = options?.sheet || sheetNames[0];

      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${sheetNames.join(', ')}`);
      }

      const data: any[][] = [];
      worksheet.eachRow({ includeEmpty: true }, (row) => {
        const values = row.values as any[];
        const rowData = values ? values.slice(1).map((v) => (v != null ? v : '')) : [];
        data.push(rowData);
      });

      let filteredData = data;
      if (options?.search) {
        const searchTerm = options.caseSensitive
          ? options.search
          : options.search.toLowerCase();

        filteredData = data.filter((row: any) => {
          const rowText = JSON.stringify(row);
          const searchText = options.caseSensitive ? rowText : rowText.toLowerCase();
          return searchText.includes(searchTerm);
        });
      }

      return {
        content: filteredData,
        sheet: sheetName,
      };
    } catch (error: any) {
      throw new Error(`Failed to extract Excel content: ${error.message}`);
    }
  }

  /**
   * 提取 CSV 内容
   */
  private async extractCsvContent(
    buffer: Buffer,
    options?: { search?: string; caseSensitive?: boolean }
  ): Promise<FileContent> {
    try {
      const csvText = buffer.toString('utf-8');
      const data = parseCsv(csvText, { relax_column_count: true }) as string[][];

      let filteredData = data;
      if (options?.search) {
        const searchTerm = options.caseSensitive
          ? options.search
          : options.search.toLowerCase();

        filteredData = data.filter((row: any) => {
          const rowText = JSON.stringify(row);
          const searchText = options.caseSensitive ? rowText : rowText.toLowerCase();
          return searchText.includes(searchTerm);
        });
      }

      return {
        content: filteredData,
      };
    } catch (error: any) {
      throw new Error(`Failed to extract CSV content: ${error.message}`);
    }
  }
}
