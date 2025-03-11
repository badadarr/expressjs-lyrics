import { createBrowserContext, setupPage } from "../utils/browserHelper.js";
import { getLanguageInfo } from "../utils/languageDetector.js";
import {
  getNextProxy,
  tryWithDifferentProxies,
} from "../utils/proxymanager.js";
import express from "express";
import { chromium } from "playwright";

(async () => {
  // Launch a new browser instance
  const browser = await chromium.launch({ headless: false }); // Set headless: true to run without UI
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to the Genius homepage
  await page.goto("https://genius.com");

  // Wait for the search input to be visible
  await page.waitForSelector('input[name="q"]');

  // Type the song title and artist into the search input
  const songTitle = "Into the Night"; // Replace with the desired song title
  const artistName = "yoasobi"; // Replace with the desired artist name
  const additionalTerm = "romanized"; // Additional term for Japanese/Korean songs

  // Construct the search query
  const searchQuery = `${songTitle} ${artistName} ${additionalTerm}`;
  await page.fill('input[name="q"]', searchQuery);

  // Submit the form by pressing Enter
  await page.keyboard.press("Enter");

  // Wait for the search results to load
  try {
    await page.waitForSelector("search-result-item", { timeout: 60000 }); // Wait for the first search result item
  } catch (error) {
    console.error("Search results did not load in time:", error);
    await browser.close();
    return;
  }

  // Try to click the top result
  const topResult = await page.$('div[ng-if="$ctrl.section.hits.length > 0"]');
  if (topResult) {
    const topResultLink = await topResult.$("a.mini_card");
    if (topResultLink) {
      await topResultLink.click(); // Click the top result link
      console.log(`Navigated to: ${await page.url()}`);
    } else {
      console.log("No link found in the top result.");
    }
  } else {
    console.log("No top result found. Trying to click the first song.");

    // If no top result, click the first song in the songs section
    const firstSong = await page.$("search-result-item");
    if (firstSong) {
      const firstSongLink = await firstSong.$("a.mini_card");
      if (firstSongLink) {
        await firstSongLink.click(); // Click the first song link
        console.log(`Navigated to: ${await page.url()}`);
      } else {
        console.log("No link found in the first song.");
      }
    } else {
      console.log("No songs found in the search results.");
      await browser.close();
      return; // Exit if no songs are found
    }
  }

  // Wait for the lyrics page to load
  await page.waitForSelector('div[data-lyrics-container="true"]');

  // Extract the lyrics as plain text
  const lyrics = await page.$eval(
    'div[data-lyrics-container="true"]',
    (el) => el.innerText // Get the inner text of the lyrics container
  );

  // Log the cleaned lyrics
  console.log("Lyrics:", lyrics);

  // Close the browser
  await browser.close();
})();
