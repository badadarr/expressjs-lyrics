import azLyrics from "./azLyrics.js";
import geniusLyrics from "./geniusLyrics.js";

// Add additional scrapers here as you develop them
// Example: import geniusLyrics from "./geniusLyrics.js";

// Export all scrapers for easy access
export default {
  scrapeLyrics: azLyrics.scrapeLyrics, // Pastikan untuk mengakses fungsi dengan benar
  geniusLyrics,
};
