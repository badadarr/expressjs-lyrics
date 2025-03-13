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
const trySources = async (title, artist, proxy) => {
  try {
    const lyrics = await scrapers.azLyrics.scrapeLyrics(title, artist, proxy);
    return { lyrics, source: "azLyrics" };
  } catch (error) {
    console.log(`AZLyrics failed: ${error.message}, trying Genius...`);
    const lyrics = await scrapers.geniusLyrics.scrapeLyrics(
      title,
      artist,
      proxy
    );
    return { lyrics, source: "geniusLyrics" };
  }
};

// GET /lyrics route
router.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required." });
  }

  const proxy = getNextProxy(); // Dapatkan proxy
  try {
    // Try AZLyrics first, then Genius if it fails
    const result = await tryWithDifferentProxies((proxy) =>
      trySources(title, artist, proxy)
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
