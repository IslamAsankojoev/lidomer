'use client';

import {
  REPORT_BLOCK_LABELS,
  REPORT_BLOCKS,
  REPORT_FORMAT_LABELS,
  REPORT_FORMATS,
  type ReportFormat,
  REPORT_PERIOD_LABELS,
  REPORT_PERIODS,
  type ReportDto,
  type ReportInput,
  reportInputSchema,
  type ReportTemplate,
  TEMPLATE_DEFAULTS,
  type TelegramChatDto,
} from '@lidomer/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ReportPreview } from './report-preview';
import { useReportActions } from './use-reports';

const STEPS = ['Что', 'Когда', 'Куда', 'Проверка'] as const;
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TEMPLATE_LABELS: Record<ReportTemplate, string> = {
  day_summary: 'Итоги дня — 09:00, за вчера',
  day_pulse: 'Пульс дня — 13:00 и 18:00, за сегодня',
  week: 'Неделя — понедельник 10:00',
  month: 'Месяц — 1-го числа 10:00',
  custom: 'Свой',
};
const sel =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function scheduleText(s: ReportInput['schedule']): string {
  const days = s.weekdays.length
    ? s.weekdays.map((d) => DAYS[d - 1]).join(', ')
    : s.monthDays.length
      ? `${s.monthDays.join(', ')}-го числа`
      : 'каждый день';
  return `${days} · ${s.times.join(', ')}`;
}

const fromTemplate = (t: ReportTemplate): ReportInput => ({
  ...TEMPLATE_DEFAULTS[t],
  template: t,
  recipients: [],
  enabled: true,
});

/** Конструктор отчёта: что → когда → куда → проверка. */
export function ReportBuilder({
  open,
  onClose,
  report,
  chats,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDto | null;
  chats: TelegramChatDto[];
}) {
  const { save } = useReportActions();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<ReportInput>(() =>
    report ? { ...report } : fromTemplate('day_summary'),
  );
  const [timesText, setTimesText] = useState(v.schedule.times.join(', '));
  const set = (patch: Partial<ReportInput>) => setV((x) => ({ ...x, ...patch }));
  const recipientKey = (chatId: string, threadId: string | null) => `${chatId}|${threadId ?? ''}`;
  const chosen = new Set(v.recipients.map((r) => recipientKey(r.chatId, r.threadId)));

  const toggleRecipient = (chatId: string, threadId: string | null) => {
    const k = recipientKey(chatId, threadId);
    set({
      recipients: chosen.has(k)
        ? v.recipients.filter((r) => recipientKey(r.chatId, r.threadId) !== k)
        : [...v.recipients, { chatId, threadId }],
    });
  };

  const submit = () => {
    const times = timesText.split(/[,\s]+/).filter(Boolean);
    const parsed = reportInputSchema.safeParse({ ...v, schedule: { ...v.schedule, times } });
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    save.mutate({ id: report?.id, body: parsed.data }, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{report ? 'Изменить отчёт' : 'Новый отчёт'}</SheetTitle>
          <SheetDescription>Отправка в Telegram картинкой или PDF с подписью</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <ol className="flex gap-1" aria-label="Шаги">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={step === i ? 'step' : undefined}
                  className={cn(
                    'w-full rounded-md border px-2 py-1 text-xs',
                    step === i ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )}
                >
                  {i + 1}. {s}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="flex flex-col gap-3">
              {!report && (
                <label className="flex flex-col gap-1 text-sm">
                  Шаблон
                  <select
                    className={sel}
                    value={v.template}
                    onChange={(e) => {
                      const next = fromTemplate(e.target.value as ReportTemplate);
                      setV({ ...next, recipients: v.recipients });
                      setTimesText(next.schedule.times.join(', '));
                    }}
                  >
                    {Object.entries(TEMPLATE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Название
                <Input value={v.name} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Период
                <select
                  className={sel}
                  value={v.config.period}
                  onChange={(e) =>
                    set({
                      config: {
                        ...v.config,
                        period: e.target.value as ReportInput['config']['period'],
                      },
                    })
                  }
                >
                  {REPORT_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {REPORT_PERIOD_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1 text-sm">
                Формат
                <ToggleGroup
                  variant="segment"
                  size="sm"
                  value={[v.config.format]}
                  onValueChange={(x: string[]) =>
                    x[0] && set({ config: { ...v.config, format: x[0] as ReportFormat } })
                  }
                  aria-label="Формат отправки"
                >
                  {REPORT_FORMATS.map((f) => (
                    <ToggleGroupItem key={f} value={f}>
                      {REPORT_FORMAT_LABELS[f]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <span className="text-xs text-muted-foreground">
                  {v.config.format === 'pdf'
                    ? 'Файлом: удобно сохранить и переслать. Подпись — та же.'
                    : 'Картинкой прямо в чате, с подписью.'}
                </span>
              </div>
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="mb-1">Блоки</legend>
                {REPORT_BLOCKS.map((b) => (
                  <label key={b} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={v.config.blocks.includes(b)}
                      onChange={(e) =>
                        set({
                          config: {
                            ...v.config,
                            blocks: e.target.checked
                              ? [...v.config.blocks, b]
                              : v.config.blocks.filter((x) => x !== b),
                          },
                        })
                      }
                    />
                    {REPORT_BLOCK_LABELS[b]}
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex flex-col gap-1">
                Время (по поясу компании), через запятую
                <Input
                  value={timesText}
                  onChange={(e) => setTimesText(e.target.value)}
                  placeholder="09:00, 18:00"
                />
              </label>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1">Дни недели (ничего не выбрано — каждый день)</legend>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, i) => {
                    const on = v.schedule.weekdays.includes(i + 1);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set({
                            schedule: {
                              ...v.schedule,
                              weekdays: on
                                ? v.schedule.weekdays.filter((x) => x !== i + 1)
                                : [...v.schedule.weekdays, i + 1].sort(),
                            },
                          })
                        }
                        className={cn('rounded-md border px-2 py-1', on && 'bg-accent font-medium')}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1">
                Числа месяца, через запятую (пусто — любое)
                <Input
                  value={v.schedule.monthDays.join(', ')}
                  onChange={(e) =>
                    set({
                      schedule: {
                        ...v.schedule,
                        monthDays: e.target.value
                          .split(/[,\s]+/)
                          .map(Number)
                          .filter((n) => n >= 1 && n <= 31),
                      },
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={v.enabled}
                  onChange={(e) => set({ enabled: e.target.checked })}
                />
                Отправлять по расписанию
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2 text-sm">
              {!chats.length ? (
                <p className="text-muted-foreground">
                  Нет подключённых групп — добавьте бота в группу и отправьте там команду из блока
                  «Получатели».
                </p>
              ) : (
                chats.map((c) => (
                  <div key={c.id} className="flex flex-col gap-1 rounded-lg border p-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={chosen.has(recipientKey(c.id, null))}
                        onChange={() => toggleRecipient(c.id, null)}
                        disabled={!c.active}
                      />
                      {c.title}
                      {!c.active && (
                        <span className="text-xs text-destructive">бот удалён из группы</span>
                      )}
                    </label>
                    {c.topics.map((t) => (
                      <label key={t.id} className="ml-6 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={chosen.has(recipientKey(c.id, t.id))}
                          onChange={() => toggleRecipient(c.id, t.id)}
                          disabled={!c.active}
                        />
                        Тема: {t.name}
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Название</dt>
                <dd>{v.name}</dd>
                <dt className="text-muted-foreground">Период</dt>
                <dd>{REPORT_PERIOD_LABELS[v.config.period]}</dd>
                <dt className="text-muted-foreground">Блоки</dt>
                <dd>{v.config.blocks.map((b) => REPORT_BLOCK_LABELS[b]).join(', ')}</dd>
                <dt className="text-muted-foreground">Когда</dt>
                <dd>
                  {scheduleText({
                    ...v.schedule,
                    times: timesText.split(/[,\s]+/).filter(Boolean),
                  })}
                </dd>
                <dt className="text-muted-foreground">Куда</dt>
                <dd>
                  {v.recipients.length
                    ? `${v.recipients.length} получ.`
                    : 'никуда — выберите на шаге 3'}
                </dd>
                <dt className="text-muted-foreground">Формат</dt>
                <dd>{REPORT_FORMAT_LABELS[v.config.format]}</dd>
              </dl>
              {v.config.blocks.length > 0 && <ReportPreview name={v.name} config={v.config} />}
            </div>
          )}

          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Назад
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>Дальше</Button>
            ) : (
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            )}
          </div>
          {step === 3 && (
            <p className="text-xs text-muted-foreground">
              Цифры в предпросмотре — за период на текущий момент. После сохранения можно отправить
              тест в группу.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
