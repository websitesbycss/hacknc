export type PendingAction = {
  id: string;
  kind: "add_event" | "move_event";
  createdAt: number;
  event: { title: string; startISO: string; endISO: string; location?: string };
  altEvent?: { startISO: string; endISO: string };
  sourceGmailId?: string;
};

export type State = {
  bootstrapped: boolean; // set after first-boot "mark everything seen" pass
  seenGmailIds: string[];
  seenPurchaseIds: string[];
  pending: PendingAction[];
  spendByWeek: Record<string, number>;
  alertsSent: string[];
};
