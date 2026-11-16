'use client';

import { env } from '@/lib/env';

interface FbLoginResponse {
  status: string;
  authResponse?: { code?: string } | null;
}
interface FbSdk {
  init(opts: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }): void;
  login(cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: FbSdk;
  }
}

/** Версия Graph API — та же, что у api. */
const GRAPH_VERSION = 'v27.0';
let sdk: Promise<FbSdk> | null = null;

export const facebookLoginAvailable = Boolean(
  env.NEXT_PUBLIC_META_APP_ID && env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID,
);

function loadSdk(): Promise<FbSdk> {
  sdk ??= new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.onload = () => {
      if (!window.FB) return reject(new Error('Facebook SDK не загрузился'));
      window.FB.init({
        appId: env.NEXT_PUBLIC_META_APP_ID!,
        version: GRAPH_VERSION,
        cookie: false,
        xfbml: false,
      });
      resolve(window.FB);
    };
    s.onerror = () => {
      sdk = null;
      reject(new Error('Facebook SDK не загрузился — проверьте блокировщик рекламы'));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

/**
 * Facebook Login for Business с конфигурацией «токен системного пользователя».
 * Возвращает одноразовый код — его обменивает на токен api (секрет приложения есть только там).
 */
export async function facebookLoginCode(): Promise<string> {
  const FB = await loadSdk();
  return new Promise((resolve, reject) =>
    FB.login(
      (r) =>
        r.authResponse?.code
          ? resolve(r.authResponse.code)
          : reject(new Error('Вход в Facebook отменён')),
      {
        config_id: env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
      },
    ),
  );
}
