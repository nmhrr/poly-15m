import crypto from "node:crypto";
import { CONFIG } from "../config.js";

function signRequest({ secret, timestamp, method, path, body }) {
  const payload = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function buildAuthHeaders({ apiKey, apiSecret, apiPassphrase, method, path, body }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({
    secret: apiSecret,
    timestamp,
    method,
    path,
    body
  });

  return {
    "X-API-KEY": apiKey,
    "X-API-PASSPHRASE": apiPassphrase,
    "X-API-TIMESTAMP": timestamp,
    "X-API-SIGNATURE": signature,
    "Content-Type": "application/json"
  };
}

function buildRequestUrl(path) {
  return new URL(path, CONFIG.clobBaseUrl).toString();
}

export async function placeClobOrder({ tokenId, side, price, size, type = "limit", timeInForce = "gtc" }) {
  const apiKey = CONFIG.trading.apiKey;
  const apiSecret = CONFIG.trading.apiSecret;
  const apiPassphrase = CONFIG.trading.apiPassphrase;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    throw new Error("Missing Polymarket CLOB API credentials.");
  }

  const body = JSON.stringify({
    token_id: tokenId,
    side,
    price,
    size,
    type,
    time_in_force: timeInForce
  });

  const path = CONFIG.trading.orderPath;
  const headers = buildAuthHeaders({
    apiKey,
    apiSecret,
    apiPassphrase,
    method: "POST",
    path,
    body
  });

  const res = await fetch(buildRequestUrl(path), {
    method: "POST",
    headers,
    body
  });

  if (!res.ok) {
    throw new Error(`CLOB order error: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}
