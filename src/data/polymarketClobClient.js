import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Wallet } from "ethers5";
import { CONFIG } from "../config.js";

const CHAIN_ID = 137;
let derivedCredsPromise = null;
let clobClientPromise = null;

async function loadClobClient() {
  if (clobClientPromise) {
    return clobClientPromise;
  }

  clobClientPromise = (async () => {
    const packageRoot = path.join(
      process.cwd(),
      "node_modules",
      "@polymarket",
      "clob-client"
    );
    const candidateEntries = [
      "dist/index.js",
      "dist/index.mjs",
      "dist/index.cjs",
      "src/index.js"
    ];
    const entryPath = candidateEntries
      .map((entry) => path.join(packageRoot, entry))
      .find((candidate) => fs.existsSync(candidate));

    if (!entryPath) {
      throw new Error(
        "Missing @polymarket/clob-client build artifacts. " +
          "Run: npm install, then cd node_modules/@polymarket/clob-client && npm install && npm run build."
      );
    }

    const clobModule = await import(pathToFileURL(entryPath).href);
    const ClobClient = clobModule.ClobClient ?? clobModule.default?.ClobClient;
    if (!ClobClient) {
      throw new Error("Unable to load ClobClient from @polymarket/clob-client.");
    }

    return ClobClient;
  })();

  return clobClientPromise;
}

function signRequest({ secret, timestamp, method, path, body, encoding }) {
  const payload = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return crypto.createHmac("sha256", secret).update(payload).digest(encoding);
}

function buildAuthHeaders({ apiKey, apiSecret, apiPassphrase, method, path, body, encoding, timestampUnit }) {
  const timestamp = timestampUnit === "ms"
    ? String(Date.now())
    : String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: apiSecret,
    timestamp,
    method,
    path,
    body,
    encoding
  });

  return {
    "X-API-KEY": apiKey,
    "X-API-PASSPHRASE": apiPassphrase,
    "X-API-TIMESTAMP": timestamp,
    "X-API-SIGNATURE": signature,
    "Content-Type": "application/json"
  };
}

function normalizePath(path) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function buildRequestUrl(path) {
  return new URL(normalizePath(path), CONFIG.clobBaseUrl).toString();
}

export async function placeClobOrder({ tokenId, side, price, size, type = "limit", timeInForce = "gtc" }) {
  let apiKey = CONFIG.trading.apiKey;
  let apiSecret = CONFIG.trading.apiSecret;
  let apiPassphrase = CONFIG.trading.apiPassphrase;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    const privateKey = CONFIG.trading.privateKey;
    if (!privateKey) {
      throw new Error("Missing POLYMARKET_PRIVATE_KEY for CLOB authentication.");
    }
    if (!derivedCredsPromise) {
      derivedCredsPromise = (async () => {
        const signer = new Wallet(privateKey);
        const ClobClient = await loadClobClient();
        const client = new ClobClient(CONFIG.clobBaseUrl, CHAIN_ID, signer);
        return await client.createOrDeriveApiKey();
      })();
    }
    const derived = await derivedCredsPromise;
    apiKey = derived?.apiKey ?? "";
    apiSecret = derived?.secret ?? "";
    apiPassphrase = derived?.passphrase ?? "";
  }

  if (!apiKey || !apiSecret || !apiPassphrase) {
    throw new Error("Missing Polymarket CLOB API credentials after derivation.");
  }

  const body = JSON.stringify({
    token_id: tokenId,
    side,
    price,
    size,
    type,
    time_in_force: timeInForce
  });

  const path = normalizePath(CONFIG.trading.orderPath);
  const headers = buildAuthHeaders({
    apiKey,
    apiSecret,
    apiPassphrase,
    method: "POST",
    path,
    body,
    encoding: CONFIG.trading.signatureEncoding,
    timestampUnit: CONFIG.trading.timestampUnit
  });

  const res = await fetch(buildRequestUrl(path), {
    method: "POST",
    headers,
    body
  });

  if (!res.ok) {
    const details = await res.text();
    if (res.status === 401) {
      throw new Error(
        `CLOB order error: ${res.status} ${details} ` +
        "(Check that you are using user API credentials derived from your private key; " +
        "builder API keys from the Polymarket settings page cannot authenticate orders.)"
      );
    }
    throw new Error(`CLOB order error: ${res.status} ${details}`);
  }

  return await res.json();
}
