import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers5";

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
