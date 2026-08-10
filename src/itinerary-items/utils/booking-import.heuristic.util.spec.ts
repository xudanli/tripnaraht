import { recognizeBookingImportDraft } from './booking-import.heuristic.util';

describe('recognizeBookingImportDraft', () => {
  it('extracts confirmation + dates from email paste', () => {
    const text = `
Dear Guest,
Hotel: Blue Lagoon Retreat
Confirmation number: BLG-928471
Guest name: Danny Wang
Check-in: 2026-08-01
Check-out: 2026-08-03
Manage booking: https://www.booking.com/confirmation/BLG-928471?bn=928471
`;
    const res = recognizeBookingImportDraft({
      text,
      sourceHint: 'email_paste',
    });
    expect(res.status).toBe('ready');
    expect(res.draft.confirmation).toBe('BLG-928471');
    expect(res.draft.placeName).toMatch(/Blue Lagoon/i);
    expect(res.draft.guestName).toMatch(/Danny/i);
    expect(res.draft.checkInDate).toBe('2026-08-01');
    expect(res.draft.checkOutDate).toBe('2026-08-03');
    expect(res.draft.platform).toBe('booking.com');
    expect(res.draft.bookingUrl).toContain('booking.com');
    expect(res.draft.source).toBe('email_paste');
    expect(res.warnings).not.toContain('confirmation_not_found');
  });

  it('extracts confirmation from booking URL query', () => {
    const res = recognizeBookingImportDraft({
      text: 'https://www.booking.com/hotel/is/foo.html?confirmation_number=ABC12345',
      sourceHint: 'booking_url',
    });
    expect(res.status).toBe('ready');
    expect(res.draft.confirmation).toBe('ABC12345');
    expect(res.draft.platform).toBe('booking.com');
    expect(res.draft.source).toBe('booking_url');
  });

  it('warns when confirmation missing', () => {
    const res = recognizeBookingImportDraft({
      text: 'Hotel: Somewhere Inn\nSee you soon!',
      sourceHint: 'email_paste',
      placeNameHint: 'Somewhere Inn',
    });
    expect(res.status).toBe('ready');
    expect(res.warnings).toContain('confirmation_not_found');
    expect(res.draft.placeName).toBe('Somewhere Inn');
  });

  it('uses filename as place fallback for binary upload', () => {
    const res = recognizeBookingImportDraft({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      contentType: 'image/jpeg',
      fileName: 'Hotel_Borg_Reykjavik_order.jpg',
      sourceHint: 'order_ocr',
    });
    expect(res.status).toBe('ready');
    expect(res.draft.placeName).toMatch(/Hotel Borg/i);
    expect(res.warnings).toContain('confirmation_not_found');
    expect(res.warnings).toContain('ocr_text_unavailable');
  });

  it('fails on empty payload', () => {
    const res = recognizeBookingImportDraft({ text: '   ' });
    expect(res.status).toBe('failed');
  });
});
