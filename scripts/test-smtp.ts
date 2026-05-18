import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // ok
}

async function main() {
  const { sendEmail } = await import("../src/lib/email/mailer");
  const res = await sendEmail({
    to: process.argv[2] ?? "geocode.apps@gmail.com",
    subject: "Smoke test SMTP — Fedecafe Plataforma",
    html: "<p>Si recibes esto, el SMTP de Gmail está funcionando.</p>",
    text: "Si recibes esto, el SMTP de Gmail está funcionando.",
  });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
