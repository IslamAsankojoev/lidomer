'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { switchThemeWithWave } from '@/lib/theme-wave';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Сменить тему"
      onClick={(e) => {
        const next = resolvedTheme === 'dark' ? 'light' : 'dark';
        switchThemeWithWave(e.currentTarget, next, () => {
          // next-themes ставит класс в эффекте React — уже после снимка кадра.
          // Ставим его сами синхронно, чтобы «новый» кадр волны был в новой теме.
          const root = document.documentElement;
          root.classList.toggle('dark', next === 'dark');
          root.style.colorScheme = next;
          setTheme(next);
        });
      }}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
