import type { IntegrationType } from '@lidomer/shared';
import type { SourceAdapter } from './types';

export const SOURCE_ADAPTERS = Symbol('SOURCE_ADAPTERS');

/** Адаптеры источников по типу. Telegram — не источник данных, у него адаптера нет. */
export type AdapterRegistry = Partial<Record<IntegrationType, SourceAdapter<unknown>>>;
