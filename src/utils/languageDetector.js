import { detect, detectAll } from "tinyld";
import { langNames } from "../config/languages.js";

/**
 * Detects the language of a text
 * @param {string} text - Text to analyze
 * @returns {Object} Language detection results
 */
export function detectLanguage(text) {
  const tinyldResult = detectAll(text);
  const tinyldMainLang = detect(text);

  return {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    textLength: text.length,
    tinyld: {
      mainLanguage: tinyldMainLang,
      detectedLanguages: tinyldResult.slice(0, 5).map((item) => ({
        code: item.lang,
        accuracy: item.accuracy,
      })),
    },
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
    languageDetectionResults.tinyld.detectedLanguages &&
    languageDetectionResults.tinyld.detectedLanguages.length > 0
  ) {
    // Check if detected language is in the desired language list
    const detectedLang = languageDetectionResults.tinyld.mainLanguage;
    if (langNames[detectedLang]) {
      language = {
        code: detectedLang,
        probability:
          languageDetectionResults.tinyld.detectedLanguages[0].accuracy,
        detectedFrom: detectionSource,
      };
    } else {
      // Fallback to the most probable language in the desired language list
      const mostProbableLang =
        languageDetectionResults.tinyld.detectedLanguages.find(
          (lang) => langNames[lang.code]
        );
      if (mostProbableLang) {
        language = {
          code: mostProbableLang.code,
          probability: mostProbableLang.accuracy,
          detectedFrom: detectionSource,
        };
      }
    }
  } else {
    // Fallback to direct tinyld usage
    const detectedLanguages = detectAll(text);

    if (detectedLanguages && detectedLanguages.length > 0) {
      const mostProbableLang = detectedLanguages.find(
        (lang) => langNames[lang.lang]
      );
      if (mostProbableLang) {
        language = {
          code: mostProbableLang.lang,
          probability: mostProbableLang.accuracy,
          detectedFrom: detectionSource,
        };
      }
    }
  }

  // If the detected language is not in the desired language list, return the most probable language
  if (
    language.code === "unknown" &&
    languageDetectionResults.tinyld.detectedLanguages.length > 0
  ) {
    const fallbackLang = languageDetectionResults.tinyld.detectedLanguages[0];
    language = {
      code: fallbackLang.code,
      probability: fallbackLang.accuracy,
      detectedFrom: detectionSource,
    };
  }

  return language;
}

export default {
  detectLanguage,
  getLanguageInfo,
};
