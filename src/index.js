import express from "express";
import { chromium } from "playwright";
import { detect, detectAll } from "tinyld";
import tunnel from "tunnel";

const app = express();
const port = 3000;

// Daftar proxy dalam format "host:port:username:password"
const proxies = [
  "172.120.69.141:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.241:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.126:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.222:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.154:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.122:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.4:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.182:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.196:50100:dfgadall:CFXCuK6Zuz",
  "172.120.69.174:50100:dfgadall:CFXCuK6Zuz",
];
// Menyimpan indeks proxy yang terakhir digunakan
let currentProxyIndex = 0;

// Fungsi untuk parsing string proxy
function parseProxy(proxyStr) {
  const [host, port, username, password] = proxyStr.split(":");
  return {
    host,
    port: parseInt(port),
    username,
    password,
  };
}

// Fungsi untuk mendapatkan proxy berikutnya
function getNextProxy() {
  const proxyStr = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length; // Rotasi ke proxy berikutnya
  const parsedProxy = parseProxy(proxyStr);

  // Buat agen tunneling sesuai dengan protokol
  const tunnelAgent = tunnel.httpsOverHttp({
    proxy: {
      host: parsedProxy.host,
      port: parsedProxy.port,
      proxyAuth: `${parsedProxy.username}:${parsedProxy.password}`,
    },
  });

  return {
    ...parsedProxy,
    tunnelAgent, // Tambahkan agen tunnel
  };
}

// Fungsi untuk mencoba dengan proxy yang berbeda jika terjadi error
async function tryWithDifferentProxies(asyncFn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const proxy = getNextProxy();
      return await asyncFn(proxy);
    } catch (error) {
      lastError = error;
      console.log(
        `Attempt ${attempt + 1} failed: ${error.message}. Trying next proxy...`
      );
    }
  }
  throw new Error(
    `All proxy attempts failed after ${maxRetries} retries. Last error: ${lastError.message}`
  );
}

// Mapping kode bahasa ke nama lengkap
const langNames = {
  en: "English",
  id: "Indonesian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  ms: "Malay",
  jv: "Javanese",
  su: "Sundanese",
  ban: "Balinese",
  min: "Minangkabau",
  bug: "Buginese",
  bjn: "Banjarese",
  mad: "Madurese",
  ace: "Acehnese",
  bbc: "Batak Toba",
  bat: "Batak",
  mak: "Makassarese",
  // Tambahkan bahasa lain sesuai kebutuhan
};

// Function to detect language using tinyld
function detectLanguage(text) {
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

app.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res
      .status(400)
      .json({ error: "Parameter 'title' dan 'artist' harus disediakan." });
  }

  try {
    // Gunakan sistem rotasi proxy dengan retry
    const result = await tryWithDifferentProxies(async (proxy) => {
      const searchQuery = `${title} ${artist}`;
      const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
        searchQuery
      )}`;

      let browserContext;
      try {
        console.log(`Mencoba dengan proxy: ${proxy.host}:${proxy.port}`);

        browserContext = await chromium.launchPersistentContext("", {
          headless: true,
          proxy: {
            server: `${proxy.host}:${proxy.port}`,
            username: proxy.username,
            password: proxy.password,
          },
          timeout: 60000,
          // Menggunakan agen tunnel
          args: [`--proxy-server=http://${proxy.host}:${proxy.port}`],
        });

        const page = await browserContext.newPage();
        await page.setDefaultTimeout(60000);
        await page.setDefaultNavigationTimeout(60000);

        page.on("dialog", async (dialog) => {
          await dialog.dismiss();
        });

        await page.setExtraHTTPHeaders({
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        });

        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });

        // Isi form pencarian dan submit
        await page.fill(".search .form-control", searchQuery);
        await page.click('button.btn.btn-primary[type="submit"]');

        // Tunggu hasil pencarian
        await page.waitForSelector("td.text-left.visitedlyr a", {
          timeout: 30000,
        });
        const resultsCount = await page
          .locator("td.text-left.visitedlyr a")
          .count();
        if (resultsCount === 0) {
          throw new Error("Tidak ada hasil pencarian");
        }

        // Ambil URL hasil pertama
        const firstResultUrl = await page
          .locator("td.text-left.visitedlyr a")
          .first()
          .getAttribute("href");

        // Buka halaman lirik
        await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // Get full HTML of lyrics section first
        let fullLyrics = await page.evaluate(() => {
          try {
            // Ambil semua div yang mungkin berisi lirik
            const divs = Array.from(document.querySelectorAll("div"));

            // Temukan div yang paling cocok untuk lirik
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

        // Alternatif jika metode pertama gagal
        if (!fullLyrics) {
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
        }

        if (!fullLyrics) {
          throw new Error("Tidak dapat mengekstrak HTML lirik dengan benar");
        }

        // Ekstrak bagian Romanized jika ada
        let romanizedLyrics = await page.evaluate((fullLyricsHtml) => {
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
            .replace(/\[English translation:\].*?(\n|$)/g, "") // Remove English translation
            .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
            .trim();

          return langText;
        }, fullLyrics);

        // Fallback to clean lyrics if no Romanized, Korean, or Japanese section is found
        let cleanLyrics = await page.evaluate((fullLyricsHtml) => {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = fullLyricsHtml;

          // Remove any scripts, styles, etc.
          const scripts = tempDiv.querySelectorAll("script, style");
          scripts.forEach((el) => el.remove());

          // Get the text content and clean it up
          let text = tempDiv.textContent || "";

          text = text.replace(
            "Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that.",
            ""
          );

          // Remove content from elements with class 'noprint'
          const noprintElements = tempDiv.querySelectorAll(".noprint");
          noprintElements.forEach((element) => {
            const noprintText = element.textContent;
            if (noprintText && text.includes(noprintText)) {
              text = text.replace(noprintText, "");
            }
          });

          // Remove all text containing patterns like (feat. ...)
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

        // Determine the final lyrics to use
        const finalLyrics = romanizedLyrics || cleanLyrics;

        // Use Korean or Japanese section for language detection
        let languageDetectionText = await page.evaluate((fullLyricsHtml) => {
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

          // Prioritize Korean or Japanese sections for language detection
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

        // Use the final lyrics for language detection if no Korean/Japanese section is found
        const textForDetection = languageDetectionText || finalLyrics;

        // Gunakan fungsi detectLanguage untuk mendapatkan hasil deteksi bahasa
        const languageDetectionResults = detectLanguage(textForDetection);

        // Ambil bahasa dengan akurasi tertinggi dari tinyld
        let language = {
          code: "unknown",
          name: "Unknown",
          probability: 0,
          detectedFrom: languageDetectionText
            ? "korean/japanese"
            : "clean lyrics",
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
            detectedFrom: languageDetectionText
              ? "korean/japanese"
              : "clean lyrics",
            allDetections: {
              tinyld: languageDetectionResults.tinyld.detectedLanguages,
            },
          };
        } else {
          // Fallback ke cara lama jika detectLanguage gagal
          const detectedLanguages = detectAll(textForDetection);

          if (detectedLanguages && detectedLanguages.length > 0) {
            const mostProbableLang = detectedLanguages[0];
            language = {
              code: mostProbableLang.lang,
              name: langNames[mostProbableLang.lang] || mostProbableLang.lang,
              probability: mostProbableLang.accuracy,
              detectedFrom: languageDetectionText
                ? "korean/japanese"
                : "clean lyrics",
            };
          }
        }

        // Mengembalikan hasil
        return {
          title,
          artist,
          lyrics: finalLyrics, // Lirik utama (Romanized atau clean lyrics)
          language,
          usedProxy: `${proxy.host}:${proxy.port}`, // Tambahkan info proxy yang digunakan
        };
      } finally {
        if (browserContext) await browserContext.close();
      }
    });

    // Kirim respons ke client
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: "Gagal mengambil lirik setelah mencoba semua proxy",
    });
  }
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
