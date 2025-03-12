import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { tryWithDifferentProxies } from "../utils/proxymanager.js";
/**
 * Scrapes lyrics from Genius based on song title and artist.
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {string}-optional additional parameter - Romanized title
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
      await page.waitForSelector('input[name="q"]');
      await page.fill('input[name="q"]', searchQuery);
      await page.keyboard.press("Enter");

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
