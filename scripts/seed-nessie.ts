// Creates a demo customer, a checking account, and past purchases for the 80% budget demo.
// Prints NESSIE_ACCOUNT_ID to paste into .env. UNVERIFIED endpoints, see src/integrations/nessie.ts.
import "dotenv/config";

const BASE = "https://api.nessieisreal.com";
const KEY = process.env.NESSIE_API_KEY;
if (!KEY) throw new Error("Set NESSIE_API_KEY in .env first");

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const addr = { street_number: "1", street_name: "Main St", city: "Durham", state: "NC", zip: "27701" };

const customer = await post<{ objectCreated: { _id: string } }>("/customers", {
  first_name: "Demo",
  last_name: "User",
  address: addr,
});
const customerId = customer.objectCreated._id;

const account = await post<{ objectCreated: { _id: string } }>(`/customers/${customerId}/accounts`, {
  type: "Checking",
  nickname: "Concierge demo",
  rewards: 0,
  balance: 400,
  account_number: String(Math.floor(1e9 + Math.random() * 9e9)),
});
const accountId = account.objectCreated._id;

// 7 purchases over the last 6 days, about $117 total. Tune amounts so the 80% alert
// ($120 of a $150 budget) trips on the demo's extra purchase.
const seed: Array<[string, number, string, number]> = [
  ["Whole Foods", 34.1, "groceries", 6],
  ["Chipotle", 12.4, "lunch", 5],
  ["Spotify", 10.99, "subscription", 4],
  ["Uber", 18.6, "ride", 3],
  ["Whole Foods", 21.75, "groceries", 3],
  ["Chipotle", 11.2, "dinner", 2],
  ["Uber", 7.9, "ride", 1],
];

for (const [merchant, amount, description, daysAgo] of seed) {
  const merch = await post<{ objectCreated: { _id: string } }>("/merchants", {
    name: merchant,
    category: "Other",
    address: addr,
    geocode: { lat: 35.99, lng: -78.9 },
  });
  const d = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  await post(`/accounts/${accountId}/purchases`, {
    merchant_id: merch.objectCreated._id,
    medium: "balance",
    purchase_date: d,
    amount,
    status: "completed",
    description,
  });
  console.log(`seeded ${merchant} $${amount} on ${d}`);
}

console.log("\nNESSIE_ACCOUNT_ID=" + accountId);
