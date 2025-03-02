import tunnel from "tunnel";
import { proxies } from "../config/proxies.js";

// Keep track of the last used proxy
let currentProxyIndex = 0;

/**
 * Parses a proxy string into components
 * @param {string} proxyStr - Proxy string in format "host:port:username:password"
 * @returns {Object} Parsed proxy object
 */
export function parseProxy(proxyStr) {
  const [host, port, username, password] = proxyStr.split(":");
  return {
    host,
    port: parseInt(port),
    username,
    password,
  };
}

/**
 * Gets the next proxy in rotation
 * @returns {Object} Next proxy with tunnel agent
 */
export function getNextProxy() {
  const proxyStr = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  const parsedProxy = parseProxy(proxyStr);

  // Create tunneling agent
  const tunnelAgent = tunnel.httpsOverHttp({
    proxy: {
      host: parsedProxy.host,
      port: parsedProxy.port,
      proxyAuth: `${parsedProxy.username}:${parsedProxy.password}`,
    },
  });

  return {
    ...parsedProxy,
    tunnelAgent,
  };
}

/**
 * Attempts an async function with different proxies until success or max retries
 * @param {Function} asyncFn - Async function that takes a proxy as parameter
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<any>} Result of the async function
 */
export async function tryWithDifferentProxies(asyncFn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const proxy = getNextProxy();
      console.log(`Trying with proxy: ${proxy.host}:${proxy.port}`);
      return await asyncFn(proxy);
    } catch (error) {
      lastError = error;
      console.log(
        `Attempt ${attempt + 1} failed: ${error.message}. Trying next proxy...`
      );
    }
  }
  throw new Error(
    `All proxy attempts failed after ${maxRetries} retries. Last error: ${lastError.message}`
  );
}

export default {
  parseProxy,
  getNextProxy,
  tryWithDifferentProxies,
};
