// RELEASE_STAGE contract (shared with release-readiness-monitor / release-smoke-test):
//   full (default) : every production value is required.
//   pre-access     : Stage A shell release. Access/DB/AI are not wired yet, so
//                    their values may be absent; anything that IS set must
//                    still pass the placeholder check.
const releaseStage = process.env.RELEASE_STAGE || "full";
if (!["full", "pre-access"].includes(releaseStage)) {
  console.error(`RELEASE_STAGE must be "full" or "pre-access", got: ${releaseStage}`);
  process.exit(1);
}
const isPreAccessStage = releaseStage === "pre-access";

const alwaysRequired = [
  "APP_BASE_URL",
  "ALLOWED_ORIGINS",
  "ADMIN_EMAILS",
  "SYSTEM_ADMIN_EMAILS",
];

const stageBRequired = [
  "CF_ACCESS_CERTS_URL",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ISSUER",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
];

const required = isPreAccessStage ? alwaysRequired : [...alwaysRequired, ...stageBRequired];

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

if (isPreAccessStage) {
  for (const key of stageBRequired) {
    const value = process.env[key];
    if (value && placeholderPattern.test(value)) {
      unsafe.push(key);
    }
  }
}

for (const key of frontendRequired) {
  const value = process.env[key];
  if (!value) missing.push(key);
}

// The frontend request paths already include the /api prefix; a base URL
// ending in /api would double the prefix (GET /api/api/... -> 404).
if (/\/api\/*$/i.test(process.env.VITE_API_BASE_URL || "")) {
  unsafe.push("VITE_API_BASE_URL must be the origin only (no /api suffix; request paths already include /api)");
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

console.log(
  isPreAccessStage
    ? "Predeploy check passed (stage=pre-access): Access/DB/AI values are deferred to Stage B."
    : "Predeploy check passed: required production values are present.",
);
