import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { config } from "./config.js";
import { digitsOnly } from "./utils.js";

export type Inbound =
  | { kind: "text"; text: string }
  | { kind: "audio"; mimeType: string; name: string; read: () => Promise<Buffer> };

export type InboundHandler = (msg: Inbound) => Promise<void>;

// Minimal structural type for the DM space we cache
type DmSpace = { send: (text: string) => Promise<unknown> };
let dm: DmSpace | null = null;

// Every proactive text goes through here. Returns false instead of throwing when the send
// fails, so one bad send can't abort a poll batch.
export async function sendToUser(text: string): Promise<boolean> {
  if (!dm) throw new Error("Spectrum not started; call startSpectrum() first");
  console.log(`[spectrum] -> ${text}`);
  try {
    await dm.send(text);
    return true;
  } catch (err) {
    console.log("[spectrum] send failed, continuing", (err as Error).message);
    return false;
  }
}

function isUser(senderId: string | undefined): boolean {
  if (!senderId) return false;
  // Compare the last 10 digits so "+1 (555)..." and "5551234567" both match
  const a = digitsOnly(senderId).slice(-10);
  const b = digitsOnly(config.userPhone).slice(-10);
  return a.length === 10 && a === b;
}

export async function startSpectrum(onInbound: InboundHandler): Promise<void> {
  const app = await Spectrum({
    projectId: config.spectrumProjectId,
    projectSecret: config.spectrumProjectSecret,
    providers: [imessage.config()],
  });
  const im = imessage(app);

  const user = await im.user(config.userPhone);
  dm = (await im.space.create(user)) as unknown as DmSpace;
  console.log("[spectrum] DM space ready for", config.userPhone);

  // Inbound loop runs in the background; ignores everyone except USER_PHONE
  void (async () => {
    for await (const [, message] of app.messages) {
      try {
        const sender = message.sender?.id;
        // First inbound message: log the id format so we can verify it
        console.log("[spectrum] inbound from", sender, "type", message.content.type);
        if (!isUser(sender)) continue;

        if (message.content.type === "text") {
          await onInbound({ kind: "text", text: message.content.text });
        } else if (message.content.type === "attachment") {
          const a = message.content;
          await onInbound({
            kind: "audio",
            mimeType: a.mimeType,
            name: a.name,
            read: () => a.read(),
          });
        }
      } catch (err) {
        console.log("[spectrum] inbound handler error", err);
      }
    }
  })();
}
