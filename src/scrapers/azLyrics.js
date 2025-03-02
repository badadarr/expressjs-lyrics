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

/**
 * Scrapes lyrics from AZLyrics
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {Object} proxy - Proxy configuration
 * @returns {Promise<Object>} Lyrics data
 * @throws {ScrapingError} Detailed error information
 */
export async function scrapeLyrics(title, artist, proxy) {
  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
    searchQuery
  )}`;

  let browserContext;
  try {
    // Membuat browser context dengan proxy
    try {
      browserContext = await createBrowserContext(proxy);
    } catch (error) {
      throw new ScrapingError(
        `Gagal membuat browser context: ${error.message}`,
        ErrorCodes.PROXY_ERROR,
        { proxy, originalError: error.message }
      );
    }

    const page = await browserContext.newPage();
    await setupPage(page);

    // Navigasi ke halaman search
    try {
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
    } catch (error) {
      throw new ScrapingError(
        `Gagal mengakses ${searchUrl}: ${error.message}`,
        ErrorCodes.NAVIGATION_ERROR,
        { url: searchUrl, timeoutMs: 90000, originalError: error.message }
      );
    }

    // Search form
    try {
      await page.fill(".search .form-control", searchQuery);
      await page.click('button.btn.btn-primary[type="submit"]');
    } catch (error) {
      throw new ScrapingError(
        `Gagal mengisi form pencarian: ${error.message}`,
        ErrorCodes.SEARCH_ERROR,
        { searchQuery, originalError: error.message }
      );
    }

    // Cek apakah halaman menunjukkan tidak ada hasil
    const pageContent = await page.content();
    if (pageContent.includes("your search returned <b>no results</b>")) {
      throw new ScrapingError(
        `<div class="alert alert-warning">Sorry, your search returned <b>no results</b>. Try to compose less restrictive search query or check spelling.</div>`,
        ErrorCodes.NO_RESULTS,
        { searchQuery: `${title} ${artist}`, artist, title }
      );
    }

    // Menunggu hasil search
    try {
      await page.waitForSelector("td.text-left.visitedlyr a", {
        timeout: 30000,
      });
    } catch (error) {
      throw new ScrapingError(
        `Timeout saat menunggu hasil pencarian: ${error.message}`,
        ErrorCodes.TIMEOUT_ERROR,
        {
          selector: "td.text-left.visitedlyr a",
          timeoutMs: 30000,
          originalError: error.message,
        }
      );
    }

    // Cek hasil search
    const resultsCount = await page
      .locator("td.text-left.visitedlyr a")
      .count();
    if (resultsCount === 0) {
      throw new ScrapingError(
        `Tidak ditemukan hasil untuk "${searchQuery}"`,
        ErrorCodes.NO_RESULTS,
        { searchQuery, artist, title }
      );
    }

    // Dapatkan URL hasil pertama
    let firstResultUrl;
    try {
      firstResultUrl = await page
        .locator("td.text-left.visitedlyr a")
        .first()
        .getAttribute("href");

      if (!firstResultUrl) {
        throw new Error("URL hasil pencarian tidak valid");
      }
    } catch (error) {
      throw new ScrapingError(
        `Gagal mendapatkan URL hasil pencarian: ${error.message}`,
        ErrorCodes.EXTRACTION_ERROR,
        { searchQuery, originalError: error.message }
      );
    }

    // Navigasi ke halaman lirik
    try {
      await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
    } catch (error) {
      throw new ScrapingError(
        `Gagal mengakses halaman lirik ${firstResultUrl}: ${error.message}`,
        ErrorCodes.NAVIGATION_ERROR,
        { url: firstResultUrl, originalError: error.message }
      );
    }

    // Ekstraksi lirik - metode pertama
    let fullLyrics;
    try {
      fullLyrics = await page.evaluate(() => {
        try {
          // Get all divs that might contain lyrics
          const divs = Array.from(document.querySelectorAll("div"));

          // Find the most suitable div for lyrics
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
        } catch (error) {
          return null;
        }
      });
    } catch (error) {
      // Logging error tapi biarkan metode alternatif berjalan
      console.error("Metode ekstraksi pertama gagal:", error.message);
    }

    // Metode alternatif ekstraksi lirik
    if (!fullLyrics) {
      try {
        fullLyrics = await page.evaluate(() => {
          const songTitle = document.querySelector("b");
          if (!songTitle) return null;
          let currentElement = songTitle.nextElementSibling;
          while (currentElement) {
            if (currentElement.tagName === "DIV") {
              return currentElement.innerHTML;
            }
            currentElement = currentElement.nextElementSibling;
          }
          return null;
        });
      } catch (error) {
        console.error("Metode ekstraksi alternatif gagal:", error.message);
      }
    }

    if (!fullLyrics) {
      throw new ScrapingError(
        "Gagal mengekstrak lirik dari halaman",
        ErrorCodes.EXTRACTION_ERROR,
        {
          url: firstResultUrl,
          availableText: await page.evaluate(() =>
            document.body.innerText.substring(0, 500)
          ),
        }
      );
    }

    // Ekstrak romanized lyrics
    let romanizedLyrics;
    try {
      romanizedLyrics = await page.evaluate((fullLyricsHtml) => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = fullLyricsHtml;

        const italicElements = tempDiv.querySelectorAll("i");
        let languageSections = [];

        // Collect all language section headers
        for (let i = 0; i < italicElements.length; i++) {
          const text = italicElements[i].textContent.trim();
          if (text.includes("[") && text.includes("]")) {
            languageSections.push({
              element: italicElements[i],
              text: text,
              index: i,
            });
          }
        }

        // Prioritize Romanized section
        const romanizedIndex = languageSections.findIndex((section) =>
          section.text.toLowerCase().includes("romanized")
        );

        // If no Romanized section, prioritize Korean or Japanese
        const fallbackLangIndex = languageSections.findIndex((section) =>
          ["korean", "japanese"].some((lang) =>
            section.text.toLowerCase().includes(lang)
          )
        );

        const targetIndex =
          romanizedIndex !== -1 ? romanizedIndex : fallbackLangIndex;

        // If no relevant section found, return null
        if (targetIndex === -1) return null;

        const targetSection = languageSections[targetIndex];
        const langStart = targetSection.element;
        const nextSectionIndex = targetIndex + 1;

        let langText = "";
        let currentNode = langStart.nextSibling;

        const hasNextSection = nextSectionIndex < languageSections.length;
        const endNode = hasNextSection
          ? languageSections[nextSectionIndex].element
          : null;

        while (currentNode) {
          if (hasNextSection && currentNode === endNode) {
            break;
          }

          if (currentNode.nodeType === Node.TEXT_NODE) {
            langText += currentNode.textContent;
          } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
            if (currentNode.tagName === "BR") {
              langText += "\n";
            } else {
              langText += currentNode.textContent;
            }
          }

          if (!hasNextSection && !currentNode.nextSibling) {
            break;
          }

          currentNode = currentNode.nextSibling;
        }

        // Clean up the lyrics
        langText = langText
          .replace(/\[English translation:\].*?(\n|$)/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        return langText;
      }, fullLyrics);
    } catch (error) {
      console.error("Ekstraksi romanized lyrics gagal:", error.message);
      romanizedLyrics = null;
    }

    // Clean lyrics
    let cleanLyrics;
    try {
      cleanLyrics = await page.evaluate((fullLyricsHtml) => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = fullLyricsHtml;

        // Remove scripts, styles, etc.
        const scripts = tempDiv.querySelectorAll("script, style");
        scripts.forEach((el) => el.remove());

        // Get text content and clean it
        let text = tempDiv.textContent || "";

        text = text.replace(
          "Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that.",
          ""
        );

        // Remove noprint elements
        const noprintElements = tempDiv.querySelectorAll(".noprint");
        noprintElements.forEach((element) => {
          const noprintText = element.textContent;
          if (noprintText && text.includes(noprintText)) {
            text = text.replace(noprintText, "");
          }
        });

        // Remove patterns like (feat. ...)
        text = text.replace(/\(feat\..*?\)/g, "");

        // Clean up boundaries
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

        return text
          .replace(/^[\s\n]+|[\s\n]+$/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }, fullLyrics);
    } catch (error) {
      console.error("Cleaning lyrics gagal:", error.message);
      cleanLyrics = "";
    }

    // Gunakan romanized lyrics jika tersedia, jika tidak gunakan clean lyrics
    const finalLyrics = romanizedLyrics || cleanLyrics;

    if (!finalLyrics || finalLyrics.trim().length === 0) {
      throw new ScrapingError(
        "Lirik tidak ditemukan atau kosong",
        ErrorCodes.EXTRACTION_ERROR,
        { title, artist, url: firstResultUrl }
      );
    }

    // Ekstrak bagian Korean/Japanese untuk deteksi bahasa
    let languageDetectionText;
    try {
      languageDetectionText = await page.evaluate((fullLyricsHtml) => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = fullLyricsHtml;

        const italicElements = tempDiv.querySelectorAll("i");
        let languageSections = [];

        // Collect all language section headers
        for (let i = 0; i < italicElements.length; i++) {
          const text = italicElements[i].textContent.trim();
          if (text.includes("[") && text.includes("]")) {
            languageSections.push({
              element: italicElements[i],
              text: text,
              index: i,
            });
          }
        }

        // Prioritize Korean or Japanese sections
        const langIndex = languageSections.findIndex((section) =>
          ["korean", "japanese"].some((lang) =>
            section.text.toLowerCase().includes(lang)
          )
        );

        // If no Korean or Japanese section found, return null
        if (langIndex === -1) return null;

        const langStart = languageSections[langIndex].element;
        const nextSectionIndex = langIndex + 1;

        let langText = "";
        let currentNode = langStart.nextSibling;

        const hasNextSection = nextSectionIndex < languageSections.length;
        const endNode = hasNextSection
          ? languageSections[nextSectionIndex].element
          : null;

        while (currentNode) {
          if (hasNextSection && currentNode === endNode) {
            break;
          }

          if (currentNode.nodeType === Node.TEXT_NODE) {
            langText += currentNode.textContent;
          } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
            if (currentNode.tagName === "BR") {
              langText += "\n";
            } else {
              langText += currentNode.textContent;
            }
          }

          if (!hasNextSection && !currentNode.nextSibling) {
            break;
          }

          currentNode = currentNode.nextSibling;
        }

        return langText.trim();
      }, fullLyrics);
    } catch (error) {
      console.error("Ekstraksi teks deteksi bahasa gagal:", error.message);
      languageDetectionText = null;
    }

    // Gunakan bagian Korean/Japanese atau lirik final untuk deteksi bahasa
    const textForDetection = languageDetectionText || finalLyrics;
    const detectionSource = languageDetectionText
      ? "korean/japanese"
      : "clean lyrics";

    // Deteksi bahasa
    let language;
    try {
      language = getLanguageInfo(textForDetection, detectionSource);
    } catch (error) {
      console.error("Deteksi bahasa gagal:", error.message);
      language = { code: "unknown", confidence: 0, source: detectionSource };
    }

    return {
      title,
      artist,
      lyrics: finalLyrics,
      language,
      usedProxy: `${proxy.host}:${proxy.port}`,
    };
  } catch (error) {
    // Transformasi error biasa menjadi ScrapingError jika belum
    if (!(error instanceof ScrapingError)) {
      throw new ScrapingError(
        `Error saat scraping lirik "${title}" oleh "${artist}": ${error.message}`,
        ErrorCodes.UNKNOWN_ERROR,
        {
          title,
          artist,
          proxy: `${proxy.host}:${proxy.port}`,
          originalError: error.message,
          stack: error.stack,
        }
      );
    }
    throw error;
  } finally {
    if (browserContext) {
      try {
        await browserContext.close();
      } catch (error) {
        console.error("Error saat menutup browser context:", error.message);
      }
    }
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
  scrapeLyricsWithErrorHandling,
  ScrapingError,
  ErrorCodes,
};
