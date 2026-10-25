import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import type { TripPdfDocument, TripPdfItemView } from './build-trip-pdf-document';

type PdfDoc = InstanceType<typeof PDFDocument>;

const FONT_CANDIDATES = [
  process.env.TRIP_PDF_FONT,
  '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
].filter((path): path is string => !!path);

const PAGE_MARGIN = 48;
const INK = '#1f2933';
const MUTED = '#52606d';
const RULE = '#d9e2ec';

export function resolveTripPdfFontPath(candidates = FONT_CANDIDATES): string {
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error('未找到可嵌入的中文字体，无法导出行程 PDF');
  }
  return found;
}

export function renderTripPdf(document: TripPdfDocument, fontPath = resolveTripPdfFontPath()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: document.title,
        Author: 'TripNara',
        Subject: document.subtitle,
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    try {
      pdf.registerFont('cjk', fontPath);
      pdf.font('cjk');
      drawDocument(pdf, document);
      stampPageNumbers(pdf);
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawDocument(pdf: PdfDoc, document: TripPdfDocument): void {
  drawText(pdf, document.title, { size: 20, color: INK });
  pdf.moveDown(0.25);
  drawText(pdf, document.subtitle, { size: 11, color: MUTED });
  pdf.moveDown(0.6);
  for (const line of document.metaLines) {
    drawText(pdf, line, { size: 10, color: INK });
  }
  pdf.moveDown(0.4);
  rule(pdf);

  if (document.emptyMessage) {
    pdf.moveDown(0.8);
    drawText(pdf, document.emptyMessage, { size: 11, color: MUTED });
  }

  document.days.forEach((day, index) => {
    if (index > 0) pdf.moveDown(0.8);
    else pdf.moveDown(0.5);
    ensureSpace(pdf, 64);
    drawText(pdf, day.heading, { size: 13, color: INK });
    pdf.moveDown(0.25);
    rule(pdf);
    pdf.moveDown(0.35);
    if (day.emptyLabel) {
      drawText(pdf, day.emptyLabel, { size: 10, color: MUTED });
      return;
    }
    day.items.forEach((item, itemIndex) => {
      if (itemIndex > 0) pdf.moveDown(0.45);
      drawItem(pdf, item);
    });
  });
}

function drawItem(pdf: PdfDoc, item: TripPdfItemView): void {
  ensureSpace(pdf, 36);
  drawText(pdf, `${item.timeLabel}   ${item.title}`, { size: 11, color: INK });
  for (const line of item.lines) {
    drawText(pdf, line, { size: 9, color: MUTED, indent: 12 });
  }
}

function drawText(
  pdf: PdfDoc,
  raw: string,
  options: { size: number; color: string; indent?: number },
): void {
  const text = normalizePdfText(raw);
  const indent = options.indent ?? 0;
  const maxWidth = contentWidth(pdf) - indent;
  const lineHeight = Math.round(options.size * 1.45);
  const startX = pdf.page.margins.left + indent;
  let y = pdf.y;
  let lineWidth = 0;
  let runs: Array<{ font: 'cjk' | 'Helvetica'; chars: string[] }> = [];

  const flush = () => {
    if (!runs.length) return;
    const bottom = pdf.page.height - pdf.page.margins.bottom;
    if (y + lineHeight > bottom) {
      pdf.addPage();
      y = pdf.page.margins.top;
    }
    let x = startX;
    for (const run of runs) {
      const value = run.chars.join('');
      pdf.font(run.font).fontSize(options.size).fillColor(options.color);
      pdf.text(value, x, y, { lineBreak: false });
      x += pdf.widthOfString(value);
    }
    y += lineHeight;
    runs = [];
    lineWidth = 0;
  };

  for (const ch of Array.from(text)) {
    if (ch === '\n') {
      flush();
      continue;
    }
    const font = isCjkChar(ch) ? 'cjk' : 'Helvetica';
    const width = pdf.font(font).fontSize(options.size).widthOfString(ch);
    if (lineWidth + width > maxWidth && lineWidth > 0) flush();
    const last = runs[runs.length - 1];
    if (last?.font === font) last.chars.push(ch);
    else runs.push({ font, chars: [ch] });
    lineWidth += width;
  }
  flush();
  pdf.x = pdf.page.margins.left;
  pdf.y = y;
}

function isCjkChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3000 && code <= 0x303f)
  );
}

function normalizePdfText(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function stampPageNumbers(pdf: PdfDoc): void {
  const range = pdf.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    pdf.switchToPage(pageIndex);
    const label = `${pageIndex + 1} / ${range.count}`;
    const previousBottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf.font('Helvetica').fontSize(8).fillColor(MUTED);
    pdf.text(label, pdf.page.margins.left, pdf.page.height - 28, {
      width: contentWidth(pdf),
      align: 'right',
      lineBreak: false,
    });
    pdf.page.margins.bottom = previousBottom;
  }
}

function rule(pdf: PdfDoc): void {
  const y = pdf.y;
  pdf
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(pdf.page.margins.left, y)
    .lineTo(pdf.page.width - pdf.page.margins.right, y)
    .stroke();
  pdf.y = y + 6;
}

function ensureSpace(pdf: PdfDoc, needed: number): void {
  const bottom = pdf.page.height - pdf.page.margins.bottom;
  if (pdf.y + needed > bottom) {
    pdf.addPage();
  }
}

function contentWidth(pdf: PdfDoc): number {
  return pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
}
