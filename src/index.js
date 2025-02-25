import express from "express";
import { chromium } from "playwright";
import { detect, detectAll } from "tinyld";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";

// Tentukan lokasi file log
const logFilePath = path.join(process.cwd(), "scraper.log");
const accessDeniedLogPath = path.join(process.cwd(), "access_denied.log");

// Buat file counter untuk melacak jumlah hit
const hitCounterPath = path.join(process.cwd(), "hit_counter.txt");

// Inisialisasi hit counter dari file jika ada, atau mulai dari 0
let globalHitCounter = 0;
try {
  if (fs.existsSync(hitCounterPath)) {
    globalHitCounter = parseInt(fs.readFileSync(hitCounterPath, "utf8")) || 0;
  }
} catch (error) {
  console.error("Error reading hit counter file:", error);
}

const app = express();
const port = 3000;

// Konfigurasi rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Batasi setiap IP untuk 100 permintaan per windowMs
  message: "Terlalu banyak permintaan dari IP ini, coba lagi setelah 15 menit",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Terapkan rate limiter ke semua permintaan
app.use(limiter);

function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage, "utf8");
}

function logAccessDenied(hitCount) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ACCESS DENIED terjadi setelah ${hitCount} hit!\n`;
  fs.appendFileSync(accessDeniedLogPath, logMessage, "utf8");
  console.log(`ACCESS DENIED terjadi setelah ${hitCount} hit!`);
}

function updateHitCounter(count) {
  globalHitCounter = count;
  fs.writeFileSync(hitCounterPath, count.toString(), "utf8");
}

// Endpoint untuk melihat jumlah hit saat ini
app.get("/hit-count", (req, res) => {
  res.json({ hits: globalHitCounter });
});

// Endpoint untuk mereset hit counter
app.get("/reset-counter", (req, res) => {
  globalHitCounter = 0;
  updateHitCounter(0);
  res.json({ message: "Hit counter has been reset to 0", hits: 0 });
});

// Endpoint untuk scraping lirik per pasangan title & artist
app.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res
      .status(400)
      .json({ error: "Parameter 'title' dan 'artist' harus disediakan." });
  }

  logToFile(`Menerima permintaan: title="${title}", artist="${artist}"`);

  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
    searchQuery
  )}`;

  let browser;
  try {
    // Tambah hit counter sebelum scraping dimulai
    globalHitCounter++;
    updateHitCounter(globalHitCounter);

    logToFile(
      `Hit ke-${globalHitCounter}: Memulai scraping untuk "${searchQuery}"`
    );
    console.log(
      `Hit ke-${globalHitCounter}: Memulai scraping untuk "${searchQuery}"`
    );

    // Jalankan browser dengan mode headless
    browser = await chromium.launch({
      headless: true,
      timeout: 60000,
    });

    logToFile(`Memulai browser untuk scraping: "${searchQuery}"`);

    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);

    // Tangani dialog/pop-up
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    // Buka halaman pencarian
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    // Periksa jika halaman menampilkan "Access Denied" SEBELUM menunggu selector
    const pageContent = await page.content();
    if (
      pageContent.includes("Access Denied") ||
      pageContent.includes("403 Forbidden")
    ) {
      logToFile(`ACCESS DENIED terjadi pada hit ke-${globalHitCounter}`);
      logAccessDenied(globalHitCounter);
      return res.status(403).json({
        error: `Access Denied terjadi pada hit ke-${globalHitCounter}`,
        hitCount: globalHitCounter,
      });
    }

    // Coba menunggu selector, jika gagal mungkin juga access denied
    try {
      await page.waitForSelector(".search .form-control", { timeout: 10000 });
    } catch (error) {
      // Cek lagi apakah itu access denied
      const newPageContent = await page.content();
      if (
        newPageContent.includes("Access Denied") ||
        newPageContent.includes("403 Forbidden")
      ) {
        logToFile(
          `ACCESS DENIED terjadi pada hit ke-${globalHitCounter} (setelah timeout selector)`
        );
        logAccessDenied(globalHitCounter);
        return res.status(403).json({
          error: `Access Denied terjadi pada hit ke-${globalHitCounter}`,
          hitCount: globalHitCounter,
        });
      } else {
        throw error; // Re-throw jika bukan access denied
      }
    }

    // Isi form pencarian dan submit
    await page.fill(".search .form-control", searchQuery);
    await page.click('button.btn.btn-primary[type="submit"]');

    // Tunggu hasil pencarian
    await page.waitForSelector("td.text-left.visitedlyr a", { timeout: 30000 });
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
    // Ekstrak lirik
    let lyrics = await page.evaluate(() => {
      try {
        // Cari div dengan komentar khusus AZLyrics
        const lyricsDiv = Array.from(document.querySelectorAll("div")).find(
          (div) => {
            const text = div.innerHTML || "";
            return text.includes(
              "Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement"
            );
          }
        );
        if (!lyricsDiv) return null;

        let rawText = lyricsDiv.innerText;
        rawText = rawText.replace(
          "Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that.",
          ""
        );
        let cleanedText = rawText.trim();

        // Hapus konten dari elemen dengan class 'noprint'
        const noprintElements = document.querySelectorAll(".noprint");
        noprintElements.forEach((element) => {
          const noprintText = element.innerText;
          if (noprintText && cleanedText.includes(noprintText)) {
            cleanedText = cleanedText.replace(noprintText, "");
          }
        });

        // Tambahan: Hapus konten dari div-share dan lyricsh
        const divShareElements = document.querySelectorAll(".div-share");
        divShareElements.forEach((element) => {
          const h1Element = element.querySelector("h1");
          if (h1Element && cleanedText.includes(h1Element.innerText)) {
            cleanedText = cleanedText.replace(h1Element.innerText, "");
          }
        });

        const lyricshElements = document.querySelectorAll(".lyricsh");
        lyricshElements.forEach((element) => {
          const h2Element = element.querySelector("h2");
          if (h2Element && cleanedText.includes(h2Element.innerText)) {
            cleanedText = cleanedText.replace(h2Element.innerText, "");
          }
        });

        // Remove the title element
        const titleElements = document.querySelectorAll("b");
        titleElements.forEach((element) => {
          if (element && cleanedText.includes(element.innerText)) {
            // Escape special characters in the title text to avoid regex issues
            const escapedText = element.innerText.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );
            // Create a regex that can match the text precisely
            const titleRegex = new RegExp(escapedText, "g");
            cleanedText = cleanedText.replace(titleRegex, "");
          }
        });

        // remove the span element
        const spanElements = document.querySelectorAll("span");
        spanElements.forEach((element) => {
          if (element && cleanedText.includes(element.innerText)) {
            // Escape special characters in the title text to avoid regex issues
            const escapedText = element.innerText.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );
            // Create a regex that can match the text precisely
            const titleRegex = new RegExp(escapedText, "g");
            cleanedText = cleanedText.replace(titleRegex, "");
          }
        });

        // Hapus semua teks yang mengandung pola (feat. ...)
        cleanedText = cleanedText.replace(/\(feat\..*?\)/g, "");

        // Hapus konten setelah "Submit Corrections" jika ada
        const submitIndex = cleanedText.indexOf("Submit Corrections");
        if (submitIndex !== -1) {
          cleanedText = cleanedText.substring(0, submitIndex);
        }
        return cleanedText.trim();
      } catch (error) {
        return null;
      }
    });

    // Alternatif jika metode pertama gagal
    if (!lyrics) {
      lyrics = await page.evaluate(() => {
        const songTitle = document.querySelector("b");
        if (!songTitle) return null;
        let currentElement = songTitle.nextElementSibling;
        while (currentElement) {
          if (currentElement.tagName === "DIV") {
            let rawText = currentElement.innerText;
            let cleanedText = rawText;

            // Hapus konten dari elemen dengan class 'noprint'
            const noprintElements = document.querySelectorAll(".noprint");
            noprintElements.forEach((el) => {
              if (el.innerText && cleanedText.includes(el.innerText)) {
                cleanedText = cleanedText.replace(el.innerText, "");
              }
            });

            // Tambahan: Hapus konten dari div-share dan lyricsh
            const divShareElements = document.querySelectorAll(".div-share");
            divShareElements.forEach((element) => {
              const h1Element = element.querySelector("h1");
              if (h1Element && cleanedText.includes(h1Element.innerText)) {
                cleanedText = cleanedText.replace(h1Element.innerText, "");
              }
            });

            const lyricshElements = document.querySelectorAll(".lyricsh");
            lyricshElements.forEach((element) => {
              const h2Element = element.querySelector("h2");
              if (h2Element && cleanedText.includes(h2Element.innerText)) {
                cleanedText = cleanedText.replace(h2Element.innerText, "");
              }
            });

            // Remove the title element
            const titleElements = document.querySelectorAll("b");
            titleElements.forEach((element) => {
              if (element && cleanedText.includes(element.innerText)) {
                // Escape special characters in the title text to avoid regex issues
                const escapedText = element.innerText.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                // Create a regex that can match the text precisely
                const titleRegex = new RegExp(escapedText, "g");
                cleanedText = cleanedText.replace(titleRegex, "");
              }
            });

            // remove the span element
            const spanElements = document.querySelectorAll("span");
            spanElements.forEach((element) => {
              if (element && cleanedText.includes(element.innerText)) {
                // Escape special characters in the title text to avoid regex issues
                const escapedText = element.innerText.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                // Create a regex that can match the text precisely
                const titleRegex = new RegExp(escapedText, "g");
                cleanedText = cleanedText.replace(titleRegex, "");
              }
            });

            // Hapus semua teks yang mengandung pola (feat. ...)
            cleanedText = cleanedText.replace(/\(feat\..*?\)/g, "");

            return cleanedText.trim();
          }
          currentElement = currentElement.nextElementSibling;
        }
        return null;
      });
    }

    // Bersihkan lirik dari teks tambahan
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

    // Deteksi bahasa menggunakan tinyld.detectAll
    const detectedLanguages = detectAll(lyrics);

    if (detectedLanguages.length === 0) {
      throw new Error("Tidak dapat mendeteksi bahasa.");
    }

    // Ambil bahasa dengan akurasi tertinggi
    const mostProbableLang = detectedLanguages[0];

    // Mendapatkan nama bahasa lengkap dari kode
    const langNames = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      nl: "Dutch",
      pl: "Polish",
      id: "Indonesian",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      ru: "Russian",
      ar: "Arabic",
      hi: "Hindi",
      tr: "Turkish",
      sv: "Swedish",
      da: "Danish",
      fi: "Finnish",
      no: "Norwegian",
      hu: "Hungarian",
      th: "Thai",
      vi: "Vietnamese",
      cs: "Czech",
      el: "Greek",
      he: "Hebrew",
      ro: "Romanian",
      sk: "Slovak",
      // Tambahkan bahasa lain sesuai kebutuhan
    };

    // Menyiapkan object bahasa
    const language = {
      code: mostProbableLang.lang, // Kode bahasa (misalnya, 'en', 'ja')
      name: langNames[mostProbableLang.lang] || mostProbableLang.lang, // Nama bahasa lengkap
      probability: mostProbableLang.accuracy, // Akurasi (confidence level)
    };

    // Catat sukses scraping
    logToFile(
      `Sukses: Berhasil scraping lirik "${title}" oleh "${artist}" (hit ke-${globalHitCounter})`
    );

    res.json({
      title,
      artist,
      lyrics,
      language,
      hitCount: globalHitCounter,
    });
  } catch (error) {
    logToFile(`Error: ${error.message} (hit ke-${globalHitCounter})`);
    res.status(500).json({
      error: error.message,
      hitCount: globalHitCounter,
    });
  } finally {
    if (browser) await browser.close();
  }
});

// Endpoint untuk melihat semua log
app.get("/logs", (req, res) => {
  try {
    let logs = "No logs found";
    if (fs.existsSync(logFilePath)) {
      logs = fs.readFileSync(logFilePath, "utf8");
    }
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Scraper Logs</title>
        <style>
          body { font-family: monospace; margin: 20px; }
          pre { background: #f4f4f4; padding: 10px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>Scraper Logs</h1>
        <p>Hit Count: ${globalHitCounter}</p>
        <h2>Access Denied Report</h2>
        <pre>${
          fs.existsSync(accessDeniedLogPath)
            ? fs.readFileSync(accessDeniedLogPath, "utf8")
            : "No access denied logs yet"
        }</pre>
        <h2>Full Logs</h2>
        <pre>${logs}</pre>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send("Error loading logs: " + error.message);
  }
});

// Endpoint UI untuk input bulk dan export CSV
app.get("/bulk", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bulk Lyrics Scraper</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        textarea { width: 100%; height: 150px; }
        table, th, td { border: 1px solid #ccc; border-collapse: collapse; padding: 8px; }
        table { width: 100%; margin-top: 20px; }
        .error { color: red; }
        .status { margin: 10px 0; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Bulk Lyrics Scraper</h1>
      <div class="status">Total Hit Count: <span id="hitCount">${globalHitCounter}</span></div>
      <p>Masukkan setiap pasangan Title dan Artist dalam satu baris, dipisahkan dengan koma.<br>Contoh: <code>Judul Lagu, Nama Artis</code></p>
      <textarea id="bulkInput" placeholder="Judul Lagu, Nama Artis"></textarea><br>
      <button id="processBtn">Proses</button>
      <button id="exportBtn" style="display:none;">Export CSV</button>
      <button id="resetBtn">Reset Hit Counter</button>
      <div id="result"></div>

      <script>
        const processBtn = document.getElementById('processBtn');
        const exportBtn = document.getElementById('exportBtn');
        const resetBtn = document.getElementById('resetBtn');
        const bulkInput = document.getElementById('bulkInput');
        const resultDiv = document.getElementById('result');
        const hitCountElement = document.getElementById('hitCount');
        let results = [];

        // Fungsi untuk mendapatkan hit count saat ini
        async function updateHitCount() {
          try {
            const response = await fetch('/hit-count');
            const data = await response.json();
            hitCountElement.textContent = data.hits;
          } catch (err) {
            console.error("Error updating hit count:", err);
          }
        }

        // Update hit count setiap 5 detik
        setInterval(updateHitCount, 5000);

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

          // Counter untuk menghitung jumlah sukses dan gagal
          let successCount = 0;
          let failCount = 0;
          let wasAccessDenied = false;

          for (let i = 0; i < lines.length; i++) {
            if (wasAccessDenied) break;
            
            const parts = lines[i].split(',');
            if (parts.length < 2) continue;
            const title = parts[0].trim();
            const artist = parts[1].trim();

            try {
              const response = await fetch(\`/lyrics?title=\${encodeURIComponent(title)}&artist=\${encodeURIComponent(artist)}\`);
              const data = await response.json();
              
              // Update hit count display
              if (data.hitCount) {
                hitCountElement.textContent = data.hitCount;
              }
              
              if (response.status === 403) {
                wasAccessDenied = true;
                resultDiv.innerHTML = \`<p class="error">ACCESS DENIED terjadi setelah \${data.hitCount} hit!</p>\` + resultDiv.innerHTML;
                results.push({ 
                  title, 
                  artist, 
                  lyrics: 'Error: Access Denied terjadi setelah ' + data.hitCount + ' hit!', 
                  language: { name: 'N/A', probability: 0 } 
                });
                failCount++;
                break;
              } else if (data.error) {
                results.push({ 
                  title, 
                  artist, 
                  lyrics: 'Error: ' + data.error, 
                  language: { name: 'N/A', probability: 0 } 
                });
                failCount++;
              } else {
                results.push(data);
                successCount++;
              }
            } catch (err) {
              results.push({ 
                title, 
                artist, 
                lyrics: 'Error: ' + err.message, 
                language: { name: 'N/A', probability: 0 } 
              });
              failCount++;
            }
            
            // Update status progress
            resultDiv.innerHTML = \`<p>Memproses \${i+1} dari \${lines.length}. Sukses: \${successCount}, Gagal: \${failCount}</p>\` + 
                                 (resultDiv.innerHTML.includes('<table>') ? resultDiv.innerHTML.substring(resultDiv.innerHTML.indexOf('<table>')) : '');
          }

          // Tampilkan hasil dalam tabel
          let html = '<table><thead><tr><th>Title</th><th>Artist</th><th>Language</th><th>Confidence</th><th>Lyrics</th></tr></thead><tbody>';
          results.forEach(r => {
            html += '<tr>';
            html += '<td>' + r.title + '</td>';
            html += '<td>' + r.artist + '</td>';
            html += '<td>' + (r.language ? r.language.name : 'N/A') + '</td>';
            html += '<td>' + (r.language && r.language.probability ? (r.language.probability * 100).toFixed(2) + '%' : 'N/A') + '</td>';
            html += '<td><pre style="white-space: pre-wrap;">' + r.lyrics + '</pre></td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          
          // Status akhir
          let finalStatus = \`<p>Proses selesai. Total: \${lines.length}, Sukses: \${successCount}, Gagal: \${failCount}</p>\`;
          if (wasAccessDenied) {
            finalStatus += \`<p class="error">Proses dihentikan karena ACCESS DENIED. Lihat log untuk detail.</p>\`;
          }
          
          resultDiv.innerHTML = finalStatus + html;
          exportBtn.style.display = 'inline';
        });

        exportBtn.addEventListener('click', () => {
          let csvContent = "data:text/csv;charset=utf-8,Title,Artist,Language,Confidence,Lyrics\\n";
          results.forEach(row => {
            // Ganti tanda kutip ganda di lirik agar tidak rusak format CSV
            const lyrics = row.lyrics.replace(/"/g, '""');
            const language = row.language ? row.language.name : '';
            const confidence = (row.language && row.language.probability) ? (row.language.probability * 100).toFixed(2) + '%' : '';
            csvContent += \`"\${row.title}","\${row.artist}","\${language}","\${confidence}","\${lyrics}"\\n\`;
          });
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", "lyrics.csv");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
        
        resetBtn.addEventListener('click', async () => {
          try {
            const response = await fetch('/reset-counter');
            const data = await response.json();
            hitCountElement.textContent = data.hits;
            resultDiv.innerHTML = \`<p>Hit counter telah direset ke 0</p>\`;
          } catch (err) {
            resultDiv.innerHTML = \`<p class="error">Error: \${err.message}</p>\`;
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  logToFile(`Server berjalan di http://localhost:${port}`);
  console.log(`Server berjalan di http://localhost:${port}`);
});
