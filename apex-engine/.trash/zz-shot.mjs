import fs from "node:fs";
import { chromium } from "playwright";

const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
await p.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 40000 });
await p.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300), null, { timeout: 40000 });
await p.waitForTimeout(Number(process.argv[2] ?? 15) * 1000);
const dir = process.env.TEMP.replace(/\\/g, "/");
const out = `${dir}/apex-home.png`;
await p.screenshot({ path: out });
console.log("SHOT", out, fs.statSync(out).size);
await b.close();
process.exit(0);
