import express from "express";
import { chromium } from "playwright";
import { detect, detectAll } from "tinyld";

const app = express();
const port = 3000;

// Daftar proxy yang tersedia
const PROXIES = [
  {
    ip: "103.112.70.148",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.69.169",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.68.153",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.68.139",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.70.62",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.70.53",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.69.64",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.70.52",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.69.197",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
  {
    ip: "103.112.70.48",
    httpPort: "50100",
    httpsPort: "50101",
    username: "dfgadall",
    password: "CFXCuK6Zuz",
  },
];

// Menyimpan indeks proxy yang terakhir digunakan
let currentProxyIndex = 0;

// Fungsi untuk mendapatkan proxy berikutnya
function getNextProxy() {
  const proxy = PROXIES[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length; // Rotasi ke proxy berikutnya
  return proxy;
}

// Fungsi untuk mencoba dengan proxy yang berbeda jika terjadi error
async function tryWithDifferentProxies(asyncFn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await asyncFn(getNextProxy());
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
        console.log(`Mencoba dengan proxy: ${proxy.ip}:${proxy.httpPort}`);

        browserContext = await chromium.launchPersistentContext("", {
          headless: true,
          proxy: {
            server: `${proxy.ip}:${proxy.httpPort}`,
            username: proxy.username,
            password: proxy.password,
          },
          timeout: 60000,
        });

        const page = await browserContext.newPage();
        await page.setDefaultTimeout(60000);
        await page.setDefaultNavigationTimeout(60000);

        page.on("dialog", async (dialog) => {
          await dialog.dismiss();
        });

        await page.setExtraHTTPHeaders({
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        });

        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
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
          usedProxy: `${proxy.ip}:${proxy.httpPort}`, // Tambahkan info proxy yang digunakan
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
// Endpoint UI untuk input bulk dan export CSV dengan perbandingan deteksi bahasa
app.get("/bulk", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bulk Lyrics Scraper with Language Detection</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        textarea { width: 100%; height: 150px; }
        table, th, td { border: 1px solid #ccc; border-collapse: collapse; padding: 8px; }
        table { width: 100%; margin-top: 20px; }
        .error { color: red; }
        .success { color: green; }
        .language-compare { 
          margin-top: 5px;
          padding: 5px;
          background-color: #f9f9f9;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .agreement {
          font-weight: bold;
          margin-top: 8px;
        }
        .agree { color: green; }
        .disagree { color: orange; }
        .tabs {
          display: flex;
          margin-bottom: 10px;
        }
        .tab {
          padding: 10px 15px;
          cursor: pointer;
          border: 1px solid #ccc;
          background-color: #f1f1f1;
          margin-right: 5px;
        }
        .tab.active {
          background-color: #e0e0e0;
          border-bottom: 2px solid #4CAF50;
        }
        .tab-content {
          display: none;
          border: 1px solid #ccc;
          padding: 15px;
        }
        .tab-content.active {
          display: block;
        }
        .lang-pill {
          display: inline-block;
          padding: 2px 8px;
          margin: 2px;
          border-radius: 12px;
          background-color: #e0e0e0;
          font-size: 0.8em;
        }
        .lang-probability {
          font-size: 0.9em;
          color: #555;
        }
        pre {
          white-space: pre-wrap;
          max-height: 150px;
          overflow-y: auto;
        }
        .collapsible {
          cursor: pointer;
          padding: 5px;
          background-color: #f1f1f1;
          width: 100%;
          text-align: left;
          border: none;
          outline: none;
        }
        .content {
          display: none;
          overflow: hidden;
          background-color: #f9f9f9;
          padding: 0 18px;
        }
      </style>
    </head>
    <body>
      <h1>Bulk Lyrics Scraper with Language Detection</h1>
      
      <div class="tabs">
        <div class="tab active" data-tab="bulk-scrape">Bulk Scrape</div>
      </div>
      
      <div id="bulk-scrape" class="tab-content active">
        <p>Masukkan setiap pasangan Title dan Artist dalam satu baris, dipisahkan dengan koma.<br>Contoh: <code>Judul Lagu, Nama Artis</code></p>
        <textarea id="bulkInput" placeholder="Judul Lagu, Nama Artis"></textarea><br>
        <button id="processBtn">Proses</button>
        <button id="exportBtn" style="display:none;">Export CSV</button>
        <div id="result"></div>
      </div>
      <script>
        // Tab functionality
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to current tab and content
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
          });
        });
        
        // Bulk scraping functionality
        const processBtn = document.getElementById('processBtn');
        const exportBtn = document.getElementById('exportBtn');
        const bulkInput = document.getElementById('bulkInput');
        const resultDiv = document.getElementById('result');
        let results = [];

        processBtn.addEventListener('click', async () => {
          resultDiv.innerHTML = '';
          results = [];
          const lines = bulkInput.value.split('\\n').filter(line => line.trim());
          if (!lines.length) {
            resultDiv.innerHTML = '<p class="error">Input tidak boleh kosong.</p>';
            return;
          }
          
          // Tampilkan loading
          resultDiv.innerHTML = '<p>Proses scraping, harap tunggu...</p>';

          for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < 2) continue;
            const title = parts[0].trim();
            const artist = parts[1].trim();

            try {
              const response = await fetch(\`/lyrics?title=\${encodeURIComponent(title)}&artist=\${encodeURIComponent(artist)}\`);
              const data = await response.json();
              if (data.error) {
                results.push({ title, artist, lyrics: 'Error: ' + data.error, languageDetectionResults: null });
              } else {
                results.push(data);
              }
            } catch (err) {
              results.push({ title, artist, lyrics: 'Error: ' + err.message, languageDetectionResults: null });
            }
          }

          // Tampilkan hasil dalam tabel
          let html = '<table><thead><tr><th>Title</th><th>Artist</th><th>Language Detection</th><th>Lyrics</th></tr></thead><tbody>';
          results.forEach(r => {
            html += '<tr>';
            html += '<td>' + r.title + '</td>';
            html += '<td>' + r.artist + '</td>';
            
            // Language detection section
            if (r.language) {
              html += '<td>';
              html += '<div><strong>TinyLD:</strong> ';
              html += '<span class="lang-pill">' + r.language.name + '</span> ';
              html += '<span class="lang-probability">(' + (r.language.probability * 100).toFixed(2) + '%)</span>';
              html += '</div>';
              html += '</td>';
            } else {
              html += '<td>N/A</td>';
            }
            
            // Lyrics column
            html += '<td><pre>' + r.lyrics + '</pre></td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          resultDiv.innerHTML = html;
          exportBtn.style.display = 'inline';
        });

        exportBtn.addEventListener('click', () => {
          let csvContent = "data:text/csv;charset=utf-8,Title,Artist,Detected Language,Confidence,Lyrics\\n";
          results.forEach(row => {
            // Escape quotes in lyrics
            const lyrics = row.lyrics.replace(/"/g, '""');
            
            // Set default values
            let lang = 'N/A', conf = '';
            
            // Extract language detection results if available
            if (row.language) {
              lang = row.language.name;
              conf = (row.language.probability * 100).toFixed(2) + '%';
            }
            
            csvContent += \`"\${row.title}","\${row.artist}","\${lang}","\${conf}","\${lyrics}"\\n\`;
          });
          
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", "lyrics_with_language.csv");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
        
        // Language test functionality
        const testBtn = document.getElementById('testBtn');
        const textInput = document.getElementById('textInput');
        const testResultDiv = document.getElementById('testResult');
        
        testBtn.addEventListener('click', async () => {
          const text = textInput.value.trim();
          if (!text) {
            testResultDiv.innerHTML = '<p class="error">Text tidak boleh kosong.</p>';
            return;
          }
          
          testResultDiv.innerHTML = '<p>Mendeteksi bahasa, harap tunggu...</p>';
          
          try {
            const response = await fetch('/test-language', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ text })
            });
            
            const result = await response.json();
            
            if (result.error) {
              testResultDiv.innerHTML = '<p class="error">Error: ' + result.error + '</p>';
              return;
            }
            
            // Display detailed results
            let html = '<div class="language-compare">';
            
            // Text preview
            html += '<div><strong>Text Preview:</strong> ' + result.text + '</div>';
            html += '<div><strong>Text Length:</strong> ' + result.textLength + ' characters</div>';
            html += '<hr>';
            
            // TinyLD results
            html += '<div><strong>TinyLD Results:</strong></div>';
            html += '<div>Main language: <span class="lang-pill">' + result.tinyld.mainLanguageName + '</span></div>';
            html += '<div>Other detected languages:</div><ul>';
            result.tinyld.detectedLanguages.forEach(lang => {
              html += '<li><span class="lang-pill">' + lang.name + '</span> <span class="lang-probability">(' + (lang.accuracy * 100).toFixed(2) + '%)</span></li>';
            });
            html += '</ul>';
            
            html += '</div>'; // End language-compare div
            
            testResultDiv.innerHTML = html;
          } catch (err) {
            testResultDiv.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
