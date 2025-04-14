// script handler untuk languageDetector //languageDetector.js
import langdetect from "langdetect";
import { langNames } from "../config/languages.js";

/**
 * Mendeteksi bahasa dari teks menggunakan library langdetect
 * @param {string} text - Teks yang akan dianalisis
 * @returns {Object} Hasil deteksi bahasa
 */
export function detectLanguage(text) {
  const detectedLanguages = langdetect.detect(text);

  // Convert standard codes to custom codes
  const convertedLanguages = detectedLanguages.slice(0, 5).map((item) => ({
    code: item.lang === "ja" ? "jp" : item.lang === "ko" ? "kr" : item.lang,
    probability: item.prob,
  }));

  return {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    textLength: text.length,
    detectedLanguages: convertedLanguages,
  };
}

export function getLanguageInfo(text, detectionSource = "clean lyrics") {
  let language = {
    code: "unknown",
    probability: 0,
    detectedFrom: detectionSource,
  };

  // Prioritaskan tag <i>[Korean:]</i> atau <i>[Japanese:]</i>
  if (text.includes("[Korean:]")) {
    language.code = "kr";
    language.probability = 1.0;
    return language;
  }
  if (text.includes("[Japanese:]")) {
    language.code = "jp";
    language.probability = 1.0;
    return language;
  }

  // Jika tidak ada tag bahasa, gunakan deteksi otomatis
  const languageDetectionResults = detectLanguage(text);

  if (
    languageDetectionResults.detectedLanguages &&
    languageDetectionResults.detectedLanguages.length > 0
  ) {
    let detectedLang = languageDetectionResults.detectedLanguages[0].code;

    // Konversi kode bahasa standar ke kode custom
    if (detectedLang === "ja") {
      detectedLang = "jp";
    } else if (detectedLang === "ko") {
      detectedLang = "kr";
    }

    language.code = detectedLang;
    language.probability =
      languageDetectionResults.detectedLanguages[0].probability;
  }

  return language;
}

export default {
  detectLanguage,
  getLanguageInfo,
};
