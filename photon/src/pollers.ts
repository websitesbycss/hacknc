import { config } from "./config.js";
import { analyzeEmail } from "./agent/gemini.js";
import { proposeFromEmail } from "./agent/decide.js";
import { getMessageText, listNewMessages } from "./integrations/gmail.js";
import { listPurchases } from "./integrations/nessie.js";
import { recordSpend } from "./money.js";
import { markSeen, save, state } from "./state.js";

// Each poller guards against overlapping runs (a slow Gemini call shouldn't stack ticks)
let gmailBusy = false;
let nessieBusy = false;

export async function gmailTick(): Promise<void> {
  if (gmailBusy) return;
  gmailBusy = true;
  try {
    const ids = await listNewMessages();
    const fresh = ids.filter((id) => !state.seenGmailIds.includes(id));
    console.log(`[gmail] poll: ${ids.length} recent, ${fresh.length} new`);

    for (const id of fresh) {
      // Mark seen before analysis so a crash or Gemini failure never re-triggers the same email
      markSeen(state.seenGmailIds, id);
      save();

      // Per-email try/catch: one bad email must not skip the rest of the batch
      try {
        const email = await getMessageText(id);
        const analysis = await analyzeEmail(email);
        if (!analysis) continue;

        if (analysis.kind === "event") {
          await proposeFromEmail(analysis, { gmailId: id, from: email.from, subject: email.subject });
        } else if (analysis.kind === "receipt" && analysis.receipt) {
          const r = analysis.receipt;
          await recordSpend({
            amount: r.amount,
            merchant: r.merchant,
            dedupeKey: `receipt:${r.merchant}:${r.amount}:${new Date().toISOString().slice(0, 10)}`,
            source: "email receipt",
          });
        }
      } catch (err) {
        console.log(`[gmail] email ${id} failed, continuing`, (err as Error).message);
      }
    }
  } catch (err) {
    console.log("[gmail] tick failed", err);
  } finally {
    gmailBusy = false;
  }
}

export async function nessieTick(): Promise<void> {
  if (nessieBusy || !config.nessieAccountId) return;
  nessieBusy = true;
  try {
    const purchases = await listPurchases(config.nessieAccountId);
    const fresh = purchases.filter((p) => !state.seenPurchaseIds.includes(p._id));
    console.log(`[nessie] poll: ${purchases.length} purchases, ${fresh.length} new`);

    for (const p of fresh) {
      markSeen(state.seenPurchaseIds, p._id);
      save();
      try {
        await recordSpend({
          amount: p.amount,
          merchant: p.description ?? "a purchase",
          dedupeKey: `purchase:${p._id}`,
          source: "nessie",
        });
      } catch (err) {
        console.log(`[nessie] purchase ${p._id} failed, continuing`, (err as Error).message);
      }
    }
  } catch (err) {
    console.log("[nessie] tick failed", err);
  } finally {
    nessieBusy = false;
  }
}

export async function tickAll(): Promise<void> {
  await gmailTick();
  await nessieTick();
}

export function startPollers(): void {
  setInterval(() => void gmailTick(), config.pollMs);
  setInterval(() => void nessieTick(), config.pollMs);
}
