import type { Locale } from '../lib/i18n';
import { en, type Messages } from './en';
import { ja } from './ja';

export type { Messages };

const CATALOGS: Record<Locale, Messages> = { en, ja };

export function messagesFor(locale: Locale): Messages {
  return CATALOGS[locale];
}
