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
      mainLanguageName: langNames[tinyldMainLang] || tinyldMainLang,
      detectedLanguages: tinyldResult.slice(0, 5).map((item) => ({
        code: item.lang,
        name: langNames[item.lang] || item.lang,
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
    name: "Unknown",
    probability: 0,
    detectedFrom: detectionSource,
  };

  if (
    languageDetectionResults.tinyld.detectedLanguages &&
    languageDetectionResults.tinyld.detectedLanguages.length > 0
  ) {
    language = {
      code: languageDetectionResults.tinyld.mainLanguage,
      name:
        languageDetectionResults.tinyld.mainLanguageName ||
        languageDetectionResults.tinyld.mainLanguage,
      probability:
        languageDetectionResults.tinyld.detectedLanguages[0].accuracy,
      detectedFrom: detectionSource,
      allDetections: {
        tinyld: languageDetectionResults.tinyld.detectedLanguages,
      },
    };
  } else {
    // Fallback to direct tinyld usage
    const detectedLanguages = detectAll(text);

    if (detectedLanguages && detectedLanguages.length > 0) {
      const mostProbableLang = detectedLanguages[0];
      language = {
        code: mostProbableLang.lang,
        name: langNames[mostProbableLang.lang] || mostProbableLang.lang,
        probability: mostProbableLang.accuracy,
        detectedFrom: detectionSource,
      };
    }
  }

  return language;
}

export default {
  detectLanguage,
  getLanguageInfo,
};
