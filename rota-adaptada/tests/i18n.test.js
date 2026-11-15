import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  applyDomTranslations,
  detectBrowserLang,
  getIntlLocale,
  getLang,
  normalizeLang,
  onLangChange,
  resolveInitialLang,
  setLang,
  t,
  toggleLang,
} from '../src/i18n.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('normalizeLang and detectBrowserLang prioritize browser preference with pt-BR default', () => {
  assert.equal(normalizeLang('pt-BR'), 'pt-BR');
  assert.equal(normalizeLang('pt'), 'pt-BR');
  assert.equal(normalizeLang('en-US'), 'en');
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('es-ES'), null);

  assert.equal(detectBrowserLang({languages: ['pt-BR', 'en-US']}), 'pt-BR');
  assert.equal(detectBrowserLang({languages: ['en-US', 'pt-BR']}), 'en');
  assert.equal(detectBrowserLang({languages: ['fr-FR', 'en-GB']}), 'en');
  assert.equal(detectBrowserLang({languages: ['es-ES']}), DEFAULT_LANG);
  assert.equal(detectBrowserLang({language: 'en'}), 'en');
  assert.equal(detectBrowserLang(undefined), DEFAULT_LANG);
});

test('resolveInitialLang honors saved user preference over browser locale', () => {
  const storage = memoryStorage({[LANG_STORAGE_KEY]: 'pt-BR'});
  assert.equal(resolveInitialLang({storage, navigatorObj: {languages: ['en-US']}}), 'pt-BR');

  const enStorage = memoryStorage({[LANG_STORAGE_KEY]: 'en'});
  assert.equal(resolveInitialLang({storage: enStorage, navigatorObj: {languages: ['pt-BR']}}), 'en');

  const emptyStorage = memoryStorage();
  assert.equal(resolveInitialLang({storage: emptyStorage, navigatorObj: {languages: ['en-GB']}}), 'en');
  assert.equal(resolveInitialLang({storage: emptyStorage, navigatorObj: {languages: ['pt-PT']}}), 'pt-BR');
});

test('t() keeps PT-BR as source of truth and falls back automatically when EN is missing', () => {
  const dict = {
    'Visão geral': 'Overview',
    'Etapa {step} de {total}': 'Step {step} of {total}',
    'Texto vazio no dicionário': '',
  };

  assert.equal(t('Visão geral', undefined, {lang: 'pt-BR', dictionary: dict}), 'Visão geral');
  assert.equal(t('Visão geral', undefined, {lang: 'en', dictionary: dict}), 'Overview');
  assert.equal(t('Etapa {step} de {total}', {step: 2, total: 4}, {lang: 'en', dictionary: dict}), 'Step 2 of 4');
  assert.equal(t('Etapa {step} de {total}', {step: 2, total: 4}, {lang: 'pt-BR', dictionary: dict}), 'Etapa 2 de 4');
  assert.equal(t('Nova tela ainda sem tradução', undefined, {lang: 'en', dictionary: dict}), 'Nova tela ainda sem tradução');
  assert.equal(t('Texto vazio no dicionário', undefined, {lang: 'en', dictionary: dict}), 'Texto vazio no dicionário');
});

test('setLang, toggleLang and onLangChange persist preference and notify listeners without DOM', () => {
  const storage = memoryStorage();
  const seen = [];
  const unsubscribe = onLangChange(lang => seen.push(lang));

  try {
    setLang('pt-BR', {storage, doc: null});
    assert.equal(getLang(), 'pt-BR');
    assert.equal(getIntlLocale(), 'pt-BR');
    assert.equal(storage.getItem(LANG_STORAGE_KEY), 'pt-BR');

    toggleLang({storage, doc: null});
    assert.equal(getLang(), 'en');
    assert.equal(getIntlLocale(), 'en-US');
    assert.equal(storage.getItem(LANG_STORAGE_KEY), 'en');

    assert.deepEqual(seen, ['pt-BR', 'en']);
  } finally {
    unsubscribe();
    setLang('pt-BR', {persist: false, emit: false, doc: null});
  }
});

test('applyDomTranslations translates marked elements and restores PT-BR losslessly', () => {
  const makeEl = ({text = '', attrs = {}} = {}) => {
    const map = new Map(Object.entries(attrs));
    return {
      textContent: text,
      dataset: {},
      getAttribute: k => (map.has(k) ? map.get(k) : null),
      setAttribute: (k, v) => map.set(k, v),
    };
  };
  const titleEl = makeEl({text: 'Visão geral', attrs: {'data-i18n': ''}});
  const inputEl = makeEl({attrs: {'data-i18n-placeholder': '', placeholder: 'Buscar ações'}});
  const fakeRoot = {
    querySelectorAll: selector => (selector === '[data-i18n]' ? [titleEl] : selector === '[data-i18n-placeholder]' ? [inputEl] : []),
  };
  const dict = {'Visão geral': 'Overview', 'Buscar ações': 'Search actions'};

  applyDomTranslations(fakeRoot, {lang: 'en', dictionary: dict});
  assert.equal(titleEl.textContent, 'Overview');
  assert.equal(inputEl.getAttribute('placeholder'), 'Search actions');

  applyDomTranslations(fakeRoot, {lang: 'pt-BR', dictionary: dict});
  assert.equal(titleEl.textContent, 'Visão geral');
  assert.equal(inputEl.getAttribute('placeholder'), 'Buscar ações');
});

test('src/i18n/en.json exists and is valid JSON object', () => {
  const enPath = resolve(fileURLToPath(new URL('../src/i18n/en.json', import.meta.url)));
  const parsed = JSON.parse(readFileSync(enPath, 'utf8'));
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed !== null && !Array.isArray(parsed));
});
