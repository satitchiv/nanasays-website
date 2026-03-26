'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { translations, type Lang } from '@/lib/i18n'

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: keyof typeof translations.en) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translations.en[key],
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const stored = localStorage.getItem('ns-lang') as Lang | null
    if (stored && ['en', 'th', 'zh', 'ja', 'ko', 'ar', 'fr', 'de', 'es'].includes(stored)) setLangState(stored)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('ns-lang', l)
    // Also set cookie so server components can read the language
    document.cookie = `ns-lang=${l}; path=/; max-age=31536000; SameSite=Lax`
  }

  function t(key: keyof typeof translations.en): string {
    return translations[lang][key] ?? translations.en[key]
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
