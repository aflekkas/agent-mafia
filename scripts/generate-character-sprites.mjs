#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI, { toFile } from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "lib/characters/data.json");
const outputDir = path.join(repoRoot, "public/portraits/sprites");

loadDotEnv(path.join(repoRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".env.local"));

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const aiSprites = args.has("--ai");
const concurrency = readNumericArg("--concurrency", 1);
const selectedIds = readIdsArg();
const profiles = JSON.parse(readFileSync(dataPath, "utf8"));
const jobs = profiles
  .filter((profile) => shouldIncludeProfile(profile))
  .map((profile) => {
    const spriteSheetSrc = profile.spriteSheetSrc || `/portraits/sprites/${profile.id}.png`;
    return {
      profile: {
        ...profile,
        spriteSheetSrc
      },
      outputPath: path.join(repoRoot, "public", spriteSheetSrc),
      referencePath: profile.portraitSrc ? path.join(repoRoot, "public", profile.portraitSrc) : undefined
    };
  })
  .filter((job) => force || !existsSync(job.outputPath));

if (!jobs.length) {
  console.log("No missing character sprite sheets.");
  process.exit(0);
}

console.log(`${dryRun ? "Would generate" : "Generating"} ${jobs.length} character sprite sheet(s).`);
for (const job of jobs) {
  const reference = job.referencePath && existsSync(job.referencePath) ? path.relative(repoRoot, job.referencePath) : "prompt only";
  console.log(`- ${job.profile.id}: ${path.relative(repoRoot, job.outputPath)} (${reference})`);
}

if (dryRun) {
  process.exit(0);
}

if (aiSprites && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Set it in .env or the shell.");
}

mkdirSync(outputDir, { recursive: true });

const openai = aiSprites ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined;
await runPool(jobs, concurrency, async ({ profile, outputPath, referencePath }) => {
  const prompt = spriteSheetPrompt(profile);
  if (!aiSprites) {
    if (!referencePath || !existsSync(referencePath)) {
      throw new Error(`Cannot derive ${profile.id}; missing portrait reference.`);
    }
    deriveSpriteSheet(referencePath, outputPath);
    console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
    return;
  }

  const result =
    referencePath && existsSync(referencePath)
      ? await generateImageWithRetry({
          image: await imageFileFromPath(referencePath),
          model: imageModel(),
          prompt,
          size: "1024x1024",
          quality: imageQuality(),
          output_format: "png",
          background: "opaque",
          n: 1
        })
      : await generateImageWithRetry({
          model: imageModel(),
          prompt,
          size: "1024x1024",
          quality: imageQuality(),
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

function shouldIncludeProfile(profile) {
  if (!profile?.id) {
    return false;
  }

  if (!selectedIds) {
    return true;
  }

  return selectedIds === "all" || selectedIds.has(profile.id);
}

function spriteSheetPrompt(profile) {
  return [
    "Use case: stylized-concept",
    "Asset type: 3x3 sprite sheet for Agent Mafia character state animation",
    `Character: ${profile.name} (${profile.summary}).`,
    `Character description: ${profile.imagePrompt}`,
    `Personality for expression acting: ${profile.style}`,
    "Primary request: Create one square 3x3 sprite sheet with nine equal cells and no gutters, labels, letters, numbers, UI, or frame borders.",
    "Use the input portrait as the identity, costume, face, palette, and lighting reference when provided.",
    "Style: 16-bit noir pixel-art game sprite portrait, crisp chunky pixels, limited Palermo candlelight palette of black, brass gold, cream, and deep red accents.",
    "Composition: each cell is the same head-and-shoulders bust at the same scale, centered, facing the table, dark simple background.",
    "Frame order, left to right, top to bottom:",
    "1 idle neutral breathing frame, 2 idle alternate breathing frame, 3 quiet guarded listening frame,",
    "4 speaking mouth-open frame, 5 speaking mouth-mid frame, 6 speaking mouth-closed expressive frame,",
    "7 thinking under pressure frame, 8 suspected tense defensive frame, 9 eliminated desaturated fallen-silent frame.",
    "Keep the character consistent across every cell. The differences should be expression, mouth shape, posture, and tiny breathing motion only.",
    "No photorealism, no painterly blending, no smooth gradients, no watermark, no text."
  ].join("\n");
}

function deriveSpriteSheet(referencePath, outputPath) {
  const cell = 342;
  const frames = [
    { x: 0, y: 0, ops: [] },
    { x: cell, y: 0, ops: ["-roll", "+0-1"] },
    { x: cell * 2, y: 0, ops: ["-modulate", "92,82"] },
    { x: 0, y: cell, ops: ["-roll", "+0-1", "-brightness-contrast", "3x4"] },
    { x: cell, y: cell, ops: ["-brightness-contrast", "4x8"] },
    { x: cell * 2, y: cell, ops: ["-roll", "+0+1"] },
    { x: 0, y: cell * 2, ops: ["-brightness-contrast", "-2x8"] },
    { x: cell, y: cell * 2, ops: ["-modulate", "96,116", "-brightness-contrast", "2x10"] },
    { x: cell * 2, y: cell * 2, ops: ["-colorspace", "Gray", "-colorspace", "sRGB", "-brightness-contrast", "-18x2"] }
  ];
  const args = ["-size", `${cell * 3}x${cell * 3}`, "xc:none"];

  for (const frame of frames) {
    args.push(
      "(",
      referencePath,
      "-resize",
      `${cell}x${cell}!`,
      ...frame.ops,
      ")",
      "-geometry",
      `+${frame.x}+${frame.y}`,
      "-compose",
      "over",
      "-composite"
    );
  }

  args.push(outputPath);
  execFileSync("magick", args, { stdio: "pipe" });
}

async function imageFileFromPath(filePath) {
  return toFile(readFileSync(filePath), path.basename(filePath), {
    type: mimeTypeForPath(filePath)
  });
}

function mimeTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

async function generateImageWithRetry(params, attempt = 1) {
  try {
  if (!openai) {
    throw new Error("OpenAI client is not initialized.");
  }
  if ("image" in params) {
      return await openai.images.edit(params);
    }
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

function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function imageQuality() {
  const quality = process.env.OPENAI_IMAGE_QUALITY?.trim();
  return quality === "medium" || quality === "high" || quality === "auto" ? quality : "low";
}

function readIdsArg() {
  const arg = rawArgs.find((value) => value.startsWith("--ids="));
  if (!arg) {
    return undefined;
  }

  const value = arg.slice("--ids=".length).trim();
  if (value === "all") {
    return "all";
  }

  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set(ids);
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
  const arg = rawArgs.find((value) => value.startsWith(prefix));
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
