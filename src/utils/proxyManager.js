import tunnel from "tunnel";
import { proxies } from "../config/proxies.js";
import fetch from "node-fetch"; // Import fetch untuk cek IP

// Keep track of used proxies
let usedProxies = new Set();

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
 * Gets a random proxy that hasn't been used yet
 * @returns {Object} A random, unused proxy with tunnel agent
 */
export function getNextProxy() {
  if (!proxies.length) {
    throw new Error("Proxy list is empty! Please check your proxies config.");
  }

  // Create a list of available proxies (not yet used)
  let availableProxies = proxies.filter(
    (proxyStr, index) => !usedProxies.has(index)
  );

  // If all proxies have been used, reset the usedProxies set
  if (availableProxies.length === 0) {
    console.log("All proxies have been tried. Resetting used proxies.");
    usedProxies.clear();
    availableProxies = [...proxies]; // Reset available proxies
  }

  // Pick a random proxy from the available proxies
  const randomIndex = Math.floor(Math.random() * availableProxies.length);
  const proxyStr = availableProxies[randomIndex];
  const proxyIndex = proxies.indexOf(proxyStr); // Get the index of the selected proxy

  usedProxies.add(proxyIndex); // Mark the proxy as used

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
