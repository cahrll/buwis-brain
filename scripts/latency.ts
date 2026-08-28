const QUESTIONS = [
  "Can a freelancer use the 8% income tax option instead of graduated rates?",
  "What is the deadline for filing the quarterly income tax return?",
  "Do I need to register with the BIR as a self-employed professional?",
  "What is percentage tax and who has to pay it?",
  "How much is the SSS voluntary contribution per month?",
  "Can a freelancer pay PhilHealth as a voluntary member?",
  "How do I compute Pag-IBIG voluntary contributions?",
  "What books of accounts must a self-employed professional keep?",
  "When is the annual income tax return due?",
  "What happens if I file my tax return late?",
];

async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const times: number[] = [];
  for (const question of QUESTIONS) {
    const started = Date.now();
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const ms = Date.now() - started;
    const json = (await res.json()) as {
      refused?: boolean;
      citations?: unknown[];
      error?: string;
    };
    times.push(ms);
    console.log(
      `${String(ms).padStart(6)} ms  refused=${json.refused ?? "?"}  citations=${
        json.citations?.length ?? 0
      }  ${question}`,
    );
    if (json.error) console.log(`         error: ${json.error}`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  console.log(`\np95: ${p95} ms over ${times.length} queries (target < 12000 ms)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
