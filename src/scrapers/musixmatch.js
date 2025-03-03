import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { getLanguageInfo } from "../utils/languageDetector.js";

export class ScrapingError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ScrapingError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export const ErrorCodes = {
  NAVIGATION_ERROR: "NAVIGATION_ERROR",
  NO_RESULTS: "NO_RESULTS",
  EXTRACTION_ERROR: "EXTRACTION_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  PROXY_ERROR: "PROXY_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

export async function scrapeMusixmatchLyrics(
  title,
  artist,
  proxy,
  options = {}
) {
  const {
    maxRetries = 2,
    navigationTimeout = 40000,
    waitForSelectorTimeout = 20000,
  } = options;

  const searchQuery = `${title} ${artist}`;
  const searchUrl = `https://www.musixmatch.com/search/${encodeURIComponent(
    searchQuery
  )}`;

  let browserContext;
  let retryCount = 0;
  let lastError = null;

  while (retryCount <= maxRetries) {
    try {
      if (retryCount > 0) {
        console.log(`Attempt ${retryCount + 1} for "${title}" by "${artist}"`);
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retryCount)));
      }

      browserContext = await createBrowserContext(proxy);
      const page = await browserContext.newPage();
      await setupPage(page);

      await page.route(
        "**/*.{png,jpg,jpeg,gif,svg,css,font,woff,woff2}",
        (route) => route.abort()
      );

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });

      await page.waitForSelector(".mxm-lyrics", {
        timeout: waitForSelectorTimeout,
      });

      const resultsCount = await page.evaluate(() => {
        return document.querySelectorAll(".mxm-lyrics").length;
      });

      if (resultsCount === 0) {
        throw new Error(`No results found for "${searchQuery}"`);
      }

      const firstResultUrl = await page.evaluate(() => {
        const firstResult = document.querySelector(".mxm-lyrics a");
        return firstResult ? firstResult.href : null;
      });

      if (!firstResultUrl) {
        throw new Error("Failed to get the URL of the first result");
      }

      await page.goto(firstResultUrl, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });

      const lyrics = await page.evaluate(() => {
        const lyricsDiv = document.querySelector(".mxm-lyrics");
        return lyricsDiv ? lyricsDiv.innerText : null;
      });

      if (!lyrics) {
        throw new Error("Failed to extract lyrics");
      }

      return {
        title,
        artist,
        lyrics,
        source: "Musixmatch",
        usedProxy: `${proxy.host}:${proxy.port}`,
      };
    } catch (error) {
      lastError = error;

      if (
        error.message.includes("timeout") ||
        error.message.includes("navigation")
      ) {
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(
            `Retrying (${retryCount}/${maxRetries}) after error: ${error.message}`
          );
          if (browserContext) {
            await browserContext.close();
          }
          continue;
        }
      }

      throw new Error(
        `Error scraping lyrics from Musixmatch for "${title}" by "${artist}": ${error.message}`
      );
    } finally {
      if (browserContext) {
        await browserContext.close();
      }
    }

    if (lastError) {
      throw lastError;
    }
  }
}

export async function scrapeMusixmatchLyricsWithErrorHandling(
  title,
  artist,
  proxy
) {
  try {
    const options = {
      maxRetries: 2,
      navigationTimeout: 40000,
      waitForSelectorTimeout: 20000,
    };

    return {
      success: true,
      data: await scrapeMusixmatchLyrics(title, artist, proxy, options),
      message: "Berhasil mengambil lirik",
    };
  } catch (error) {
    console.error(`Scraping error: ${error.message}`, error);

    return {
      success: false,
      error: {
        code: error.code || "UNKNOWN_ERROR",
        message: error.message,
        timestamp: error.timestamp || new Date().toISOString(),
      },
    };
  }
}

export default {
  scrapeMusixmatchLyrics,
  scrapeMusixmatchLyricsWithErrorHandling,
  ScrapingError,
  ErrorCodes,
};
