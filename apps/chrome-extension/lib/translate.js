// On-device translation via Chrome's built-in LanguageDetector and Translator
// APIs (Chrome 138+). These exist only on Window contexts, not in the service
// worker, so this runs in the content script.
//
// translate() never rejects: on any failure it resolves with the original text
// (and failed: true) so the caller can keep its normal flow.

const NOTA_DETECT_CONFIDENCE_THRESHOLD = 0.7;

let notaDetectorPromise = null;
const notaTranslatorCache = new Map(); // "src→tgt" -> Promise<Translator>

function notaTranslateIsSupported() {
  return 'Translator' in self && 'LanguageDetector' in self;
}

function notaBaseLang(code) {
  return String(code || '').toLowerCase().split('-')[0];
}

function notaTranslateError(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function notaGetDetector() {
  if (!notaDetectorPromise) {
    notaDetectorPromise = self.LanguageDetector.create().catch((err) => {
      notaDetectorPromise = null; // allow a retry next time
      throw err;
    });
  }
  return notaDetectorPromise;
}

async function notaResolveSourceLang(text, assumedSourceLang) {
  let top = null;
  try {
    const detector = await notaGetDetector();
    const results = await detector.detect(text);
    top = Array.isArray(results) && results.length ? results[0] : null;
  } catch (_) {
    top = null; // detection failure just means "not confident"
  }
  const detectedLang = top ? top.detectedLanguage : null;
  const confidence = top ? top.confidence : 0;
  const assumed = !detectedLang || detectedLang === 'und' || confidence < NOTA_DETECT_CONFIDENCE_THRESHOLD;
  return {
    sourceLang: assumed ? assumedSourceLang : detectedLang,
    detectedLang,
    confidence,
    assumed,
  };
}

async function notaGetTranslator(sourceLanguage, targetLanguage, { hasUserActivation, onProgress }) {
  const key = `${sourceLanguage}→${targetLanguage}`;
  if (notaTranslatorCache.has(key)) return notaTranslatorCache.get(key);

  const availability = await self.Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === 'unavailable') {
    throw notaTranslateError('PAIR_UNAVAILABLE', `${key} is not supported on this device`);
  }
  const activationActive = !!(self.navigator && navigator.userActivation && navigator.userActivation.isActive);
  if (availability !== 'available' && !hasUserActivation && !activationActive) {
    throw notaTranslateError('NEEDS_ACTIVATION', 'Language model download needs a click');
  }

  const promise = self.Translator.create({
    sourceLanguage,
    targetLanguage,
    monitor(m) {
      if (typeof onProgress !== 'function') return;
      m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
    },
  });
  notaTranslatorCache.set(key, promise);
  promise.catch(() => notaTranslatorCache.delete(key));
  return promise;
}

async function notaTranslate(text, { targetLang = 'en', assumedSourceLang = 'sv', hasUserActivation = false, onProgress } = {}) {
  const base = { translated: text, targetLang, sourceLang: null, detectedLang: null, confidence: 0, assumed: false };
  try {
    if (!notaTranslateIsSupported()) {
      throw notaTranslateError('UNSUPPORTED', 'Built-in translation is not available in this browser');
    }
    const source = await notaResolveSourceLang(text, assumedSourceLang);
    Object.assign(base, source);
    if (notaBaseLang(source.sourceLang) === notaBaseLang(targetLang)) {
      return { ...base, sameLanguage: true };
    }
    const translator = await notaGetTranslator(source.sourceLang, targetLang, { hasUserActivation, onProgress });
    const translated = await translator.translate(text);
    if (!translated) throw notaTranslateError('EMPTY', 'Empty translation');
    return { ...base, translated };
  } catch (err) {
    return { ...base, translated: text, failed: true, reason: (err && err.code) || 'ERROR', error: (err && err.message) || String(err) };
  }
}

self.NotaTranslate = {
  translate: notaTranslate,
  isSupported: notaTranslateIsSupported,
  DETECT_CONFIDENCE_THRESHOLD: NOTA_DETECT_CONFIDENCE_THRESHOLD,
};
