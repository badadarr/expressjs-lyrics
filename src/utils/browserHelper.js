import { chromium } from "playwright";

/**
 * Creates a browser context with proxy settings
 * @param {Object} proxy - Proxy configuration
 * @returns {Promise<Object>} Browser context object
 */
export async function createBrowserContext(proxy) {
  return await chromium.launchPersistentContext("", {
    headless: false,
    proxy: {
      server: `${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    },
    timeout: 60000,
    args: [`--proxy-server=http://${proxy.host}:${proxy.port}`],
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

  // Set user agent
  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  });
}

export default {
  createBrowserContext,
  setupPage,
};
