-- Публичный бакет для логотипов компаний (показываются в меню кабинета). Логотип — не персональные
-- данные; запись — только через api (секретный ключ), RLS на storage.objects не открываем.
-- Только растровые картинки до 512 КБ: SVG не принимаем, в нём может быть скрипт.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 524288, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
