-- Закрытый бакет для картинок отправленных отчётов (история в кабинете).
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false) ON CONFLICT (id) DO NOTHING;
