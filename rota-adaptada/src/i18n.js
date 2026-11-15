import enDictionary from './i18n/en.json' with { type: 'json' };

export const DEFAULT_LANG = 'pt-BR';
export const SUPPORTED_LANGS = Object.freeze(['pt-BR', 'en']);
export const LANG_STORAGE_KEY = 'rota-adaptada:lang';

const listeners = new Set();

/**
 * Normalizes a BCP 47 locale tag into a supported app language ('pt-BR' or 'en'),
 * returning null for unrecognized locales.
 */
export function normalizeLang(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR';
  return null;
}

/**
 * Detects the preferred language from the browser locale list,
 * always falling back to 'pt-BR' when English is not selected.
 */
export function detectBrowserLang(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!nav) return DEFAULT_LANG;
  const candidates = Array.isArray(nav.languages) && nav.languages.length
    ? nav.languages
    : [nav.language || nav.userLanguage];

  for (const candidate of candidates) {
    const matched = normalizeLang(candidate);
    if (matched) return matched;
  }
  return DEFAULT_LANG;
}

function safeStorageGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Ignore storage errors (e.g. private mode or blocked cookies).
  }
}

/**
 * Resolves the initial language from saved user preference first,
 * then browser locale, defaulting to 'pt-BR'.
 */
export function resolveInitialLang({
  storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  navigatorObj = typeof navigator !== 'undefined' ? navigator : undefined,
} = {}) {
  const saved = normalizeLang(safeStorageGet(storage, LANG_STORAGE_KEY));
  return saved || detectBrowserLang(navigatorObj);
}

let currentLang = resolveInitialLang();

function interpolate(template, params) {
  if (!params || typeof params !== 'object') return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) && params[key] !== undefined && params[key] !== null
      ? String(params[key])
      : match
  ));
}

/**
 * Translates a PT-BR source string into the active language.
 * Falls back automatically to the original PT-BR string when no translation exists.
 */
export function t(ptText, params, options = {}) {
  const base = String(ptText ?? '');
  const targetLang = options.lang ? (normalizeLang(options.lang) || DEFAULT_LANG) : currentLang;
  const dictionary = options.dictionary || enDictionary;

  let resolved = base;
  if (targetLang === 'en' && dictionary && typeof dictionary === 'object') {
    const translated = dictionary[base];
    if (typeof translated === 'string' && translated.length > 0) {
      resolved = translated;
    }
  }

  return interpolate(resolved, params);
}

export function getLang() {
  return currentLang;
}

export function getIntlLocale(lang = currentLang) {
  return normalizeLang(lang) === 'en' ? 'en-US' : 'pt-BR';
}

const DOM_ATTR_TRANSLATIONS = [
  ['data-i18n-placeholder', 'placeholder', 'i18nPlaceholderPt'],
  ['data-i18n-title', 'title', 'i18nTitlePt'],
  ['data-i18n-aria-label', 'aria-label', 'i18nAriaLabelPt'],
  ['data-i18n-content', 'content', 'i18nContentPt'],
];

/**
 * Applies dictionary translations (with PT-BR fallback) to static DOM elements
 * annotated with data-i18n* attributes.
 */
export function applyDomTranslations(root = typeof document !== 'undefined' ? document : null, options = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  root.querySelectorAll('[data-i18n]').forEach(el => {
    if (!el.dataset.i18nPt) {
      el.dataset.i18nPt = el.getAttribute('data-i18n') || el.textContent || '';
    }
    el.textContent = t(el.dataset.i18nPt, undefined, options);
  });

  for (const [marker, targetAttr, cacheKey] of DOM_ATTR_TRANSLATIONS) {
    root.querySelectorAll(`[${marker}]`).forEach(el => {
      if (!el.dataset[cacheKey]) {
        el.dataset[cacheKey] = el.getAttribute(marker) || el.getAttribute(targetAttr) || '';
      }
      el.setAttribute(targetAttr, t(el.dataset[cacheKey], undefined, options));
    });
  }
}

export function syncDocumentLang(lang = currentLang, doc = typeof document !== 'undefined' ? document : null) {
  if (doc?.documentElement) {
    doc.documentElement.lang = lang;
  }
  applyDomTranslations(doc, { lang });
}

export function setLang(lang, {
  persist = true,
  emit = true,
  storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  const next = normalizeLang(lang) || DEFAULT_LANG;
  currentLang = next;
  if (persist) {
    safeStorageSet(storage, LANG_STORAGE_KEY, next);
  }
  syncDocumentLang(next, doc);

  if (emit) {
    for (const listener of listeners) {
      listener(next);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('rota:langchange', { detail: { lang: next } }));
    }
  }
  return currentLang;
}

export function toggleLang(options) {
  return setLang(currentLang === 'en' ? 'pt-BR' : 'en', options);
}

export function onLangChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof document !== 'undefined') {
  syncDocumentLang(currentLang, document);
}
