// scripts/spot-check.mjs — one-off ad-hoc screenshot helper for manually reviewing a
// specific tab at a specific viewport during UI work. Not part of the regular audit.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 8092;
const tab = process.argv[2] || "dashboard";
const width = Number(process.argv[3]) || 375;
const height = Number(process.argv[4]) || 667;

const server = spawn(process.execPath, [path.join(__dirname, "static-server.cjs"), String(port)], { cwd: root });
await new Promise((resolve) => server.stdout.on("data", (d) => d.toString().includes("Serving") && resolve()));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: "networkidle" });
await page.locator(`.tab-btn[data-tab="${tab}"]`).first().click();
await page.waitForTimeout(200);
const outPath = path.join(__dirname, "audit-screenshots", `spot-${tab}-${width}x${height}.png`);
await page.screenshot({ path: outPath, fullPage: true });
console.log(`Saved ${outPath}`);
await browser.close();
server.kill();
