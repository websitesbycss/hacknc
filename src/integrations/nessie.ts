// Nessie (Capital One) REST wrapper.
// UNVERIFIED: endpoint paths and body shapes below are from memory because the
// Nessie docs were unreachable during build. Check them against
// https://api.nessieisreal.com/documentation before relying on them. Set
// NESSIE_FIXTURES=1 to bypass the network entirely.
import { config } from "../config.js";

const BASE = "https://api.nessieisreal.com";

export type Purchase = {
  _id: string;
  amount: number;
  description?: string;
  purchase_date: string;
  merchant_id?: string;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}key=${config.nessieApiKey}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Nessie ${method} ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const FIXTURE_BALANCE = 400;

export async function getBalance(accountId: string): Promise<number> {
  if (config.nessieFixtures) return FIXTURE_BALANCE;
  const acct = await call<{ balance: number }>("GET", `/accounts/${accountId}`);
  return acct.balance;
}

export async function listPurchases(accountId: string): Promise<Purchase[]> {
  if (config.nessieFixtures) return [];
  return call<Purchase[]>("GET", `/accounts/${accountId}/purchases`);
}

// Demo helper: creates a merchant, then a purchase on the demo account
export async function createPurchase(args: {
  accountId: string;
  merchantName: string;
  amount: number;
}): Promise<string> {
  if (config.nessieFixtures) return `fixture-${Date.now()}`;
  const merchant = await call<{ objectCreated: { _id: string } }>("POST", "/merchants", {
    name: args.merchantName,
    category: "Other",
    address: { street_number: "1", street_name: "Main St", city: "Durham", state: "NC", zip: "27701" },
    geocode: { lat: 35.99, lng: -78.9 },
  });
  const p = await call<{ objectCreated: { _id: string } }>("POST", `/accounts/${args.accountId}/purchases`, {
    merchant_id: merchant.objectCreated._id,
    medium: "balance",
    purchase_date: new Date().toISOString().slice(0, 10),
    amount: args.amount,
    status: "completed",
    description: args.merchantName,
  });
  return p.objectCreated._id;
}
