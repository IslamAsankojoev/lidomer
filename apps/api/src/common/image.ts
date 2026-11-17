/** Тип картинки по первым байтам файла — расширению и Content-Type клиента не верим. */
export type ImageKind = { ext: 'png' | 'jpg' | 'webp'; contentType: string };

export function detectImage(buf: Uint8Array): ImageKind | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => buf[i + k] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { ext: 'png', contentType: 'image/png' };
  if (at(0, [0xff, 0xd8, 0xff])) return { ext: 'jpg', contentType: 'image/jpeg' };
  // RIFF....WEBP
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]))
    return { ext: 'webp', contentType: 'image/webp' };
  return null;
}
