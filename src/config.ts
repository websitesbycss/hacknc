import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  spectrumProjectId: req("SPECTRUM_PROJECT_ID"),
  spectrumProjectSecret: req("SPECTRUM_PROJECT_SECRET"),
  userPhone: req("USER_PHONE"),
  geminiApiKey: req("GEMINI_API_KEY"),
  geminiModel: opt("GEMINI_MODEL", "gemini-3.8-flash"),
  googleClientId: opt("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: opt("GOOGLE_CLIENT_SECRET", ""),
  googleRefreshToken: opt("GOOGLE_REFRESH_TOKEN", ""),
  nessieApiKey: opt("NESSIE_API_KEY", ""),
  nessieAccountId: opt("NESSIE_ACCOUNT_ID", ""),
  nessieFixtures: opt("NESSIE_FIXTURES", "0") === "1",
  tz: opt("TZ", "America/New_York"),
  weeklyBudget: Number(opt("WEEKLY_BUDGET", "150")),
  lowBalanceThreshold: Number(opt("LOW_BALANCE_THRESHOLD", "100")),
  pollMs: 30_000,
  devPort: Number(opt("DEV_PORT", "3000")),
};
