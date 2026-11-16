'use client';

/**
 * Смена темы «волной» от кнопки: View Transitions API рисует новый кадр поверх старого,
 * а CSS (globals.css, theme-wave) раскрывает его кругом с размытым краем.
 * Нет поддержки или включено «уменьшить движение» — тема просто меняется.
 */
export function switchThemeWithWave(origin: HTMLElement, apply: () => void): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('startViewTransition' in document) || reduce) {
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
