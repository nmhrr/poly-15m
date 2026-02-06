export const CONFIG = {
  symbol: "BTCUSDT",
  binanceBaseUrl: "https://api.binance.com",
  gammaBaseUrl: "https://gamma-api.polymarket.com",
  clobBaseUrl: "https://clob.polymarket.com",

  pollIntervalMs: 1_000,
  candleWindowMinutes: 15,

  vwapSlopeLookbackMinutes: 5,
  rsiPeriod: 14,
  rsiMaPeriod: 14,

  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,

  polymarket: {
    marketSlug: process.env.POLYMARKET_SLUG || "",
    seriesId: process.env.POLYMARKET_SERIES_ID || "10192",
    seriesSlug: process.env.POLYMARKET_SERIES_SLUG || "btc-up-or-down-15m",
    autoSelectLatest: (process.env.POLYMARKET_AUTO_SELECT_LATEST || "true").toLowerCase() === "true",
    liveDataWsUrl: process.env.POLYMARKET_LIVE_WS_URL || "wss://ws-live-data.polymarket.com",
    upOutcomeLabel: process.env.POLYMARKET_UP_LABEL || "Up",
    downOutcomeLabel: process.env.POLYMARKET_DOWN_LABEL || "Down"
  },

  chainlink: {
    polygonRpcUrls: (process.env.POLYGON_RPC_URLS || "").split(",").map((s) => s.trim()).filter(Boolean),
    polygonRpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    polygonWssUrls: (process.env.POLYGON_WSS_URLS || "").split(",").map((s) => s.trim()).filter(Boolean),
    polygonWssUrl: process.env.POLYGON_WSS_URL || "",
    btcUsdAggregator: process.env.CHAINLINK_BTC_USD_AGGREGATOR || "0xc907E116054Ad103354f2D350FD2514433D57F6f"
  },

  trading: {
    enabled: (process.env.POLYMARKET_AUTO_TRADE || "false").toLowerCase() === "true",
    dryRun: (process.env.POLYMARKET_DRY_RUN || "true").toLowerCase() === "true",
    accountType: (process.env.POLYMARKET_ACCOUNT_TYPE || "").toLowerCase(),
    privateKey: process.env.POLYMARKET_PRIVATE_KEY || "",
    apiKey: process.env.POLYMARKET_CLOB_API_KEY || "",
    apiSecret: process.env.POLYMARKET_CLOB_API_SECRET || "",
    apiPassphrase: process.env.POLYMARKET_CLOB_API_PASSPHRASE || "",
    orderPath: process.env.POLYMARKET_CLOB_ORDER_PATH || "/order",
    orderType: process.env.POLYMARKET_CLOB_ORDER_TYPE || "limit",
    timeInForce: process.env.POLYMARKET_CLOB_TIME_IN_FORCE || "gtc",
    signatureEncoding: process.env.POLYMARKET_CLOB_SIGNATURE_ENCODING || "hex",
    timestampUnit: process.env.POLYMARKET_CLOB_TIMESTAMP_UNIT || "s",
    orderUsd: Number(process.env.POLYMARKET_ORDER_USD || "10"),
    minMinutesLeft: Number(process.env.POLYMARKET_MIN_MINUTES_LEFT || "5"),
    maxMinutesLeft: Number(process.env.POLYMARKET_MAX_MINUTES_LEFT || "9"),
    minPredictPct: Number(process.env.POLYMARKET_MIN_PREDICT_PCT || "0.65"),
    enforcePriceVsPredict: (process.env.POLYMARKET_ENFORCE_PRICE_VS_PREDICT || "true").toLowerCase() === "true",
    maxPriceCents: Number(process.env.POLYMARKET_MAX_PRICE_CENTS || "99"),
    minDistanceQuietUsd: Number(process.env.POLYMARKET_MIN_DISTANCE_QUIET_USD || "50"),
    minDistanceVolatileUsd: Number(process.env.POLYMARKET_MIN_DISTANCE_VOLATILE_USD || "100"),
    requireHeikenColor: (process.env.POLYMARKET_REQUIRE_HEIKEN_COLOR || "true").toLowerCase() === "true",
    minHeikenCount: Number(process.env.POLYMARKET_MIN_HEIKEN_COUNT || "2"),
    maxTradesPerMarket: Number(process.env.POLYMARKET_MAX_TRADES_PER_MARKET || "1"),
    blockedEtWindows: process.env.POLYMARKET_BLOCKED_ET_WINDOWS || "09:30-10:15",
    priceUnit: process.env.POLYMARKET_PRICE_UNIT || "cents",
    upTokenId: "",
    downTokenId: ""
  },

  ui: {
    tailCsvEnabled: (process.env.POLYMARKET_CSV_TAIL || "false").toLowerCase() === "true",
    tailCsvPath: process.env.POLYMARKET_CSV_TAIL_PATH || "./logs/signals.csv",
    tailOrdersEnabled: (process.env.POLYMARKET_ORDERS_TAIL || "true").toLowerCase() === "true",
    tailOrdersPath: process.env.POLYMARKET_ORDERS_TAIL_PATH || "./logs/orders.csv"
  }
};
