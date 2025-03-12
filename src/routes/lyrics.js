import express from "express";
import { tryWithDifferentProxies } from "../utils/proxymanager.js";
import scrapers from "../scrapers/index.js";

const router = express.Router();

/**
 * Attempts to scrape lyrics using multiple sources.
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {object} proxy - Proxy object
 * @returns {Promise<string>} - Scraped lyrics
 */
const trySources = async (title, artist, proxy) => {
  try {
    return await scrapers.azLyrics.scrapeLyrics(title, artist, proxy);
  } catch (error) {
    console.log(`AZLyrics failed: ${error.message}, trying Genius...`);
    return await scrapers.geniusLyrics.scrapeLyrics(title, artist, proxy);
  }
};

// GET /lyrics route
router.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res
      .status(400)
      .json({ error: "Parameters 'title' and 'artist' are required." });
  }

  try {
    // Try AZLyrics first, then Genius if it fails
    const result = await tryWithDifferentProxies((proxy) =>
      trySources(title, artist, proxy)
    );

    res.json({ lyrics: result });
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
