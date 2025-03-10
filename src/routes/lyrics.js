import express from "express";
import {
  getNextProxy,
  tryWithDifferentProxies,
} from "../utils/proxymanager.js";
import scrapers from "../scrapers/index.js";

const router = express.Router();

// GET /lyrics route
router.get("/lyrics", async (req, res) => {
  const title = req.query.title;
  const artist = req.query.artist;

  if (!title || !artist) {
    return res.status(400).json({ error: "Title and artist are required." });
  }

  const proxy = getNextProxy(); // Dapatkan proxy
  try {
    const lyrics = await tryWithDifferentProxies(() =>
      scrapers.scrapeLyrics(title, artist, proxy)
    );
    return res.json({ lyrics });
  } catch (error) {
    console.error(`Error scraping lyrics: ${error.message}`);
    return res.status(500).json({ error: "Failed to fetch lyrics." });
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
