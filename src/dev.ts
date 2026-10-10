import { createServer } from "node:http";
import { config } from "./config.js";
import { createPurchase } from "./integrations/nessie.js";
import { tickAll, nessieTick } from "./pollers.js";
import { save, state } from "./state.js";
import { isoWeekKey } from "./utils.js";

// Local demo hooks. Bound to localhost only.
export function startDevServer(): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.devPort}`);
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body, null, 2));
    };
    try {
      if (req.method === "POST" && url.pathname === "/tick") {
        await tickAll();
        return send(200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/purchase") {
        const amount = Number(url.searchParams.get("amount") ?? "0");
        const merchant = url.searchParams.get("merchant") ?? "Demo Merchant";
        if (!config.nessieAccountId || !(amount > 0)) return send(400, { error: "need NESSIE_ACCOUNT_ID and amount>0" });
        const id = await createPurchase({ accountId: config.nessieAccountId, merchantName: merchant, amount });
        console.log(`[dev] created purchase ${id}`);
        await nessieTick();
        return send(200, { ok: true, id });
      }
      if (req.method === "GET" && url.pathname === "/state") {
        return send(200, state);
      }
      if (req.method === "POST" && url.pathname === "/reset") {
        // Clears pending, alerts, and this week's spend. Seen IDs are kept so old items stay ignored.
        const week = isoWeekKey();
        state.pending = [];
        state.alertsSent = state.alertsSent.filter((k) => !k.endsWith(week) && !k.includes(`:${week}`));
        delete state.spendByWeek[week];
        save();
        console.log("[dev] reset current week");
        return send(200, { ok: true, week });
      }
      send(404, { error: "not found" });
    } catch (err) {
      console.log("[dev] error", err);
      send(500, { error: String(err) });
    }
  });
  server.listen(config.devPort, "127.0.0.1", () => {
    console.log(`[dev] hooks on http://localhost:${config.devPort}`);
  });
}
