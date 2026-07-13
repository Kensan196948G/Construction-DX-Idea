import { readFileSync, statSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("**/*", {
  exclude: [
    "node_modules/**",
    "dist/**",
    ".git/**",
    ".wrangler/**",
    "package-lock.json",
  ],
}).filter((file) => statSync(file).isFile());

const secretPatterns = [
  { name: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { name: "Database URL with password", pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/ },
];

const findings = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(text)) {
      findings.push(`${name}: ${file}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secret exposure detected:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Security scan passed: no obvious secrets detected.");
