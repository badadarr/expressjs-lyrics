import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { getLanguageInfo } from "../utils/languageDetector.js";

/**
 * Custom error class untuk error scraping
 */
export class ScrapingError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ScrapingError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Kode error untuk berbagai skenario
 */
export const ErrorCodes = {
  NAVIGATION_ERROR: "NAVIGATION_ERROR",
  SEARCH_ERROR: "SEARCH_ERROR",
  NO_RESULTS: "NO_RESULTS",
  EXTRACTION_ERROR: "EXTRACTION_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  PROXY_ERROR: "PROXY_ERROR",
  BROWSER_ERROR: "BROWSER_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

// fungsi untuk proses scraping lirik
export async function scrapeLyrics(proxy, title, artist) {
  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
    searchQuery
  )}`;

  let browserContext, page;
  try {
    // Membuat browser context dengan proxy
    browserContext = await createBrowserContext(proxy);
    page = await browserContext.newPage();
    await setupPage(page);

    // Navigasi ke halaman search
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    // Isi dan submit form pencarian
    await page.fill(".search .form-control", searchQuery);
    await page.click('button.btn.btn-primary[type="submit"]');

    // Cek apakah hasil pencarian menunjukkan "no results"
    const pageContent = await page.content();
    if (pageContent.includes("your search returned <b>no results</b>")) {
      throw new Error(`No results found for "${searchQuery}"`);
    }

    // Menunggu hasil pencarian
    await page.waitForSelector("td.text-left.visitedlyr a", {
      timeout: 30000,
    });

    // Dapatkan URL hasil pertama
    const firstResultUrl = await page
      .locator("td.text-left.visitedlyr a")
      .first()
      .getAttribute("href");
    if (!firstResultUrl) throw new Error("Invalid search result URL");

    // Navigasi ke halaman lirik
    await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Ekstraksi lirik utama
    const fullLyrics = await extractLyrics(page);
    if (!fullLyrics) throw new Error("Failed to extract lyrics");

    // Bersihkan lirik
    const cleanLyrics = await cleanLyricsText(page, fullLyrics);

    // Ekstraksi romanized lyrics
    const romanizedLyrics = await extractRomanizedLyrics(page, fullLyrics);

    // Prioritaskan romanized lyrics jika ada
    const finalLyrics = romanizedLyrics || cleanLyrics;
    if (!finalLyrics.trim()) throw new Error("Lyrics not found or empty");

    // Deteksi bahasa dari fullLyrics menggunakan extractLanguageText
    const detectedLang = await extractLanguageText(page, fullLyrics);

    // Jika tidak ada deteksi bahasa dari extractLanguageText, gunakan getLanguageInfo
    const languageInfo = detectedLang
      ? { code: detectedLang, probability: 1.0 }
      : getLanguageInfo(finalLyrics);

    // Cek konten eksplisit
    const isExplicit = checkExplicitContent(title, finalLyrics);

    return {
      title,
      artist,
      lyrics: finalLyrics,
      language: languageInfo.code, // Gunakan hanya kode bahasa
      explicit: isExplicit,
      usedProxy: `${proxy.host}:${proxy.port}`,
    };
  } catch (error) {
    throw new Error(`Scraping failed: ${error.message}`);
  } finally {
    if (browserContext) await browserContext.close().catch(console.error);
  }
}

/**
 * Checks if the lyrics contain explicit content.
 * @param {string} title - Song title
 * @param {string} lyrics - Song lyrics
 * @returns {boolean} - True if explicit content is detected, otherwise false
 */
function checkExplicitContent(title, lyrics) {
  const explicitKeywords = ["explicit", "mature", "adult", "nsfw"];
  const explicitWords = ["fuck", "shit", "bitch", "asshole", "dick", "pussy"];

  const lowerTitle = title.toLowerCase();
  const lowerLyrics = lyrics.toLowerCase();

  return (
    explicitKeywords.some((keyword) => lowerTitle.includes(keyword)) ||
    explicitWords.some((word) => lowerLyrics.includes(word))
  );
}

// fungsi utama ekstraksi lirik
async function extractLyrics(page) {
  try {
    return await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll("div"));
      const lyricsDiv = divs.find((div) => {
        const text = div.innerText.trim();
        return (
          text.length > 100 &&
          !text.includes("lyrics") &&
          !text.includes("Follow") &&
          !text.includes("Submit Corrections")
        );
      });
      return lyricsDiv ? lyricsDiv.innerHTML : null;
    });
  } catch {
    return null;
  }
}

// Fungsi pembersihan teks lirik
async function cleanLyricsText(page, fullLyrics) {
  return await page.evaluate((html) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    const scripts = tempDiv.querySelectorAll("script, style");
    scripts.forEach((el) => el.remove());

    let text = tempDiv.textContent || "";
    text = text.replace(/Usage of azlyrics\.com content.*?/g, "").trim();

    const boundaries = [
      "Submit Corrections",
      "Writer(s):",
      "Thanks to",
      "Follow",
      "Copyright:",
    ];
    for (const boundary of boundaries) {
      const boundaryIndex = text.indexOf(boundary);
      if (boundaryIndex !== -1) {
        text = text.substring(0, boundaryIndex).trim();
      }
    }

    return text.replace(/\n{3,}/g, "\n\n").trim();
  }, fullLyrics);
}

// Fungsi ekstraksi lirik romanized
async function extractRomanizedLyrics(page, fullLyrics) {
  try {
    return await page.evaluate((html) => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      // Hapus elemen yang tidak diinginkan (seperti script, style)
      const scripts = tempDiv.querySelectorAll("script, style");
      scripts.forEach((el) => el.remove());

      // Cari bagian romanized
      const italicElements = tempDiv.querySelectorAll("i");
      const languageSections = [];
      for (let i = 0; i < italicElements.length; i++) {
        const text = italicElements[i].textContent.trim().toLowerCase();
        if (text.includes("[") && text.includes("]")) {
          languageSections.push({ element: italicElements[i], text, index: i });
        }
      }

      // Cari index bagian romanized
      const romanizedIndex = languageSections.findIndex((section) =>
        section.text.includes("romanized")
      );

      if (romanizedIndex === -1) return null;

      const langStart = languageSections[romanizedIndex].element;
      let langText = "";
      let currentNode = langStart.nextSibling;

      while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
          langText += currentNode.textContent.trim();
        } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
          if (currentNode.tagName === "BR") {
            // Hitung jumlah <br> berurutan
            let brCount = 1;
            let nextNode = currentNode.nextSibling;
            while (nextNode && nextNode.tagName === "BR") {
              brCount++;
              nextNode = nextNode.nextSibling;
            }
            if (brCount >= 2) {
              langText += "\n\n"; // Dua <br> atau lebih: pemisah paragraf
            } else {
              langText += "\n"; // Satu <br>: baris baru
            }
          } else if (currentNode.tagName === "I") {
            // Berhenti jika menemukan elemen <i> (tag bahasa atau komentar)
            break;
          } else {
            langText += currentNode.textContent.trim();
          }
        }
        currentNode = currentNode.nextSibling;
      }

      // Hapus teks yang tidak diinginkan (seperti footer AZLyrics)
      langText = langText
        .replace(/Usage of azlyrics\.com content.*?/g, "")
        .trim();

      // Hapus teks setelah batasan tertentu (seperti "Submit Corrections")
      const boundaries = [
        "Submit Corrections",
        "Writer(s):",
        "Thanks to",
        "Follow",
        "Copyright:",
      ];
      for (const boundary of boundaries) {
        const boundaryIndex = langText.indexOf(boundary);
        if (boundaryIndex !== -1) {
          langText = langText.substring(0, boundaryIndex).trim();
        }
      }

      // Bersihkan spasi dan baris baru yang berlebihan
      langText = langText.replace(/\n{3,}/g, "\n\n").trim();

      return langText;
    }, fullLyrics);
  } catch {
    return null;
  }
}

// Fungsi ekstraksi teks deteksi bahasa
async function extractLanguageText(page, fullLyrics) {
  try {
    return await page.evaluate((html) => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      const italicElements = tempDiv.querySelectorAll("i");
      for (let i = 0; i < italicElements.length; i++) {
        const text = italicElements[i].textContent.trim().toLowerCase();
        if (text === "[korean:]") {
          return "ko"; // Langsung return kode bahasa Korean
        }
        if (text === "[japanese:]") {
          return "ja"; // Langsung return kode bahasa Japanese
        }
      }

      return null;
    }, fullLyrics);
  } catch {
    return null;
  }
}

/**
 * Handler untuk menggunakan fungsi scrapeLyrics dan menangani error dengan baik
 * @param {string} title - Judul lagu
 * @param {string} artist - Nama artis
 * @param {Object} proxy - Konfigurasi proxy
 * @returns {Promise<Object>} - Hasil scraping atau objek error
 */
export async function scrapeLyricsWithErrorHandling(title, artist, proxy) {
  try {
    return {
      success: true,
      data: await scrapeLyrics(title, artist, proxy),
      message: "Berhasil mengambil lirik",
    };
  } catch (error) {
    // Log error untuk debugging internal
    console.error(
      `Scraping error: ${error.code || "UNKNOWN"} - ${error.message}`,
      error
    );

    // Format pesan error untuk ditampilkan ke pengguna
    let userMessage = "";
    switch (error.code) {
      case ErrorCodes.NO_RESULTS:
        userMessage = `Tidak ditemukan lirik untuk "${title}" oleh "${artist}". Mohon periksa ejaan judul dan nama artis.`;
        break;
      case ErrorCodes.PROXY_ERROR:
        userMessage =
          "Terjadi masalah koneksi. Mohon coba lagi nanti atau gunakan proxy lain.";
        break;
      case ErrorCodes.NAVIGATION_ERROR:
      case ErrorCodes.TIMEOUT_ERROR:
        userMessage =
          "Waktu koneksi habis. Server mungkin sibuk atau ada masalah jaringan. Mohon coba lagi nanti.";
        break;
      case ErrorCodes.EXTRACTION_ERROR:
        userMessage = `Gagal mengekstrak lirik "${title}" oleh "${artist}". Format halaman mungkin berubah atau lirik tidak tersedia.`;
        break;
      default:
        userMessage =
          "Terjadi kesalahan saat mengambil lirik. Mohon coba lagi nanti.";
    }

    return {
      success: false,
      error: {
        code: error.code || "UNKNOWN_ERROR",
        message: userMessage,
        details: error.details || {},
        timestamp: error.timestamp || new Date().toISOString(),
      },
    };
  }
}

export default {
  scrapeLyrics,
  extractLyrics,
  extractRomanizedLyrics,
  cleanLyricsText,
  extractLanguageText,
  scrapeLyricsWithErrorHandling,
  ScrapingError,
  ErrorCodes,
};
