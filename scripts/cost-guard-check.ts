// scripts/cost-guard-check.ts — the ALARM. The load-bearing half of the cost
// guards (COST_GUARDS.md §3): a page you check monthly won't stop a charge;
// this runs on a timer whether or not anyone is looking.
//
// Run it from cron on the VPS, e.g. every 6 hours:
//   0 */6 * * *  cd /var/www/australiaisbeautiful.com && \
//     npx tsx scripts/cost-guard-check.ts >> /var/log/aib-cost-guard.log 2>&1
//
// It reads the SAME registry and the SAME evaluate() as /admin/cost, so the
// alarm and the page can never disagree about what "near a limit" means (§1).
//
// EXIT CODE is the signal: 0 = all clear, 1 = something needs a human (near or
// over a line, or couldn't be measured — §4, blind is bad). cron mails non-zero
// exits by default, so even before a real notifier is wired, a broken/over
// guard reaches you. When you wire email/Discord (D18), send it in notify().
//
// NEVER auto-upgrades a paid tier. Crossing a line notifies; the human decides
// upgrade / prune / move / degrade (§5).

import "dotenv/config";
import { evaluateAll, needsAttention, type CostReading } from "../lib/cost-guards";

function line(r: CostReading): string {
  const pct = r.percent === null ? "  ?  " : `${Math.round(r.percent)}%`.padStart(5);
  const usage =
    r.usage === null
      ? r.status === "pending"
        ? "(not wired)"
        : "(couldn't measure)"
      : `${r.unit === "GB" ? r.usage.toFixed(1) : Math.round(r.usage)} / ${r.freeLimit} ${r.unit}`;
  const flag =
    r.status === "over"
      ? "OVER"
      : r.status === "warn"
        ? "WARN"
        : r.status === "unknown"
          ? "UNKNOWN"
          : r.status === "pending"
            ? "pending"
            : "ok";
  return `  [${flag.padEnd(7)}] ${r.label.padEnd(22)} ${pct}  ${usage}`;
}

// The seam for real notification. Today it prints; wire email/Discord here when
// the dependency exists (D18). Keep it a single function so there's one place to
// add it, and so the alarm's DECISION (what's wrong) stays separate from its
// DELIVERY (how you're told).
async function notify(subject: string, body: string): Promise<void> {
  // TODO(email): when transactional email is wired, send this to the admin.
  //   await sendEmail({ to: ADMIN_EMAIL, subject, text: body });
  // Until then, the non-zero exit + cron's mail-on-failure is the delivery.
  console.error(`\n${subject}\n${body}`);
}

async function main() {
  const readings = await evaluateAll();
  const stamp = new Date().toISOString();

  console.log(`cost-guard-check @ ${stamp}`);
  for (const r of readings) console.log(line(r));

  if (!needsAttention(readings)) {
    console.log("\nAll within free tiers. No action needed.");
    process.exit(0);
  }

  // Something needs a human. Build a focused message of only the rows that matter.
  const flagged = readings.filter(
    (r) => r.status === "over" || r.status === "warn" || r.status === "unknown",
  );
  const body = [
    "One or more metered services need a decision:",
    "",
    ...flagged.map(line),
    "",
    "Decide, early and deliberately: upgrade, prune, move, or turn it off.",
    "This is a warning line, not a cliff — act before it's crossed.",
    "(Nothing is upgraded automatically.)",
  ].join("\n");

  await notify("Australia Is Beautiful — cost guard warning", body);
  process.exit(1);
}

main().catch((e) => {
  // A crashed check is itself a warning — a guard that silently stopped working
  // is exactly the failure this system exists to prevent (§4). Exit non-zero.
  console.error("cost-guard-check FAILED to run:", e);
  process.exit(1);
});
