import { expect, test } from '@playwright/test';

/**
 * ТЗ, Этап 4: вход → «Обзор» → клик по цифре → список лидов, и число лидов в списке равно цифре.
 * Нужен тестовый пользователь компании: E2E_EMAIL и E2E_PASSWORD (без них тест пропускается).
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, 'Нет E2E_EMAIL / E2E_PASSWORD');

test('вход → обзор → клик по цифре → лиды этой цифры', async ({ page }) => {
  await page.goto('/?period=last30');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Пароль').fill(password!);
  await page.getByRole('button', { name: 'Войти' }).click();

  // После входа грузятся профиль и компания — на холодном dev-сервере это дольше 5 с.
  await expect(page.getByRole('heading', { name: 'Обзор' })).toBeVisible({ timeout: 15_000 });
  const tile = page.getByRole('link', { name: 'Лиды с рекламы · факт: показать лидов' });
  await expect(tile).toBeVisible();
  const value = Number((await tile.innerText()).split('\n')[0]!.replace(/\D/g, ''));

  await tile.click();
  await expect(page).toHaveURL(/\/leads\?.*metric=adLeads/);
  // Подпись «Из чего сложилось: «Лиды с рекламы» — N» совпадает с цифрой на «Обзоре».
  await expect(page.getByText(/Из чего сложилось: «Лиды с рекламы» — [\d\s ]+$/)).toBeVisible();
  const caption = await page.getByText(/Из чего сложилось/).innerText();
  expect(Number(caption.replace(/^.*—/, '').replace(/\D/g, ''))).toBe(value);
  // Первый лид виден: строка таблицы на компьютере или карточка списка на телефоне.
  if (value > 0)
    await expect(
      page.getByRole('row').nth(1).or(page.getByRole('listitem')).filter({ visible: true }).first(),
    ).toBeVisible();
});
