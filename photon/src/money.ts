import { config } from "./config.js";
import { getBalance } from "./integrations/nessie.js";
import { sendToUser } from "./spectrum.js";
import { save, state } from "./state.js";
import { isoDow, isoWeekKey, localDateKey } from "./utils.js";

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

// Adds a spend event and sends at most one text (P1 priority order).
export async function recordSpend(args: {
  amount: number;
  merchant: string;
  dedupeKey: string;
  source: string;
}): Promise<void> {
  if (state.alertsSent.includes(args.dedupeKey)) return;
  state.alertsSent.push(args.dedupeKey);

  const week = isoWeekKey();
  const before = state.spendByWeek[week] ?? 0;
  const after = before + args.amount;
  state.spendByWeek[week] = after;
  save();
  console.log(`[money] ${args.source}: ${money(args.amount)} at ${args.merchant}; week ${week} = ${money(after)}`);

  const budget = config.weeklyBudget;
  const today = localDateKey();
  const pct = (x: number) => x / budget;
  const key = (k: string) => {
    state.alertsSent.push(k);
    save();
  };
  const sent = (k: string) => state.alertsSent.includes(k);

  // 1. Low balance
  if (config.nessieAccountId) {
    const balance = await getBalance(config.nessieAccountId).catch((err) => {
      console.log("[nessie] balance fetch failed", err);
      return undefined;
    });
    const lowKey = `lowbal:${today}`;
    if (balance !== undefined && balance < config.lowBalanceThreshold && !sent(lowKey)) {
      key(lowKey);
      await sendToUser(`Heads up: your checking balance is ${money(balance)}.`);
      return;
    }
  }

  // 2. Crossed 100% of budget this event
  const b100 = `budget100:${week}`;
  if (before / budget < 1 && pct(after) >= 1 && !sent(b100)) {
    key(b100);
    await sendToUser(`You've spent ${money(after)} this week against a ${money(budget)} budget.`);
    return;
  }

  // 3. Crossed 80% of budget this event
  const b80 = `budget80:${week}`;
  if (before / budget < 0.8 && pct(after) >= 0.8 && !sent(b80)) {
    key(b80);
    const daysLeft = 7 - isoDow();
    await sendToUser(
      `You're at ${money(after)} of your ${money(budget)} weekly budget with ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`,
    );
    return;
  }

  // 4. Plain transaction ping for bigger purchases
  if (args.amount >= 25) {
    await sendToUser(
      `${money(args.amount)} at ${args.merchant}. Weekly spend: ${money(after)} of ${money(budget)}.`,
    );
  }
}
