import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { getLanguageInfo } from "../utils/languageDetector.js";

/**
 * Scrapes lyrics from AZLyrics
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {Object} proxy - Proxy configuration
 * @returns {Promise<Object>} Lyrics data
 */
export async function scrapeLyrics(title, artist, proxy) {
  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(
    searchQuery
  )}`;

  let browserContext;
  try {
    browserContext = await createBrowserContext(proxy);
    const page = await browserContext.newPage();
    await setupPage(page);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    // Fill search form and submit
    await page.fill(".search .form-control", searchQuery);
    await page.click('button.btn.btn-primary[type="submit"]');

    // Wait for search results
    await page.waitForSelector("td.text-left.visitedlyr a", {
      timeout: 30000,
    });
    const resultsCount = await page
      .locator("td.text-left.visitedlyr a")
      .count();
    if (resultsCount === 0) {
      throw new Error("No search results found");
    }

    // Get URL of first result
    const firstResultUrl = await page
      .locator("td.text-left.visitedlyr a")
      .first()
      .getAttribute("href");

    // Navigate to lyrics page
    await page.goto(firstResultUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Get full HTML of lyrics section
    let fullLyrics = await page.evaluate(() => {
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

    // Alternative method if first method fails
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
      throw new Error("Could not extract lyrics HTML properly");
    }

    // Extract romanized lyrics if available
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
        .replace(/\[English translation:\].*?(\n|$)/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return langText;
    }, fullLyrics);

    // Clean lyrics if no Romanized, Korean, or Japanese section is found
    let cleanLyrics = await page.evaluate((fullLyricsHtml) => {
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

    // Use romanized lyrics if available, otherwise clean lyrics
    const finalLyrics = romanizedLyrics || cleanLyrics;

    // Extract Korean/Japanese section for language detection
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

    // Use Korean/Japanese section or final lyrics for language detection
    const textForDetection = languageDetectionText || finalLyrics;
    const detectionSource = languageDetectionText
      ? "korean/japanese"
      : "clean lyrics";

    // Get language info
    const language = getLanguageInfo(textForDetection, detectionSource);

    return {
      title,
      artist,
      lyrics: finalLyrics,
      language,
      usedProxy: `${proxy.host}:${proxy.port}`,
    };
  } finally {
    if (browserContext) await browserContext.close();
  }
}

export default {
  scrapeLyrics,
};
