-- Закрытый бакет для копий превью креативов Meta (ссылки Meta временные). Читает только api.
INSERT INTO storage.buckets (id, name, public) VALUES ('previews', 'previews', false) ON CONFLICT (id) DO NOTHING;
