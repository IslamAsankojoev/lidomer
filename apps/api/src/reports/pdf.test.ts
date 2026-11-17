import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pngToPdf } from './pdf';

// PNG 2×1: красный и синий пиксель.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAQBAIA2sx4GQAAAABJRU5ErkJggg==',
  'base64',
);

describe('pngToPdf', () => {
  it('одна страница размером с картинку (96 dpi) и заголовок документа', async () => {
    const bytes = await pngToPdf(
      PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length),
      'Итоги дня',
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 1.5, height: 0.75 });
    expect(doc.getTitle()).toBe('Итоги дня');
  });
});
