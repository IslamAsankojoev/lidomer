/** Подпись объявления: название, иначе короткий id Meta или ключ UTM. */
export function adTitle(c: { adName: string | null; adKey: string | null }): string {
  if (c.adName) return c.adName;
  const key = c.adKey;
  if (!key) return 'Без объявления';
  if (/^\d{10,}$/.test(key)) return `Объявление #…${key.slice(-6)}`;
  return key.replace(/^utm:/, '');
}
