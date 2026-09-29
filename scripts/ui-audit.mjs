// scripts/ui-audit.mjs — Playwright-based UI/UX audit across device sizes.
// Spins up the app's own static server, loads it at several device viewports, checks for
// console errors, horizontal overflow (the #1 mobile-responsiveness bug), correct
// mobile-bottom-nav vs desktop-tab-bar visibility, and that every tab actually switches
// panels without throwing — then saves a screenshot per viewport for visual review.
//
// Does NOT touch Web Bluetooth (Connect to Bike / Scan All / Explore Device) — headless
// Chromium has no real BLE radio and requestDevice() would just hang waiting on a picker
// no one can answer. This audits layout/interaction, not the hardware path.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 8091;
const screenshotDir = path.join(__dirname, "audit-screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

const DEVICES = [
  { name: "mobile-iphonese", width: 375, height: 667 },
  { name: "mobile-iphone14", width: 390, height: 844 },
  { name: "tablet-ipad", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

const TABS = ["dashboard", "gauges", "alerts", "history", "vehicle", "logs", "fota", "fullscan", "explore", "raw", "fieldmap", "settings"];

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, "static-server.cjs"), String(port)], { cwd: root });
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("Serving")) resolve(proc);
    });
    proc.stderr.on("data", (d) => console.error("[server]", d.toString()));
    proc.on("error", reject);
    setTimeout(() => reject(new Error("Server didn't start in time")), 5000);
  });
}

async function auditViewport(browser, device) {
  const issues = [];
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message}`));

  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300); // let Tailwind's runtime JIT settle

  // Horizontal overflow check — the most common mobile bug.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) issues.push(`horizontal overflow: content is ${overflow}px wider than the viewport`);

  // Mobile bottom nav should only be visible below the sm breakpoint (640px).
  const bottomNavVisible = await page.evaluate(() => {
    const nav = document.querySelector("nav.fixed.bottom-0");
    if (!nav) return null;
    return window.getComputedStyle(nav).display !== "none";
  });
  const expectedMobileNav = device.width < 640;
  if (bottomNavVisible === null) issues.push("mobile bottom nav element not found");
  else if (bottomNavVisible !== expectedMobileNav) {
    issues.push(`mobile bottom nav visibility wrong: expected ${expectedMobileNav ? "visible" : "hidden"} at ${device.width}px, got ${bottomNavVisible ? "visible" : "hidden"}`);
  }

  // Click through every tab and confirm its panel becomes the visible one.
  for (const tab of TABS) {
    const btn = page.locator(`.tab-btn[data-tab="${tab}"]`).first();
    if ((await btn.count()) === 0) {
      issues.push(`tab button not found: ${tab}`);
      continue;
    }
    await btn.click();
    const panelHidden = await page.locator(`#tab-${tab}`).evaluate((el) => el.classList.contains("hidden"));
    if (panelHidden) issues.push(`clicking tab "${tab}" did not reveal #tab-${tab}`);
  }

  // Back to dashboard for the screenshot. Viewport-only (not fullPage) — fullPage capture
  // stitches the whole scroll height into one image, which duplicates/misplaces our fixed
  // header and fixed bottom nav. A plain viewport screenshot matches what a user actually sees.
  await page.locator('.tab-btn[data-tab="dashboard"]').first().click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(screenshotDir, `${device.name}.png`) });

  await context.close();
  return issues;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  let totalIssues = 0;

  try {
    for (const device of DEVICES) {
      console.log(`\n=== ${device.name} (${device.width}x${device.height}) ===`);
      const issues = await auditViewport(browser, device);
      if (issues.length === 0) {
        console.log("  OK — no issues found.");
      } else {
        totalIssues += issues.length;
        for (const issue of issues) console.log(`  ISSUE: ${issue}`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\nScreenshots saved to ${screenshotDir}`);
  console.log(totalIssues === 0 ? "\nAll good across every audited viewport." : `\n${totalIssues} issue(s) found — see above.`);
  process.exit(totalIssues === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
