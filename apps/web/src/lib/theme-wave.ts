'use client';

type Theme = 'light' | 'dark';

/*
 * Смена темы «волной» от кнопки. Два способа:
 * — View Transitions (Chrome, Edge): снимок новой темы раскрывается кругом поверх старой,
 *   CSS — в globals.css (theme-wave);
 * — WebKit (Safari и любой браузер на iPhone/iPad): там View Transitions на телефоне на миг
 *   показывают новую тему до начала волны (видно на записи с iPhone). Поэтому круг цвета
 *   новой темы растекается от кнопки, под ним меняется тема, и круг растворяется.
 * Включено «уменьшить движение» — тема просто меняется.
 */

/** Своя волна для WebKit: рост круга, растворение и ширина размытого края. */
const COLOR_WAVE = { grow: 1000, fade: 450, feather: 120 };
const EASING = 'cubic-bezier(0.45, 0, 0.15, 1)';

/** WebKit без Blink: Safari, а также Chrome, Edge и Firefox на iOS (у них «CriOS», «EdgiOS»…). */
const isWebKitOnly = () => {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg)\//.test(ua);
};

/** Применить смену темы без CSS-переходов: цвета меняются сразу, без доплывания. */
function withoutTransitions(fn: () => void) {
  const css = document.createElement('style');
  css.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(css);
  fn();
  void getComputedStyle(document.body).opacity;
  setTimeout(() => css.remove(), 1);
}

/** Круг цвета новой темы (класс темы даёт её --background), под ним меняется тема. */
function colorWave(x: number, y: number, radius: number, next: Theme, apply: () => void) {
  if (document.querySelector('[data-theme-wave]')) return; // волна уже идёт
  const { grow, fade, feather } = COLOR_WAVE;
  const el = document.createElement('div');
  el.dataset.themeWave = '';
  el.className = next;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'pointer-events:none',
    'background:var(--background)',
    `mask-image:radial-gradient(closest-side,#000 calc(100% - ${feather}px),transparent)`,
    'mask-repeat:no-repeat',
    'mask-size:0 0',
    `mask-position:${x}px ${y}px`,
  ].join(';');
  document.body.appendChild(el);

  const end = radius + feather;
  el.animate(
    [
      { maskSize: '0px 0px', maskPosition: `${x}px ${y}px` },
      { maskSize: `${end * 2}px ${end * 2}px`, maskPosition: `${x - end}px ${y - end}px` },
    ],
    { duration: grow, easing: EASING, fill: 'forwards' },
  )
    .finished.then(() => {
      withoutTransitions(apply);
      return el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: fade,
        easing: 'ease-out',
        fill: 'forwards',
      }).finished;
    })
    .finally(() => el.remove());
}

export function switchThemeWithWave(origin: HTMLElement, next: Theme, apply: () => void): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    apply();
    return;
  }

  const { left, top, width, height } = origin.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  // До самого дальнего угла экрана — волна закрывает всё.
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  if (isWebKitOnly() || !('startViewTransition' in document)) {
    colorWave(x, y, radius, next, apply);
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--theme-wave-x', `${x}px`);
  root.style.setProperty('--theme-wave-y', `${y}px`);
  root.style.setProperty('--theme-wave-radius', `${radius}px`);
  const cleanup = () => {
    root.style.removeProperty('--theme-wave-x');
    root.style.removeProperty('--theme-wave-y');
    root.style.removeProperty('--theme-wave-radius');
  };

  const transition = document.startViewTransition(apply);
  transition.finished.then(cleanup, cleanup);
}
