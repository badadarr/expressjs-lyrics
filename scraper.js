import express from "express";
import { chromium } from "playwright";
import { detect, detectAll } from "tinyld";
import langdetect from "langdetect";
import LanguageDetect from "languagedetect";

const app = express();
const port = 3000;

// Initialize language detector instances
const languageDetector = new LanguageDetect();

// Mapping of language codes to full names
const langNames = {
  en: "English",
  id: "Indonesian",
  ms: "Malay", // Updated from "Malaysia" to correct language name
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  ro: "Romanian",
  // Regional languages (you may need to check if these codes are supported by all libraries)
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
};

// Function to compare results from all three libraries
function compareLanguageDetection(text) {
  // Results from tinyld
  const tinyldResult = detectAll(text);
  const tinyldMainLang = detect(text);

  // Results from langdetect
  let langdetectResult;
  try {
    langdetectResult = langdetect.detect(text);
  } catch (e) {
    langdetectResult = [{ lang: "unknown", prob: 0 }];
  }
  const langdetectMainLang =
    langdetectResult?.length > 0 ? langdetectResult[0].lang : "unknown";

  // Results from languagedetect
  const languagedetectResult = languageDetector.detect(text, 5);
  const languagedetectMainLang =
    languagedetectResult?.length > 0 ? languagedetectResult[0][0] : "unknown";

  return {
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""), // Show just a preview
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
    langdetect: {
      mainLanguage: langdetectMainLang,
      mainLanguageName: langNames[langdetectMainLang] || langdetectMainLang,
      detectedLanguages:
        langdetectResult?.slice(0, 5).map((item) => ({
          code: item.lang,
          name: langNames[item.lang] || item.lang,
          accuracy: item.prob,
        })) || [],
    },
    languagedetect: {
      mainLanguage: languagedetectMainLang,
      mainLanguageName: languagedetectMainLang, // languagedetect returns language names, not codes
      detectedLanguages:
        languagedetectResult?.slice(0, 5).map((item) => ({
          code: "", // languagedetect doesn't provide codes
          name: item[0],
          accuracy: item[1],
        })) || [],
    },
    agreement: {
      allAgree:
        tinyldMainLang === langdetectMainLang &&
        (tinyldMainLang === languagedetectMainLang ||
          langNames[tinyldMainLang]?.toLowerCase() ===
            languagedetectMainLang?.toLowerCase()),
      tinyldAndLangdetectAgree: tinyldMainLang === langdetectMainLang,
      tinyldAndLanguagedetectAgree:
        tinyldMainLang === languagedetectMainLang ||
        langNames[tinyldMainLang]?.toLowerCase() ===
          languagedetectMainLang?.toLowerCase(),
      langdetectAndLanguagedetectAgree:
        langdetectMainLang === languagedetectMainLang ||
        langNames[langdetectMainLang]?.toLowerCase() ===
          languagedetectMainLang?.toLowerCase(),
    },
  };
}

// Tambahkan fungsi untuk mengambil lirik dari Genius
async function getLyricsFromGenius(title, artist) {
  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://genius.com/search?q=${encodeURIComponent(
    searchQuery
  )}`;

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

  // Tunggu hasil pencarian muncul
  await page.waitForSelector(".search-results", { timeout: 10000 });

  // Ambil URL dari hasil pencarian pertama
  const firstResultUrl = await page.evaluate(() => {
    const firstLink = document.querySelector(".search-results a");
    return firstLink ? firstLink.href : null;
  });

  if (!firstResultUrl) {
    await browser.close();
    throw new Error("Tidak ada hasil pencarian ditemukan di Genius");
  }

  // Navigasi ke halaman lirik
  await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });

  // Ambil lirik dari elemen yang sesuai
  const lyrics = await page.evaluate(() => {
    const lyricsDiv = document.querySelector(
      'div[data-lyrics-container="true"]'
    );
    return lyricsDiv ? lyricsDiv.innerText : null;
  });

  await browser.close();

  if (!lyrics) {
    throw new Error("Tidak dapat mengekstrak lirik dari Genius");
  }

  return lyrics;
}

// Modifikasi endpoint /lyrics
app.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res
      .status(400)
      .json({ error: "Parameter 'title' dan 'artist' harus disediakan." });
  }

  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
    searchQuery
  )}`;

  let browser;
  try {
    // Browser setup dan pengambilan lirik dari AZLyrics
    browser = await chromium.launch({ headless: true, timeout: 60000 });
    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);

    // Dialog handler
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    await page.setExtraHTTPHeaders({
      "User -Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    // Navigasi ke halaman pencarian AZLyrics
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".search .form-control", { timeout: 10000 });
    await page.fill(".search .form-control", searchQuery);
    await page.click('button.btn.btn-primary[type="submit"]');

    // Ambil hasil pertama
    await page.waitForSelector("td.text-left.visitedlyr a", { timeout: 30000 });
    const resultsCount = await page
      .locator("td.text-left.visitedlyr a")
      .count();
    if (resultsCount === 0) {
      throw new Error(
        "Tidak ada hasil pencarian di AZLyrics, mencoba Genius..."
      );
    }

    const firstResultUrl = await page
      .locator("td.text-left.visitedlyr a")
      .first()
      .getAttribute("href");

    // Navigasi ke halaman lirik AZLyrics
    await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Ambil lirik dari AZLyrics
    let fullLyrics = await page.evaluate(() => {
      const lyricsDiv = Array.from(document.querySelectorAll("div")).find(
        (div) =>
          div.innerHTML.includes(
            "Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement"
          )
      );
      return lyricsDiv ? lyricsDiv.innerHTML : null;
    });

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
      throw new Error(
        "Tidak dapat mengekstrak lirik dari AZLyrics, mencoba Genius..."
      );
    }

    // Proses lirik untuk mendapatkan versi romanisasi jika tersedia
    let lyrics = await page.evaluate((fullLyricsHtml) => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = fullLyricsHtml;

      const italicElements = tempDiv.querySelectorAll("i");
      let languageSections = [];

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

      if (languageSections.length === 0) {
        return fullLyricsHtml
          .replace(/<!-- Usage of azlyrics\.com.*?-->/g, "")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .trim();
      }

      const romanizedIndex = languageSections.findIndex((section) =>
        section.text.toLowerCase().includes("romanized")
      );

      if (romanizedIndex === -1) {
        return fullLyricsHtml
          .replace(/<!-- Usage of azlyrics\.com.*?-->/g, "")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .trim();
      }

      const romanizedStart = languageSections[romanizedIndex].element;
      const nextSectionIndex = romanizedIndex + 1;

      let romanizedText = "";
      let currentNode = romanizedStart.nextSibling;

      const hasNextSection = nextSectionIndex < languageSections.length;
      const endNode = hasNextSection
        ? languageSections[nextSectionIndex].element
        : null;

      while (currentNode) {
        if (hasNextSection && currentNode === endNode) {
          break;
        }

        if (currentNode.nodeType === Node.TEXT_NODE) {
          romanizedText += currentNode.textContent;
        } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
          if (currentNode.tagName === "BR") {
            romanizedText += "\n";
          } else {
            romanizedText += currentNode.textContent;
          }
        }

        if (!hasNextSection && !currentNode.nextSibling) {
          break;
        }

        currentNode = currentNode.nextSibling;
      }

      return romanizedText.replace(/\n{3,}/g, "\n\n").trim();
    }, fullLyrics);

    // Bersihkan lirik (kode yang ada sebelumnya)
    if (lyrics) {
      const boundaries = [
        "Submit Corrections",
        "Writer(s):",
        "Thanks to",
        "Follow",
        "Copyright:",
      ];
      for (const boundary of boundaries) {
        const boundaryIndex = lyrics.indexOf(boundary);
        if (boundaryIndex !== -1) {
          lyrics = lyrics.substring(0, boundaryIndex).trim();
        }
      }
      lyrics = lyrics
        .replace(/^[\s\n]+|[\s\n]+$/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else {
      throw new Error("Tidak dapat mengekstrak lirik dengan benar");
    }

    // Jika lirik ditemukan, kembalikan hasil
    res.json({
      title,
      artist,
      lyrics,
      source: "AZLyrics",
    });
  } catch (error) {
    // Jika tidak dapat menemukan lirik di AZLyrics, coba Genius
    try {
      const geniusLyrics = await getLyricsFromGenius(title, artist);
      res.json({
        title,
        artist,
        lyrics: geniusLyrics,
        source: "Genius",
      });
    } catch (geniusError) {
      res.status(500).json({ error: error.message || geniusError.message });
    }
  } finally {
    if (browser) await browser.close();
  }
});

// Add a new endpoint just for language testing without scraping
app.post("/test-language", express.json(), (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text parameter is required" });
  }

  const results = compareLanguageDetection(text);
  res.json(results);
});

// Endpoint UI untuk input bulk dan export CSV dengan perbandingan deteksi bahasa
app.get("/bulk", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bulk Lyrics Scraper with Language Detection Comparison</title>
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
        <div class="tab" data-tab="language-test">Language Test</div>
      </div>
      
      <div id="bulk-scrape" class="tab-content active">
        <p>Masukkan setiap pasangan Title dan Artist dalam satu baris, dipisahkan dengan koma.<br>Contoh: <code>Judul Lagu, Nama Artis</code></p>
        <textarea id="bulkInput" placeholder="Judul Lagu, Nama Artis"></textarea><br>
        <button id="processBtn">Proses</button>
        <button id="exportBtn" style="display:none;">Export CSV</button>
        <div id="result"></div>
      </div>
      
      <div id="language-test" class="tab-content">
        <p>Masukkan teks untuk menguji deteksi bahasa dengan tiga library berbeda</p>
        <textarea id="textInput" placeholder="Masukkan teks yang ingin diuji"></textarea><br>
        <button id="testBtn">Deteksi Bahasa</button>
        <div id="testResult"></div>
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
            if (r.languageDetectionResults) {
              const ldr = r.languageDetectionResults;
              html += '<td>';
              
              // Create collapsible button for language results
              html += '<button class="collapsible">Show Language Results</button>';
              html += '<div class="content">';
              
              // TinyLD results
              html += '<div><strong>TinyLD:</strong> ';
              html += '<span class="lang-pill">' + ldr.tinyld.mainLanguageName + '</span> ';
              html += '<span class="lang-probability">(' + (ldr.tinyld.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%)</span>';
              html += '</div>';
              
              // Langdetect results
              html += '<div><strong>Langdetect:</strong> ';
              html += '<span class="lang-pill">' + ldr.langdetect.mainLanguageName + '</span> ';
              html += '<span class="lang-probability">(' + (ldr.langdetect.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%)</span>';
              html += '</div>';
              
              // Languagedetect results
              html += '<div><strong>Languagedetect:</strong> ';
              html += '<span class="lang-pill">' + ldr.languagedetect.mainLanguageName + '</span> ';
              html += '<span class="lang-probability">(' + (ldr.languagedetect.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%)</span>';
              html += '</div>';
              
              // Agreement information
              html += '<div class="agreement">';
              if (ldr.agreement.allAgree) {
                html += '<span class="agree">✓ All libraries agree</span>';
              } else {
                html += '<span class="disagree">× Libraries disagree</span>';
                html += '<ul>';
                if (ldr.agreement.tinyldAndLangdetectAgree) {
                  html += '<li>TinyLD and Langdetect agree</li>';
                }
                if (ldr.agreement.tinyldAndLanguagedetectAgree) {
                  html += '<li>TinyLD and Languagedetect agree</li>';
                }
                if (ldr.agreement.langdetectAndLanguagedetectAgree) {
                  html += '<li>Langdetect and Languagedetect agree</li>';
                }
                html += '</ul>';
              }
              html += '</div>';
              
              html += '</div>'; // End of content div
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
          
          // Initialize collapsible elements
          setupCollapsibles();
        });

        exportBtn.addEventListener('click', () => {
          let csvContent = "data:text/csv;charset=utf-8,Title,Artist,TinyLD Language,TinyLD Confidence,Langdetect Language,Langdetect Confidence,Languagedetect Language,Languagedetect Confidence,All Agree,Lyrics\\n";
          results.forEach(row => {
            // Escape quotes in lyrics
            const lyrics = row.lyrics.replace(/"/g, '""');
            
            // Set default values
            let tinyLang = 'N/A', tinyConf = '', langLang = 'N/A', langConf = '';
            let langdetectLang = 'N/A', langdetectConf = '', allAgree = 'N/A';
            
            // Extract language detection results if available
            if (row.languageDetectionResults) {
              const ldr = row.languageDetectionResults;
              tinyLang = ldr.tinyld.mainLanguageName;
              tinyConf = (ldr.tinyld.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%';
              
              langLang = ldr.langdetect.mainLanguageName;
              langConf = (ldr.langdetect.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%';
              
              langdetectLang = ldr.languagedetect.mainLanguageName;
              langdetectConf = (ldr.languagedetect.detectedLanguages[0]?.accuracy * 100).toFixed(2) + '%';
              
              allAgree = ldr.agreement.allAgree ? 'Yes' : 'No';
            }
            
            csvContent += \`"\${row.title}","\${row.artist}","\${tinyLang}","\${tinyConf}","\${langLang}","\${langConf}","\${langdetectLang}","\${langdetectConf}","\${allAgree}","\${lyrics}"\\n\`;
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
            
            // Langdetect results
            html += '<div><strong>Langdetect Results:</strong></div>';
            html += '<div>Main language: <span class="lang-pill">' + result.langdetect.mainLanguageName + '</span></div>';
            html += '<div>Other detected languages:</div><ul>';
            result.langdetect.detectedLanguages.forEach(lang => {
              html += '<li><span class="lang-pill">' + lang.name + '</span> <span class="lang-probability">(' + (lang.accuracy * 100).toFixed(2) + '%)</span></li>';
            });
            html += '</ul>';
            
            // Languagedetect results
            html += '<div><strong>Languagedetect Results:</strong></div>';
            html += '<div>Main language: <span class="lang-pill">' + result.languagedetect.mainLanguageName + '</span></div>';
            html += '<div>Other detected languages:</div><ul>';
            result.languagedetect.detectedLanguages.forEach(lang => {
              html += '<li><span class="lang-pill">' + lang.name + '</span> <span class="lang-probability">(' + (lang.accuracy * 100).toFixed(2) + '%)</span></li>';
            });
            html += '</ul>';
            
            // Agreement information
            html += '<div class="agreement">';
            if (result.agreement.allAgree) {
              html += '<span class="agree">✓ All libraries agree on the language: ' + result.tinyld.mainLanguageName + '</span>';
            } else {
              html += '<span class="disagree">× Libraries disagree on the main language</span>';
              html += '<ul>';
              if (result.agreement.tinyldAndLangdetectAgree) {
                html += '<li>TinyLD and Langdetect agree (' + result.tinyld.mainLanguageName + ')</li>';
              }
              if (result.agreement.tinyldAndLanguagedetectAgree) {
                html += '<li>TinyLD and Languagedetect agree (' + result.tinyld.mainLanguageName + ')</li>';
              }
              if (result.agreement.langdetectAndLanguagedetectAgree) {
                html += '<li>Langdetect and Languagedetect agree (' + result.langdetect.mainLanguageName + ')</li>';
              }
              html += '</ul>';
            }
            html += '</div>';
            
            html += '</div>'; // End language-compare div
            
            testResultDiv.innerHTML = html;
          } catch (err) {
            testResultDiv.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
          }
        });
        
        // Function to setup collapsible elements
        function setupCollapsibles() {
          const collapsibles = document.querySelectorAll('.collapsible');
          collapsibles.forEach(coll => {
            coll.addEventListener('click', function() {
              this.classList.toggle('active');
              const content = this.nextElementSibling;
              if (content.style.display === 'block') {
                content.style.display = 'none';
              } else {
                content.style.display = 'block';
              }
            });
          });
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
