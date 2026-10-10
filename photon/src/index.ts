import { config } from "./config.js";
import { state, save, markSeen } from "./state.js";
import { startSpectrum, sendToUser, type Inbound } from "./spectrum.js";
import { handleReply } from "./agent/replies.js";
import { listNewMessages } from "./integrations/gmail.js";
import { listPurchases } from "./integrations/nessie.js";
import { startPollers } from "./pollers.js";
import { startDevServer } from "./dev.js";
import { analyzeVoiceMemo } from "./agent/gemini.js";
import { proposeFromEmail } from "./agent/decide.js";

// Inbound: text replies go to the reply grammar, audio goes to the voice memo flow (P2)
async function onInbound(msg: Inbound): Promise<void> {
  if (msg.kind === "text") {
    console.log(`[spectrum] <- ${msg.text}`);
    await handleReply(msg.text);
    return;
  }
  const looksLikeAudio = msg.mimeType.startsWith("audio/") || /\.(caf|m4a|mp3|wav)$/i.test(msg.name);
  if (!looksLikeAudio) return;
  const bytes = await msg.read();
  const memo = await analyzeVoiceMemo(bytes, msg.mimeType || "audio/x-caf");
  if (!memo) {
    await sendToUser("Couldn't read that audio, try a shorter memo.");
    return;
  }
  const lines: string[] = [];
  if (memo.summary.length) lines.push("Summary:", ...memo.summary.map((s) => `- ${s}`));
  if (memo.actionItems.length) lines.push("Action items:", ...memo.actionItems.map((a) => `- ${a.text}`));
  if (memo.moneyOwed.length) lines.push("Money owed:", ...memo.moneyOwed.map((m) => `- ${m.person}: $${m.amount} (${m.reason})`));
  await sendToUser(lines.join("\n") || "Nothing actionable in that memo.");
  // Each action item with a due date becomes a pending proposal the user can approve
  for (const item of memo.actionItems) {
    if (!item.dueISO) continue;
    // Reuse the email proposal path by treating the item as a 1-hour event
    await proposeFromEmail(
      { kind: "event", receipt: null, event: { title: item.text, startISO: item.dueISO, endISO: null, location: null, confidence: 1 } },
      { gmailId: "voice-memo", from: "voice memo", subject: "voice memo" },
    );
  }
}

// First boot: everything already in Gmail and Nessie is marked seen, so we only react to new items
async function bootstrap(): Promise<void> {
  if (state.bootstrapped) return;
  console.log("[boot] first run: marking existing Gmail and Nessie items as seen");
  try {
    for (const id of await listNewMessages()) markSeen(state.seenGmailIds, id);
  } catch (err) {
    console.log("[boot] gmail seed failed (continuing)", err);
  }
  if (config.nessieAccountId) {
    try {
      for (const p of await listPurchases(config.nessieAccountId)) markSeen(state.seenPurchaseIds, p._id);
    } catch (err) {
      console.log("[boot] nessie seed failed (continuing)", err);
    }
  }
  state.bootstrapped = true;
  save();
}

async function main(): Promise<void> {
  await startSpectrum(onInbound);
  await bootstrap();
  startPollers();
  startDevServer();
  console.log("[boot] Concierge running");
}

main().catch((err) => {
  console.error("[boot] fatal", err);
  process.exit(1);
});
