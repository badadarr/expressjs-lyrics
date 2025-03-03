import express from "express";
import { tryWithDifferentProxies } from "../utils/proxyManager.js";
import scrapers from "../scrapers/index.js";

const router = express.Router();

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
    // Function to try multiple scrapers in sequence
    const trySources = async (title, artist, proxy) => {
      try {
        // First try AzLyrics
        return await scrapers.scrapeLyricsWithErrorHandling(
          title,
          artist,
          proxy
        );
      } catch (error) {
        console.log(`AZLyrics failed: ${error.message}, trying Musixmatch...`);
        // If AzLyrics fails, try Musixmatch
        return await scrapers.scrapeMusixmatchLyricsWithErrorHandling(
          title,
          artist,
          proxy
        );
      }
    };

    // Use proxy rotation system with retry mechanism
    const result = await tryWithDifferentProxies(async (proxy) => {
      return await trySources(title, artist, proxy);
    });

    // Send response to client
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: "Failed to fetch lyrics after trying all proxies",
    });
  }
});

export default router;
