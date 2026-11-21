import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pngToPdf } from './pdf';

// PNG 2×1: красный и синий пиксель; PNG 1×1.
const png = (b64: string) => {
  const b = Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};
const WIDE = png(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAQBAIA2sx4GQAAAABJRU5ErkJggg==',
);
const DOT = png(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
);

describe('pngToPdf', () => {
  it('по странице на картинку, каждая своего размера (96 dpi), и заголовок документа', async () => {
    const bytes = await pngToPdf([WIDE, DOT], 'Итоги дня');
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 1.5, height: 0.75 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 0.75, height: 0.75 });
    expect(doc.getTitle()).toBe('Итоги дня');
  });
});
