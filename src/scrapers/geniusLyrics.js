import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { tryWithDifferentProxies } from "../utils/proxymanager.js";
import { getLanguageInfo } from "../utils/languageDetector.js";


/**
 * Scrapes lyrics from Genius based on song title and artist.
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @returns {Promise<string>} - Scraped lyrics
 */
export async function scrapeLyrics(title, artist) {
  return await tryWithDifferentProxies(async (proxy) => {
    const context = await createBrowserContext(proxy);
    const page = await context.newPage();
    await setupPage(page);

    try {
      const searchQuery = `${title} ${artist}`;
      console.log(`Searching for: ${searchQuery}`);

      await page.goto("https://genius.com");

      // Handle Cloudflare verification page
      try {
        await page.waitForSelector('input[name="q"]', { timeout: 10000 });
      } catch (error) {
        console.log("Cloudflare verification detected, waiting...");
        await page.waitForTimeout(15000); // Wait for 15 seconds
        await page.reload(); // Reload the page
        await page.waitForSelector('input[name="q"]', { timeout: 10000 });
      }

      await page.fill('input[name="q"]', searchQuery);
      await page.keyboard.press("Enter");

      // Simulate human interaction
      await page.mouse.move(100, 100);
      await page.waitForTimeout(2000); // Wait for 2 seconds
      await page.mouse.move(200, 200);
      await page.waitForTimeout(2000); // Wait for 2 seconds

      try {
        await page.waitForSelector("search-result-item", { timeout: 10000 });
      } catch (error) {
        throw new Error("Search results did not load in time.");
      }

      const firstSongLink = await page.$("a.mini_card");
      if (!firstSongLink) {
        throw new Error("No songs found in search results.");
      }

      await firstSongLink.click();
      await page.waitForSelector('div[data-lyrics-container="true"]');

      const lyrics = await page.$eval(
        'div[data-lyrics-container="true"]',
        (el) => el.innerText
      );

      console.log("Lyrics retrieved successfully!");
      await context.close();
      return lyrics;
    } catch (error) {
      console.error("Error during scraping Genius:", error.message);
      await context.close();
      throw error;
    }
  });
}

export default { scrapeLyrics };
