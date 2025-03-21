import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { getLanguageInfo } from "../utils/languageDetector.js";

export async function scrapeLyrics(proxy, title, artist) {
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

    // Prioritize romanized titles
    let firstSongLink = null;
    const songLinks = await page.$$("a.mini_card");

    for (const link of songLinks) {
      const linkText = await link.evaluate((el) => el.innerText.toLowerCase());
      if (linkText.includes("romanized")) {
        firstSongLink = link;
        console.log("Found romanized version, prioritizing...");
        break;
      }
    }

    if (!firstSongLink && songLinks.length > 0) {
      // If no romanized version is found, take the first result
      firstSongLink = songLinks[0];
      console.log("No romanized version found, using the first result.");
    }

    if (!firstSongLink) {
      throw new Error("No songs found in search results.");
    }

    await firstSongLink.click();
    try {
      await page.waitForSelector('div[data-lyrics-container="true"]', {
        timeout: 10000,
      });
    } catch (error) {
      console.error(
        "Lyrics container did not load in time or was not found.",
        error.message
      );
      throw new Error("Lyrics container not found after navigation.");
    }

    let lyrics = "";
    try {
      lyrics = await page.$eval(
        'div[data-lyrics-container="true"]',
        (el) => el.innerText
      );
    } catch (error) {
      console.error("Error extracting lyrics:", error.message);
      throw new Error("Failed to extract lyrics from the page.");
    }

    console.log("Lyrics retrieved successfully!");

    // Detect language of the lyrics
    const languageInfo = await getLanguageInfo(lyrics);

    // Check for explicit content
    const isExplicit = checkExplicitContent(title, lyrics);

    await context.close();
    return {
      title,
      artist,
      lyrics,
      language: languageInfo.code, // Use only the language code
      explicit: isExplicit,
      usedProxy: `${proxy.host}:${proxy.port}`,
    };
  } catch (error) {
    console.error("Error during scraping Genius:", error.message);
    await context.close();
    throw error;
  }
}

/**
 * Checks if the lyrics contain explicit content.
 * @param {string} title - Song title
 * @param {string} lyrics - Song lyrics
 * @returns {boolean} - True if explicit content is detected, otherwise false
 */
function checkExplicitContent(title, lyrics) {
  const explicitKeywords = ["explicit", "mature", "adult", "nsfw"];
  const explicitWords = ["fuck", "shit", "bitch", "asshole", "dick", "pussy"];

  const lowerTitle = title.toLowerCase();
  const lowerLyrics = lyrics.toLowerCase();

  return (
    explicitKeywords.some((keyword) => lowerTitle.includes(keyword)) ||
    explicitWords.some((word) => lowerLyrics.includes(word))
  );
}

export default { scrapeLyrics };
