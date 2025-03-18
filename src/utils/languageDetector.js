import langdetect from "langdetect";
import { langNames } from "../config/languages.js";

/**
 * Detects the language of a text
 * @param {string} text - Text to analyze
 * @returns {Object} Language detection results
 */
export function detectLanguage(text) {
  const detectedLanguages = langdetect.detect(text);

  return {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    textLength: text.length,
    detectedLanguages: detectedLanguages.slice(0, 5).map((item) => ({
      code: item.lang,
      probability: item.prob,
    })),
  };
}

/**
 * Gets the language with highest probability from detection results
 * @param {string} text - Text to analyze
 * @param {string} detectionSource - Source of text for detection
 * @returns {Object} Language information
 */
export function getLanguageInfo(text, detectionSource = "clean lyrics") {
  // Use detectLanguage function to get language detection results
  const languageDetectionResults = detectLanguage(text);

  // Default language info
  let language = {
    code: "unknown",
    probability: 0,
    detectedFrom: detectionSource,
  };

  if (
    languageDetectionResults.detectedLanguages &&
    languageDetectionResults.detectedLanguages.length > 0
  ) {
    // Check if detected language is in the desired language list
    const detectedLang = languageDetectionResults.detectedLanguages[0].code;
    if (langNames[detectedLang]) {
      language = {
        code: detectedLang,
        probability: languageDetectionResults.detectedLanguages[0].probability,
        detectedFrom: detectionSource,
      };
    } else {
      // Fallback to the most probable language in the desired language list
      const mostProbableLang = languageDetectionResults.detectedLanguages.find(
        (lang) => langNames[lang.code]
      );
      if (mostProbableLang) {
        language = {
          code: mostProbableLang.code,
          probability: mostProbableLang.probability,
          detectedFrom: detectionSource,
        };
      }
    }
  }

  return language;
}

export default {
  detectLanguage,
  getLanguageInfo,
};
