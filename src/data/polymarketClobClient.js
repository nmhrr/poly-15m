import crypto from "node:crypto";
import { Wallet } from "ethers5";
import { ClobClient } from "@polymarket/clob-client";
import { CONFIG } from "../config.js";

const CHAIN_ID = 137;
let derivedCredsPromise = null;

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
