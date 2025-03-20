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

  return {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    textLength: text.length,
    detectedLanguages: detectedLanguages.slice(0, 5).map((item) => ({
      code: item.lang,
      probability: item.prob,
    })),
  };
}

function countOccurrences(text, words) {
  let count = 0;
  words.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi"); // Cari kata utuh
    const matches = text.match(regex);
    if (matches) count += matches.length;
  });
  return count;
}

function isDominantKorean(text) {
  const koreanWords = [
    "sarang",
    "haneul",
    "neoui",
    "gajima",
    "eonje",
    "geureon",
    "namja",
    "naneun",
    "neon",
    "hamkke",
    "saenggak",
    "geot",
    "chingu",
    "mianhae",
    "hajima",
    "jeongmal",
    "aegyo",
    "gwiyeowo",
  ];
  return countOccurrences(text, koreanWords) > 3; // Jika ada lebih dari 3 kata khas Korea
}

function isDominantJapanese(text) {
  const japaneseWords = [
    "suki",
    "watashi",
    "anata",
    "mirai",
    "sekai",
    "hikari",
    "yume",
    "kokoro",
    "yoru",
    "ai",
    "namida",
    "kaze",
    "ashita",
    "gomen",
    "itai",
    "neko",
    "sugoi",
    "kawaii",
    "baka",
  ];
  return countOccurrences(text, japaneseWords) > 3; // Jika ada lebih dari 3 kata khas Jepang
}

export function getLanguageInfo(text, detectionSource = "clean lyrics") {
  let language = {
    code: "unknown",
    probability: 0,
    detectedFrom: detectionSource,
  };

  // **Prioritaskan tag <i>[Korean:]</i> atau <i>[Japanese:]</i>**
  if (text.includes("[Korean:]")) {
    language.code = "ko";
    language.probability = 1.0;
    return language;
  }
  if (text.includes("[Japanese:]")) {
    language.code = "ja";
    language.probability = 1.0;
    return language;
  }

  // Jika tidak ada tag bahasa, gunakan deteksi otomatis
  const languageDetectionResults = detectLanguage(text);

  if (
    languageDetectionResults.detectedLanguages &&
    languageDetectionResults.detectedLanguages.length > 0
  ) {
    const detectedLang = languageDetectionResults.detectedLanguages[0].code;
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
