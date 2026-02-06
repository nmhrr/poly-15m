import { CONFIG } from "../config.js";
import { placeClobOrder } from "../data/polymarketClobClient.js";
import { appendCsvRow } from "../utils.js";

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseWindows(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((window) => {
      const [start, end] = window.split("-").map((v) => v.trim());
      if (!start || !end) return null;
      const [sh, sm = "0"] = start.split(":");
      const [eh, em = "0"] = end.split(":");
      const startMin = Number(sh) * 60 + Number(sm);
      const endMin = Number(eh) * 60 + Number(em);
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
      return { startMin, endMin };
    })
    .filter(Boolean);
}

function getEtMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hh * 60 + mm;
}

function isInWindow(nowMin, window) {
  if (window.startMin <= window.endMin) {
    return nowMin >= window.startMin && nowMin <= window.endMin;
  }
  return nowMin >= window.startMin || nowMin <= window.endMin;
}

function formatDecisionReason(reason, details = {}) {
  const suffix = Object.keys(details).length
    ? ` (${Object.entries(details).map(([k, v]) => `${k}=${v}`).join(", ")})`
    : "";
  return `${reason}${suffix}`;
}

function centsFromPrice(price, unit) {
  const p = toNumber(price);
  if (p === null) return null;
  if (unit === "dollars") return p * 100;
  return p;
}

function sharesFromUsd({ usd, priceCents }) {
  if (priceCents === null || priceCents <= 0) return null;
  return usd / (priceCents / 100);
}

function normalizeSide(side) {
  return side === "UP" ? "buy" : side === "DOWN" ? "buy" : null;
}

export function createAutoTrader() {
  const state = {
    lastTradeBySlug: new Map(),
    lastDecision: null
  };

  const blockedWindows = parseWindows(CONFIG.trading.blockedEtWindows);
  const tradesHeader = [
    "timestamp",
    "market_slug",
    "side",
    "price_cents",
    "size_shares",
    "predict_pct",
    "time_left_min",
    "distance_usd",
    "reason",
    "order_id"
  ];
  const ordersHeader = [
    "timestamp",
    "market_slug",
    "side",
    "price_cents",
    "size_shares",
    "signal",
    "recommendation",
    "order_status",
    "order_id",
    "error"
  ];

  async function maybeTrade({
    marketSlug,
    timeLeftMin,
    pLong,
    pShort,
    heikenColor,
    heikenCount,
    marketUp,
    marketDown,
    priceToBeat,
    currentPrice,
    regime,
    signal,
    recommendation
  }) {
    if (!CONFIG.trading.enabled) {
      return { action: "SKIP", reason: "disabled" };
    }

    if (!CONFIG.trading.dryRun) {
      const accountType = CONFIG.trading.accountType;
      if (!accountType || !["email", "wallet"].includes(accountType)) {
        return { action: "SKIP", reason: "missing_account_type" };
      }
      if (!CONFIG.trading.privateKey) {
        return { action: "SKIP", reason: "missing_private_key" };
      }
    }

    if (!marketSlug) {
      return { action: "SKIP", reason: "missing_market_slug" };
    }

    if (!Number.isFinite(timeLeftMin)) {
      return { action: "SKIP", reason: "missing_time_left" };
    }

    if (timeLeftMin <= CONFIG.trading.minMinutesLeft || timeLeftMin > CONFIG.trading.maxMinutesLeft) {
      return { action: "SKIP", reason: formatDecisionReason("outside_time_window", { timeLeftMin: timeLeftMin.toFixed(2) }) };
    }

    if (blockedWindows.length) {
      const nowMin = getEtMinutes();
      if (blockedWindows.some((w) => isInWindow(nowMin, w))) {
        return { action: "SKIP", reason: "blocked_et_window" };
      }
    }

    const minPredict = CONFIG.trading.minPredictPct;
    if (!Number.isFinite(pLong) || !Number.isFinite(pShort)) {
      return { action: "SKIP", reason: "missing_predict" };
    }
    const side = pLong >= minPredict && pLong > pShort
      ? "UP"
      : pShort >= minPredict && pShort > pLong
        ? "DOWN"
        : null;

    if (!side) {
      return { action: "SKIP", reason: formatDecisionReason("predict_below_threshold", { pLong, pShort }) };
    }

    const heiken = String(heikenColor ?? "").toLowerCase();
    const expectedColor = side === "UP" ? "green" : "red";
    if (CONFIG.trading.requireHeikenColor && heiken !== expectedColor) {
      return { action: "SKIP", reason: formatDecisionReason("heiken_mismatch", { heiken, expectedColor }) };
    }

    if (CONFIG.trading.minHeikenCount > 0 && (heikenCount ?? 0) < CONFIG.trading.minHeikenCount) {
      return { action: "SKIP", reason: formatDecisionReason("heiken_too_mixed", { heikenCount }) };
    }

    const priceCents = side === "UP" ? centsFromPrice(marketUp, CONFIG.trading.priceUnit) : centsFromPrice(marketDown, CONFIG.trading.priceUnit);
    if (priceCents === null) {
      return { action: "SKIP", reason: "missing_market_price" };
    }

    if (priceCents > CONFIG.trading.maxPriceCents) {
      return { action: "SKIP", reason: formatDecisionReason("price_too_high", { priceCents }) };
    }

    const predictPct = side === "UP" ? pLong : pShort;
    if (CONFIG.trading.enforcePriceVsPredict && priceCents > predictPct * 100) {
      return { action: "SKIP", reason: formatDecisionReason("price_above_predict", { priceCents, predictPct }) };
    }

    const current = toNumber(currentPrice);
    const target = toNumber(priceToBeat);
    if (current === null || target === null) {
      return { action: "SKIP", reason: "missing_price_to_beat" };
    }

    const distance = Math.abs(current - target);
    const isVolatile = String(regime ?? "").startsWith("TREND");
    const distanceMin = isVolatile ? CONFIG.trading.minDistanceVolatileUsd : CONFIG.trading.minDistanceQuietUsd;
    if (distance < distanceMin) {
      return { action: "SKIP", reason: formatDecisionReason("distance_too_small", { distance: distance.toFixed(2) }) };
    }

    const tradesForMarket = state.lastTradeBySlug.get(marketSlug) ?? [];
    if (tradesForMarket.length >= CONFIG.trading.maxTradesPerMarket) {
      return { action: "SKIP", reason: "trade_limit_reached" };
    }

    const priceSide = normalizeSide(side);
    const usdAmount = CONFIG.trading.orderUsd;
    const sizeShares = sharesFromUsd({ usd: usdAmount, priceCents });
    if (sizeShares === null || sizeShares <= 0) {
      return { action: "SKIP", reason: "invalid_order_size" };
    }

    const tokenId = side === "UP" ? CONFIG.trading.upTokenId : CONFIG.trading.downTokenId;
    if (!tokenId) {
      return { action: "SKIP", reason: "missing_token_id" };
    }

    const sizeRounded = Number(sizeShares.toFixed(4));
    const priceRounded = Number(priceCents.toFixed(2));
    const reason = formatDecisionReason("trade_ready", { side, priceCents: priceRounded, sizeShares: sizeRounded });

    if (CONFIG.trading.dryRun) {
      appendCsvRow("./logs/trades.csv", tradesHeader, [
        new Date().toISOString(),
        marketSlug,
        side,
        priceRounded,
        sizeRounded,
        predictPct,
        timeLeftMin.toFixed(3),
        distance.toFixed(2),
        "dry_run",
        ""
      ]);
      appendCsvRow("./logs/orders.csv", ordersHeader, [
        new Date().toISOString(),
        marketSlug,
        side,
        priceRounded,
        sizeRounded,
        signal ?? "",
        recommendation ?? "",
        "dry_run",
        "",
        ""
      ]);
      state.lastDecision = { action: "DRY_RUN", reason };
      return { action: "DRY_RUN", reason };
    }

    let order = null;
    try {
      order = await placeClobOrder({
        tokenId,
        side: priceSide,
        price: CONFIG.trading.priceUnit === "dollars" ? priceRounded / 100 : priceRounded,
        size: sizeRounded,
        type: CONFIG.trading.orderType,
        timeInForce: CONFIG.trading.timeInForce
      });
    } catch (err) {
      const message = err?.message ?? String(err);
      appendCsvRow("./logs/orders.csv", ordersHeader, [
        new Date().toISOString(),
        marketSlug,
        side,
        priceRounded,
        sizeRounded,
        signal ?? "",
        recommendation ?? "",
        "failed",
        "",
        message
      ]);
      state.lastDecision = { action: "FAILED", reason: message };
      return { action: "FAILED", reason: message };
    }

    const updatedTrades = [...tradesForMarket, { side, at: Date.now(), order }];
    state.lastTradeBySlug.set(marketSlug, updatedTrades);
    appendCsvRow("./logs/trades.csv", tradesHeader, [
      new Date().toISOString(),
      marketSlug,
      side,
      priceRounded,
      sizeRounded,
      predictPct,
      timeLeftMin.toFixed(3),
      distance.toFixed(2),
      "submitted",
      order?.order_id ?? order?.id ?? ""
    ]);
    appendCsvRow("./logs/orders.csv", ordersHeader, [
      new Date().toISOString(),
      marketSlug,
      side,
      priceRounded,
      sizeRounded,
      signal ?? "",
      recommendation ?? "",
      order?.status ?? "submitted",
      order?.order_id ?? order?.id ?? "",
      ""
    ]);

    state.lastDecision = { action: "TRADE", reason };
    return { action: "TRADE", reason, order };
  }

  function updateTokenIds({ upTokenId, downTokenId }) {
    CONFIG.trading.upTokenId = upTokenId ?? CONFIG.trading.upTokenId;
    CONFIG.trading.downTokenId = downTokenId ?? CONFIG.trading.downTokenId;
  }

  function formatStatusLine() {
    if (!state.lastDecision) return "";
    return `AutoTrade: ${state.lastDecision.action} | ${state.lastDecision.reason}`;
  }

  return {
    maybeTrade,
    updateTokenIds,
    formatStatusLine
  };
}
