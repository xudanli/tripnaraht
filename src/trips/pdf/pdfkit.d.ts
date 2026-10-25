declare module 'pdfkit' {
  import { EventEmitter } from 'events';

  interface PdfPage {
    width: number;
    height: number;
    margins: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    };
  }

  interface PdfTextOptions {
    width?: number;
    align?: 'left' | 'center' | 'right' | 'justify';
    indent?: number;
    lineBreak?: boolean;
  }

  class PDFDocument extends EventEmitter {
    constructor(options?: {
      size?: string;
      margin?: number;
      bufferPages?: boolean;
      info?: { Title?: string; Author?: string; Subject?: string };
    });
    page: PdfPage;
    x: number;
    y: number;
    registerFont(name: string, src: string): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    widthOfString(text: string): number;
    text(text: string, options?: PdfTextOptions): this;
    text(text: string, x: number, y: number, options?: PdfTextOptions): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    addPage(): this;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(index: number): this;
    end(): void;
  }

  export default PDFDocument;
}
