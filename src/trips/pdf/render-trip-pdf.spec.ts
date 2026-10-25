import { buildTripPdfDocument } from './build-trip-pdf-document';
import { renderTripPdf, resolveTripPdfFontPath } from './render-trip-pdf';

describe('renderTripPdf', () => {
  it('生成可打开的 PDF', async () => {
    const fontPath = resolveTripPdfFontPath();
    const document = buildTripPdfDocument({
      name: '冰岛南岸',
      destination: '冰岛',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-02T00:00:00.000Z',
      status: 'PLANNING',
      days: [
        {
          date: '2026-06-01T00:00:00.000Z',
          items: [
            {
              type: 'ACTIVITY',
              startTime: '2026-06-01T01:00:00.000Z',
              place: { nameCN: '雷克雅未克' },
              note: '市区散步',
            },
          ],
        },
      ],
    });

    const buffer = await renderTripPdf(document, fontPath);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
