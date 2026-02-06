import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Wallet } from "ethers5";

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
  "src/index.js",
];
const resolveEntryPath = () =>
  candidateEntries
    .map((entry) => path.join(packageRoot, entry))
    .find((candidate) => fs.existsSync(candidate));

const ensureClobClientBuild = () => {
  if (!fs.existsSync(packageRoot)) {
    return false;
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const installResult = spawnSync(npmCmd, ["install"], {
    cwd: packageRoot,
    stdio: "inherit",
  });

  if (installResult.status !== 0) {
    return false;
  }

  const buildResult = spawnSync(npmCmd, ["run", "build"], {
    cwd: packageRoot,
    stdio: "inherit",
  });

  return buildResult.status === 0;
};

let entryPath = resolveEntryPath();

if (!entryPath) {
  const buildSucceeded = ensureClobClientBuild();
  if (buildSucceeded) {
    entryPath = resolveEntryPath();
  }
}

if (!entryPath) {
  console.error("Missing @polymarket/clob-client build artifacts.");
  console.error("Try:");
  console.error("  npm install");
  console.error("  cd node_modules/@polymarket/clob-client");
  console.error("  npm install");
  console.error("  npm run build");
  console.error("Then re-run: npm run derive-user-creds");
  process.exit(1);
}

const clobModule = await import(pathToFileURL(entryPath).href);
const ClobClient = clobModule.ClobClient ?? clobModule.default?.ClobClient;

if (!ClobClient) {
  console.error("Unable to load ClobClient from @polymarket/clob-client.");
  process.exit(1);
}

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
  console.error("Missing PRIVATE_KEY in environment. Aborting.");
  process.exit(1);
}

const signer = new Wallet(privateKey);
const client = new ClobClient(HOST, CHAIN_ID, signer);

const userApiCreds = await client.createOrDeriveApiKey();

console.log("API Key:", userApiCreds.apiKey);
console.log("Secret:", userApiCreds.secret);
console.log("Passphrase:", userApiCreds.passphrase);
