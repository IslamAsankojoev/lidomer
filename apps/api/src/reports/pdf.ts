import { PDFDocument } from 'pdf-lib';

/**
 * Страницы отчёта (PNG) → PDF, по странице на картинку, того же размера (1 px = 0,75 pt — 96 dpi).
 * Текст — картинкой: страницы рисует тот же next/og, что и PNG, без браузера и новых зависимостей.
 */
export async function pngToPdf(pages: ArrayBuffer[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('Отчёт для маркетинга');
  for (const png of pages) {
    const img = await doc.embedPng(png);
    const { width, height } = img.scale(0.75);
    doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  }
  return doc.save();
}
