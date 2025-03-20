import express from "express";
import {
  getNextProxy,
  tryWithDifferentProxies,
} from "../utils/proxymanager.js";
import scrapers from "../scrapers/index.js";

const router = express.Router();

/**
 * Attempts to scrape lyrics using multiple sources.
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {object} proxy - Proxy object
 * @returns {Promise<object>} - Scraped lyrics and source
 */
const trySources = async (proxy, title, artist) => {
  try {
    const result = await scrapers.azLyrics.scrapeLyrics(proxy, title, artist);
    return { lyrics: result, source: "azLyrics" };
  } catch (error) {
    console.log(`AZLyrics failed: ${error.message}, trying Genius...`);
    try {
      const result = await scrapers.geniusLyrics.scrapeLyrics(
        proxy,
        title,
        artist
      );
      return { lyrics: result, source: "geniusLyrics" };
    } catch (error) {
      // Re-throw the error to be caught by tryWithDifferentProxies
      throw new Error(`Genius failed: ${error.message}`);
    }
  }
};

// GET /lyrics route
router.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required." });
  }

  try {
    // Try AZLyrics first, then Genius if it fails
    const result = await tryWithDifferentProxies(async (proxy) =>
      trySources(proxy, title, artist)
    );

    res.json({ lyrics: result.lyrics, source: result.source });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: "Failed to fetch lyrics after trying all proxies.",
    });
  }
});

export default router;
// // Example of trying multiple scrapers in sequence
// const trySources = async (title, artist, proxy) => {
//     try {
//       return await scrapers.azLyrics.scrapeLyrics(title, artist, proxy);
//     } catch (error) {
//       console.log(`AZLyrics failed: ${error.message}, trying Genius...`);
//       return await scrapers.geniusLyrics.scrapeLyrics(title, artist, proxy);
//     }
//   };

//   // In your route handler:
//   const result = await tryWithDifferentProxies(async (proxy) => {
//     return await trySources(title, artist, proxy);
//   });
