const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m"
};

export const seedLog = {
  header(title: string): void {
    console.log(`\n${c.bold}${c.cyan}━━━ ${title} ━━━${c.reset}`);
  },
  step(label: string, detail?: string): void {
    const suffix = detail ? `${c.dim} — ${detail}${c.reset}` : "";
    console.log(`${c.green}✔${c.reset} ${label}${suffix}`);
  },
  count(model: string, n: number): void {
    console.log(`  ${c.magenta}${model}${c.reset}: ${c.bold}${n}${c.reset} record(s)`);
  },
  warn(msg: string): void {
    console.log(`${c.yellow}⚠${c.reset} ${msg}`);
  },
  error(msg: string): void {
    console.log(`${c.red}✖${c.reset} ${msg}`);
  },
  info(msg: string): void {
    console.log(`${c.dim}${msg}${c.reset}`);
  },
  done(summary: Record<string, string | number>): void {
    seedLog.header("Seed Complete");
    for (const [k, v] of Object.entries(summary)) {
      console.log(`  ${c.cyan}${k}${c.reset}: ${v}`);
    }
    console.log("");
  }
};
