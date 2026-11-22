'use client';

import {
  REPORT_BLOCK_LABELS,
  REPORT_EDITABLE_BLOCKS,
  REPORT_FORMAT_LABELS,
  REPORT_FORMATS,
  type ReportFormat,
  REPORT_PERIOD_LABELS,
  REPORT_PERIODS,
  type ReportDto,
  type ReportInput,
  reportInputSchema,
  type ReportTemplate,
  type ReportTarget,
  TEMPLATE_DEFAULTS,
} from '@lidomer/shared';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SourceBadge } from '@/components/source-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ReportPreview } from './report-preview';
import { ChannelCounts, targetKey, targetLabel } from './targets';
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

/**
 * Конструктор отчёта: что → когда → куда → проверка. Показан, пока смонтирован:
 * закрывается сам (с анимацией) и только потом зовёт `onClose`.
 */
export function ReportBuilder({
  onClose,
  report,
  targets,
  whatsappConnected,
}: {
  onClose: () => void;
  report: ReportDto | null;
  targets: ReportTarget[];
  whatsappConnected: boolean;
}) {
  const [waQuery, setWaQuery] = useState('');
  const { save } = useReportActions();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  // Блок «Креативы» больше ничего не решает (креативы — в PDF): у старых отчётов убираем его,
  // и при сохранении он не попадёт в базу.
  const [v, setV] = useState<ReportInput>(() =>
    report
      ? {
          ...report,
          config: {
            ...report.config,
            blocks: report.config.blocks.filter((b) => b !== 'creatives'),
          },
        }
      : fromTemplate('day_summary'),
  );
  const [timesText, setTimesText] = useState(v.schedule.times.join(', '));
  const set = (patch: Partial<ReportInput>) => setV((x) => ({ ...x, ...patch }));
  const chosen = new Set(v.recipients.map(targetKey));
  const toggleRecipient = (t: ReportTarget) => {
    const k = targetKey(t);
    set({
      recipients: chosen.has(k)
        ? v.recipients.filter((r) => targetKey(r) !== k)
        : [...v.recipients, { channel: t.channel, chatId: t.chatId, threadId: t.threadId }],
    });
  };
  const tgTargets = targets.filter((t) => t.channel === 'telegram');
  const waTargets = targets.filter((t) => t.channel === 'green_api');
  const waShown = waTargets.filter((t) =>
    t.chatTitle.toLowerCase().includes(waQuery.trim().toLowerCase()),
  );
  const check = (t: ReportTarget, label: string, className?: string) => (
    <label key={targetKey(t)} className={cn('flex items-center gap-2', className)}>
      <input
        type="checkbox"
        checked={chosen.has(targetKey(t))}
        onChange={() => toggleRecipient(t)}
        disabled={!t.active && !chosen.has(targetKey(t))}
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );

  const submit = () => {
    const times = timesText.split(/[,\s]+/).filter(Boolean);
    const parsed = reportInputSchema.safeParse({ ...v, schedule: { ...v.schedule, times } });
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    save.mutate({ id: report?.id, body: parsed.data }, { onSuccess: () => setOpen(false) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(o) => !o && onClose()}
      // Клик мимо окна не закрывает: не потерять заполненное.
      disablePointerDismissal
    >
      {/* Высота постоянная: кнопки внизу не прыгают от шага к шагу. */}
      <DialogContent className="dialog-centered:h-[min(46rem,calc(100dvh-4rem))]">
        <DialogHeader>
          <DialogTitle>{report ? 'Изменить отчёт' : 'Новый отчёт'}</DialogTitle>
          <DialogDescription>
            {report ? report.name : 'В Telegram и WhatsApp — картинкой или PDF'}
          </DialogDescription>
        </DialogHeader>
        {/* key: новый шаг открывается с начала, а не с места прокрутки прошлого. */}
        <DialogBody key={step}>
          {/* Сегменты, как «Формат» ниже. */}
          <ol className="grid grid-cols-4 gap-0.5 rounded-[9px] bg-muted p-0.5" aria-label="Шаги">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={step === i ? 'step' : undefined}
                  className={cn(
                    'h-9 w-full rounded-[7px] px-1 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dialog-centered:h-7',
                    step === i
                      ? 'bg-card font-medium text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.08)] dark:bg-foreground/15'
                      : 'text-muted-foreground hover:text-foreground',
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
                    ? 'Файл: первая страница — главные цифры, дальше все креативы с превью, лидами и расходом.'
                    : 'Картинка прямо в чате: главные цифры. Креативы — только в PDF.'}
                </span>
              </div>
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="mb-1">Блоки</legend>
                {REPORT_EDITABLE_BLOCKS.map((b) => (
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
                        className={cn(
                          'h-10 min-w-10 rounded-lg border px-2 dialog-centered:h-8 dialog-centered:min-w-8',
                          on && 'bg-accent font-medium',
                        )}
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
            <div className="flex flex-col gap-5 text-sm">
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">
                  <SourceBadge source="telegram" />
                </h3>
                {!tgTargets.length ? (
                  <p className="text-muted-foreground">
                    Нет подключённых групп — добавьте бота в группу на странице{' '}
                    <Link href="/integrations" className="underline underline-offset-2">
                      «Интеграции»
                    </Link>
                    .
                  </p>
                ) : (
                  tgTargets
                    .filter((t) => !t.threadId)
                    .map((c) => (
                      <div key={targetKey(c)} className="flex flex-col gap-1 rounded-lg border p-2">
                        {check(c, c.chatTitle)}
                        {!c.active && (
                          <span className="ml-6 text-xs text-destructive">
                            бот удалён из группы
                          </span>
                        )}
                        {tgTargets
                          .filter((t) => t.chatId === c.chatId && t.threadId)
                          .map((t) => check(t, `Тема: ${t.topicTitle}`, 'ml-6'))}
                      </div>
                    ))
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">
                  <SourceBadge source="green_api" />
                </h3>
                {!whatsappConnected && !waTargets.length ? (
                  <p className="text-muted-foreground">
                    WhatsApp не подключён —{' '}
                    <Link href="/integrations" className="underline underline-offset-2">
                      подключить на «Интеграциях»
                    </Link>
                    .
                  </p>
                ) : !waTargets.length ? (
                  <p className="text-muted-foreground">
                    У номера пока нет групп — добавьте номер в группу и нажмите «Обновить группы» на
                    «Интеграциях».
                  </p>
                ) : (
                  <>
                    {!whatsappConnected && (
                      <p className="text-xs text-destructive">
                        Номер WhatsApp не подключён — отчёты туда сейчас не уходят.
                      </p>
                    )}
                    {waTargets.length > 8 && (
                      <Input
                        placeholder="Поиск группы"
                        aria-label="Поиск группы WhatsApp"
                        value={waQuery}
                        onChange={(e) => setWaQuery(e.target.value)}
                      />
                    )}
                    <div className="flex flex-col gap-1 rounded-lg border p-2">
                      {waShown.length ? (
                        waShown.map((t) => check(t, targetLabel(t)))
                      ) : (
                        <span className="text-muted-foreground">Ничего не нашлось</span>
                      )}
                    </div>
                  </>
                )}
              </section>
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
                  {v.recipients.length ? (
                    <ChannelCounts recipients={v.recipients} style="summary" />
                  ) : (
                    'никуда — выберите на шаге 3'
                  )}
                </dd>
                <dt className="text-muted-foreground">Формат</dt>
                <dd>{REPORT_FORMAT_LABELS[v.config.format]}</dd>
              </dl>
              {v.config.blocks.length > 0 && <ReportPreview name={v.name} config={v.config} />}
              <p className="text-xs text-muted-foreground">
                Цифры в предпросмотре — за период на текущий момент. После сохранения можно
                отправить тест в группу.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="dialog-centered:justify-between">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
