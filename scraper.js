import express from "express";
import { chromium } from "playwright";

const app = express();
const port = 3000;

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
    // Jalankan browser dengan tampilan GUI (headless: false)
    browser = await chromium.launch({
      headless: false,
      timeout: 60000,
    });

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
    await page.waitForSelector(".search .form-control", { timeout: 10000 });

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
            const noprintElements = document.querySelectorAll(".noprint");
            noprintElements.forEach((el) => {
              if (el.innerText && cleanedText.includes(el.innerText)) {
                cleanedText = cleanedText.replace(el.innerText, "");
              }
            });
            return cleanedText.trim();
          }
          currentElement = currentElement.nextElementSibling;
        }
        return null;
      });
    }

    // Bersihkan lirik dari teks tambahan (misalnya "Submit Corrections", "Writer(s):", dll)
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

    // Kembalikan hasil dalam format JSON
    res.json({ title, artist, lyrics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
