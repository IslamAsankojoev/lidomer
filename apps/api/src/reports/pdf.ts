import { PDFDocument } from 'pdf-lib';

/**
 * Картинка отчёта → одностраничный PDF того же размера (1 px = 0,75 pt — 96 dpi).
 * Цифры и вёрстка те же, что у PNG: PDF — только упаковка для тех, кому удобнее файл.
 */
export async function pngToPdf(png: ArrayBuffer, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('Отчёт для маркетинга');
  const img = await doc.embedPng(png);
  const { width, height } = img.scale(0.75);
  doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  return doc.save();
}
