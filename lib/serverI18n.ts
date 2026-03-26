import { cookies } from 'next/headers'
import { translations, type Lang } from './i18n'

const VALID_LANGS: Lang[] = ['en', 'th', 'zh', 'ja', 'ko', 'ar', 'fr', 'de', 'es']

export function getServerT() {
  const cookieStore = cookies()
  const raw = cookieStore.get('ns-lang')?.value ?? 'en'
  const lang: Lang = VALID_LANGS.includes(raw as Lang) ? (raw as Lang) : 'en'

  return function t(key: keyof typeof translations.en, fallback?: string): string {
    const dict = translations[lang] as Record<string, string>
    const enDict = translations.en as Record<string, string>
    return dict[key] ?? enDict[key] ?? fallback ?? key
  }
}
