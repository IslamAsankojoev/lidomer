import { describe, expect, it } from 'vitest';
import { detectImage } from './image';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe('detectImage', () => {
  it('узнаёт PNG, JPEG и WebP по сигнатуре', () => {
    expect(detectImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe('png');
    expect(detectImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.contentType).toBe('image/jpeg');
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
    expect(detectImage(webp)?.ext).toBe('webp');
  });

  it('SVG, текст и пустой файл — не картинка', () => {
    expect(detectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      null,
    );
    expect(detectImage(new TextEncoder().encode('hello'))).toBe(null);
    expect(detectImage(new Uint8Array())).toBe(null);
  });
});
