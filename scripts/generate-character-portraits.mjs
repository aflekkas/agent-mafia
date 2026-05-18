#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "lib/characters/data.json");
const outputDir = path.join(repoRoot, "public/portraits/characters");

loadDotEnv(path.join(repoRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".env.local"));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const concurrency = readNumericArg("--concurrency", 3);
const profiles = JSON.parse(readFileSync(dataPath, "utf8"));
const jobs = profiles
  .filter((profile) => profile.portraitSrc?.startsWith("/portraits/characters/"))
  .map((profile) => ({
    profile,
    outputPath: path.join(repoRoot, "public", profile.portraitSrc)
  }))
  .filter((job) => force || !existsSync(job.outputPath));

if (!jobs.length) {
  console.log("No missing character portraits.");
  process.exit(0);
}

console.log(`${dryRun ? "Would generate" : "Generating"} ${jobs.length} character portrait(s).`);
for (const job of jobs) {
  console.log(`- ${job.profile.id}: ${path.relative(repoRoot, job.outputPath)}`);
}

if (dryRun) {
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Set it in .env or the shell.");
}

mkdirSync(outputDir, { recursive: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
await runPool(jobs, concurrency, async ({ profile, outputPath }) => {
  const prompt = [
    "Use case: stylized-concept",
    "Asset type: square NPC portrait for a noir pixel-inspired Mafia game UI",
    `Primary request: ${profile.imagePrompt}`,
    "Style: original character, painterly game portrait, clear head-and-shoulders composition, dramatic candlelit noir table mood.",
    "Constraints: no text, no watermark, no exact likeness of a living public figure, no copyrighted character copy, safe for a game character library.",
    "Framing: centered bust portrait, dark simple background, strong silhouette, readable at small UI size."
  ].join("\n");

  const result = await generateImageWithRetry({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    size: "1024x1024",
    quality: "low",
    output_format: "png",
    background: "opaque",
    n: 1
  });

  const image = result.data?.[0]?.b64_json;
  if (!image) {
    throw new Error(`No image data returned for ${profile.id}.`);
  }

  writeFileSync(outputPath, Buffer.from(image, "base64"));
  console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
});

async function generateImageWithRetry(params, attempt = 1) {
  try {
    return await openai.images.generate(params);
  } catch (error) {
    if (!isRateLimitError(error) || attempt >= 8) {
      throw error;
    }

    const waitSeconds = retrySecondsFromError(error) ?? Math.min(60, 12 * attempt);
    console.log(`Rate limited. Waiting ${waitSeconds}s before retry ${attempt + 1}.`);
    await sleep(waitSeconds * 1000);
    return generateImageWithRetry(params, attempt + 1);
  }
}

function isRateLimitError(error) {
  return error?.status === 429 || error?.code === "rate_limit_exceeded";
}

function retrySecondsFromError(error) {
  const message = error?.message;
  if (typeof message !== "string") {
    return undefined;
  }

  const match = message.match(/try again in (\d+)s/i);
  return match ? Number.parseInt(match[1], 10) + 2 : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readNumericArg(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!arg) {
    return fallback;
  }

  const parsed = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function runPool(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}
