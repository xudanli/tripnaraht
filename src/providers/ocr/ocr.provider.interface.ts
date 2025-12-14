// src/providers/ocr/ocr.provider.interface.ts

/**
 * OCR 提供者接口
 * 
 * 支持多种 OCR 实现（Google Vision、Azure Vision、AWS Textract、Mock）
 */
export interface OcrProvider {
  /**
   * 从图片中提取文字
   * 
   * @param image 图片 Buffer
   * @param opts 选项
   * @returns 提取的文字结果
   */
  extractText(
    image: Buffer,
    opts?: {
      locale?: string;  // 语言代码，如 'zh-CN', 'ja-JP', 'en-US'
      mimeType?: string; // 图片 MIME 类型
    }
  ): Promise<{
    /** 完整文本 */
    fullText: string;
    /** 按行分割的文本 */
    lines: string[];
    /** 文本块（带位置信息，可选） */
    blocks?: Array<{
      text: string;
      confidence?: number;
    }>;
  }>;
}
