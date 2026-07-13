const required = [
  "APP_BASE_URL",
  "ALLOWED_ORIGINS",
  "ADMIN_EMAILS",
  "SYSTEM_ADMIN_EMAILS",
  "CF_ACCESS_CERTS_URL",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ISSUER",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
];

const frontendRequired = ["VITE_API_BASE_URL"];
const placeholderPattern = /example\.invalid|localhost|127\.0\.0\.1/i;
const missing = [];
const unsafe = [];

for (const key of required) {
  const value = process.env[key];
  if (!value) {
    missing.push(key);
  } else if (placeholderPattern.test(value)) {
    unsafe.push(key);
  }
}

for (const key of frontendRequired) {
  const value = process.env[key];
  if (!value) missing.push(key);
}

if (process.env.ALLOW_LOCAL_AUTH_BYPASS !== "false") {
  unsafe.push("ALLOW_LOCAL_AUTH_BYPASS must be false");
}

if (process.env.VITE_USE_MOCK_API !== "false") {
  unsafe.push("VITE_USE_MOCK_API must be false");
}

if (missing.length > 0 || unsafe.length > 0) {
  if (missing.length > 0) console.error(`Missing production values: ${missing.join(", ")}`);
  if (unsafe.length > 0) console.error(`Unsafe production values: ${unsafe.join(", ")}`);
  process.exit(1);
}

console.log("Predeploy check passed: required production values are present.");
