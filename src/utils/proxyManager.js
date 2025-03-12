import tunnel from "tunnel";
import { proxies } from "../config/proxies.js";
import fetch from "node-fetch"; // Import fetch untuk cek IP

// Keep track of the last used proxy
let currentProxyIndex = 0;

/**
 * Parses a proxy string into components
 * @param {string} proxyStr - Proxy string in format "host:port:username:password:type"
 * @returns {Object} Parsed proxy object
 */
export function parseProxy(proxyStr) {
  const [host, port, username, password, type = "http"] = proxyStr.split(":");
  return {
    host,
    port: parseInt(port),
    username,
    password,
    type: type.toLowerCase(),
  };
}

/**
 * Creates a tunnel agent based on proxy type
 * @param {Object} proxy - Parsed proxy object
 * @returns {Object} Tunnel agent
 */
function createTunnelAgent(proxy) {
  if (proxy.type === "socks5") {
    return tunnel.httpsOverSocks({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        proxyAuth: `${proxy.username}:${proxy.password}`,
      },
    });
  } else {
    return tunnel.httpsOverHttp({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        proxyAuth: `${proxy.username}:${proxy.password}`,
      },
    });
  }
}

/**
 * Gets the next proxy in rotation
 * @returns {Object} Next proxy with tunnel agent
 */
export function getNextProxy() {
  if (!proxies.length) {
    throw new Error("Proxy list is empty! Please check your proxies config.");
  }

  const proxyStr = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  const parsedProxy = parseProxy(proxyStr);

  // Create tunneling agent based on proxy type
  const tunnelAgent = createTunnelAgent(parsedProxy);

  return {
    ...parsedProxy,
    tunnelAgent,
  };
}

/**
 * Checks if the proxy is working by fetching IP from httpbin
 * @param {Object} proxy - Proxy object with tunnelAgent
 * @returns {Promise<boolean>} True if proxy works, false otherwise
 */
async function checkProxy(proxy) {
  try {
    const response = await fetch("https://httpbin.org/ip", {
      agent: proxy.tunnelAgent,
    });
    const data = await response.json();
    console.log(`Your IP (via proxy): ${data.origin}`);
    return true;
  } catch (error) {
    console.log(`Proxy ${proxy.host}:${proxy.port} failed: ${error.message}`);
    return false;
  }
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
      console.log(
        `Trying with proxy: ${proxy.host}:${proxy.port} (Type: ${proxy.type})`
      );
      return await asyncFn(proxy);
    } catch (error) {
      lastError = error;
      console.log(`Proxy ${proxy.host}:${proxy.port} failed: ${error.message}`);
      console.log(`Skipping invalid proxy...`);
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
  checkProxy,
};
