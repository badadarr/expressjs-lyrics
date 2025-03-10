import { chromium } from "playwright";
import userAgentManager from "./userAgentManager.js";

/**
 * Creates a browser context with proxy settings
 * @param {Object} proxy - Proxy configuration
 * @returns {Promise<Object>} Browser context object
 */
export async function createBrowserContext(proxy) {
  return await chromium.launchPersistentContext("", {
    headless: true,
    proxy: {
      server: `${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    },
    timeout: 60000,
    args: [`--proxy-server=${proxy.type}://${proxy.host}:${proxy.port}`],
  });
}

/**
 * Sets up a page with common configurations
 * @param {Object} page - Playwright page object
 * @returns {Promise<void>}
 */
export async function setupPage(page) {
  await page.setDefaultTimeout(60000);
  await page.setDefaultNavigationTimeout(60000);

  // Handle dialogs automatically
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });

  // Ambil User-Agent secara acak dari userAgentManager.js
  const randomUserAgent = userAgentManager.getRandomUserAgent();

  // Tetapkan User-Agent pada page
  await page.setExtraHTTPHeaders({
    "User-Agent": randomUserAgent,
  });

  console.log(`User-Agent yang digunakan: ${randomUserAgent}`);
}

/**
 * Checks if the User-Agent is set correctly
 * @param {Object} page - Playwright page object
 * @returns {Promise<void>}
 */
export async function checkUserAgent(page) {
  await page.goto("https://httpbin.org/headers");

  const headersText = await page.evaluate(() => document.body.innerText);
  console.log("Headers received from server:", headersText);
}

export default {
  createBrowserContext,
  setupPage,
  checkUserAgent,
};
