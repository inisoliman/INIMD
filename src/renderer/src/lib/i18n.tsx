import { createContext, useContext, useMemo } from 'react'
import { createTranslator, type Language, type TFunction } from '@shared/i18n'

interface I18nValue {
  language: Language
  dir: 'rtl' | 'ltr'
  t: TFunction
}

const I18nContext = createContext<I18nValue>({
  language: 'ar',
  dir: 'rtl',
  t: createTranslator('ar')
})

export function I18nProvider({
  language,
  children
}: {
  language: Language
  children: React.ReactNode
}): React.ReactElement {
  const value = useMemo<I18nValue>(
    () => ({
      language,
      dir: language === 'ar' ? 'rtl' : 'ltr',
      t: createTranslator(language)
    }),
    [language]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
