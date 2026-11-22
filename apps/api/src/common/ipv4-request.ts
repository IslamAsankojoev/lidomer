import { request } from 'node:https';

export type Ipv4Request = {
  method: 'GET' | 'POST';
  url: string;
  body?: Buffer;
  contentType?: string;
  timeoutMs: number;
};
export type Ipv4Response = { status: number; text: string };

/**
 * HTTPS-запрос только по IPv4 с таймаутом. Функции Vercel не выходят в IPv6, а часть API
 * (api.telegram.org) отдаёт AAAA-адрес первым — обычный fetch висел до 120 с.
 * Текст ошибки не содержит адреса: в пути бывают токены (Telegram, Green API).
 */
export function requestIpv4({
  method,
  url,
  body,
  contentType,
  timeoutMs,
}: Ipv4Request): Promise<Ipv4Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (body) {
      headers['Content-Type'] = contentType ?? 'application/octet-stream';
      headers['Content-Length'] = body.length;
    }
    const req = request(url, { method, family: 4, timeout: timeoutMs, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
      );
      res.on('error', () => reject(new Error('обрыв соединения')));
    });
    req.on('timeout', () => req.destroy(new Error(`нет ответа за ${timeoutMs / 1000} с`)));
    // Сообщения сетевых ошибок Node могут содержать адрес — наружу отдаём только код.
    req.on('error', (err: NodeJS.ErrnoException) =>
      reject(
        err.message.startsWith('нет ответа')
          ? err
          : new Error(`сеть недоступна${err.code ? ` (${err.code})` : ''}`),
      ),
    );
    req.end(body);
  });
}
