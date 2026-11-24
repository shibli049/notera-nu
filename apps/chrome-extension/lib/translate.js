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

// Similar languages (Swedish/Danish/Norwegian, Spanish/Portuguese, Czech/Slovak, ...)
// often score close to each other, especially for single words. If the user's
// assumed language is among the candidates and scores at least this fraction of
// the top guess, prefer it over the top guess.
//
// Detector confidences sum to at most 1, and this rule only matters when the top
// guess is >= NOTA_DETECT_CONFIDENCE_THRESHOLD (below that the assumed language is
// used anyway). So the assumed language can score at most (1 - T) / T of the top
// guess here: ~0.43 for T = 0.7. A ratio above that would never fire.
const NOTA_PREFER_ASSUMED_RATIO = 0.25;
const NOTA_MAX_PREFER_ASSUMED_RATIO = (1 - NOTA_DETECT_CONFIDENCE_THRESHOLD) / NOTA_DETECT_CONFIDENCE_THRESHOLD;
const NOTA_MAX_CANDIDATES = 5;
const NOTA_MAX_DEBUG_SCORES = 15;

async function notaDetectCandidates(text) {
  try {
    const detector = await notaGetDetector();
    const results = await detector.detect(text);
    return (Array.isArray(results) ? results : []).filter((r) => r && r.detectedLanguage && r.detectedLanguage !== 'und');
  } catch (_) {
    return []; // detection failure just means "not confident"
  }
}

async function notaResolveSourceLang(text, assumedSourceLang, { sourceLang: forcedSourceLang } = {}) {
  const results = await notaDetectCandidates(text);
  const candidates = results.slice(0, NOTA_MAX_CANDIDATES).map((r) => ({ lang: r.detectedLanguage, confidence: r.confidence }));
  const top = results[0] || null;
  const detectedLang = top ? top.detectedLanguage : null;
  const confidence = top ? top.confidence : 0;
  // Full ranked list, kept for the note card's debug view of detection scores.
  const scores = results.slice(0, NOTA_MAX_DEBUG_SCORES).map((r) => ({ lang: r.detectedLanguage, confidence: r.confidence }));
  const base = { detectedLang, confidence, candidates, scores, assumed: false, preferred: false, overridden: false };

  if (forcedSourceLang) {
    return { ...base, sourceLang: forcedSourceLang, overridden: true };
  }
  if (!top || confidence < NOTA_DETECT_CONFIDENCE_THRESHOLD) {
    return { ...base, sourceLang: assumedSourceLang, assumed: true };
  }
  const assumedBase = notaBaseLang(assumedSourceLang);
  if (notaBaseLang(detectedLang) !== assumedBase) {
    const match = results.find((r) => notaBaseLang(r.detectedLanguage) === assumedBase);
    if (match && match.confidence >= confidence * Math.min(NOTA_PREFER_ASSUMED_RATIO, NOTA_MAX_PREFER_ASSUMED_RATIO)) {
      return { ...base, sourceLang: assumedSourceLang, preferred: true };
    }
  }
  return { ...base, sourceLang: detectedLang };
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

async function notaTranslate(text, { targetLang = 'en', assumedSourceLang = 'sv', sourceLang, hasUserActivation = false, onProgress } = {}) {
  const base = { translated: text, targetLang, sourceLang: null, detectedLang: null, confidence: 0, candidates: [], scores: [], assumed: false, preferred: false, overridden: false };
  try {
    if (!notaTranslateIsSupported()) {
      throw notaTranslateError('UNSUPPORTED', 'Built-in translation is not available in this browser');
    }
    const source = await notaResolveSourceLang(text, assumedSourceLang, { sourceLang });
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

let notaDisplayNames = null;
function notaLanguageName(code) {
  try {
    if (!notaDisplayNames) notaDisplayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return notaDisplayNames.of(code) || code;
  } catch (_) {
    return code;
  }
}

self.NotaTranslate = {
  translate: notaTranslate,
  languageName: notaLanguageName,
  baseLang: notaBaseLang,
  isSupported: notaTranslateIsSupported,
  DETECT_CONFIDENCE_THRESHOLD: NOTA_DETECT_CONFIDENCE_THRESHOLD,
  PREFER_ASSUMED_RATIO: Math.min(NOTA_PREFER_ASSUMED_RATIO, NOTA_MAX_PREFER_ASSUMED_RATIO),
};
