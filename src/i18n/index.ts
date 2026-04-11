/**
 * i18n configuration — react-i18next setup.
 *
 * Namespace-based splitting: common, spot, perp, errors.
 * Default language: English. Add new languages by creating
 * a new locale directory (e.g., src/i18n/locales/vi/) with
 * the same JSON files.
 *
 * Usage in components:
 *   const { t } = useTranslation('spot')
 *   <span>{t('you_pay')}</span>
 *
 * Usage with interpolation:
 *   t('swap_for', { sell: 'ETH', buy: 'USDC' })
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// English translations (bundled — no lazy load for default language)
import enCommon from './locales/en/common.json'
import enSpot from './locales/en/spot.json'
import enPerp from './locales/en/perp.json'
import enErrors from './locales/en/errors.json'

const STORAGE_KEY = 'i18n-lang'

function getSavedLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      spot: enSpot,
      perp: enPerp,
      errors: enErrors,
    },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'spot', 'perp', 'errors'],
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

// Persist language selection
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // localStorage unavailable
  }
})

export default i18n
