#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI, { toFile } from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "lib/characters/data.json");
const portraitDir = path.join(repoRoot, "public/portraits/characters");
const spriteDir = path.join(repoRoot, "public/portraits/sprites");

loadDotEnv(path.join(repoRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".env.local"));

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const metadataOnly = args.has("--metadata-only");
const portraitOnly = args.has("--portrait-only");
const spritesOnly = args.has("--sprites-only");
const aiSprites = args.has("--ai-sprites");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const requestedId = option("id");
const requestedName = option("name");
const id = normalizeId(requestedId || requestedName || "");
const existingProfile = data.find((profile) => profile.id === id);

if (!id) {
  throw new Error("A valid --id or --name is required.");
}

if (portraitOnly && spritesOnly) {
  throw new Error("Use either --portrait-only or --sprites-only, not both.");
}

if (!existingProfile && spritesOnly) {
  throw new Error("--sprites-only requires an existing character profile.");
}

if (existingProfile && !force && !portraitOnly && !spritesOnly) {
  throw new Error(`Character "${id}" already exists. Use --force to update metadata or an asset-only flag.`);
}

const profile = dryRun
  ? buildLocalProfile(existingProfile)
  : await buildProfile(existingProfile);
const portraitPath = path.join(repoRoot, "public", profile.portraitSrc);
const spritePath = path.join(repoRoot, "public", profile.spriteSheetSrc);

console.log(`${dryRun ? "Would generate" : "Generating"} character "${profile.id}" (${profile.name}).`);
console.log(`- metadata: ${path.relative(repoRoot, dataPath)}${spritesOnly || portraitOnly ? " (unchanged unless --force metadata is used)" : ""}`);
console.log(`- portrait: ${path.relative(repoRoot, portraitPath)}${metadataOnly || spritesOnly ? " (skipped)" : ""}`);
console.log(`- sprite sheet: ${path.relative(repoRoot, spritePath)}${metadataOnly || portraitOnly ? " (skipped)" : ""}`);

if (dryRun) {
  console.log(JSON.stringify(profile, null, 2));
  process.exit(0);
}

if (!metadataOnly && !spritesOnly && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to generate portrait or sprite assets.");
}

if (aiSprites && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to generate AI sprite assets.");
}

if (!metadataOnly && !spritesOnly && (force || !existsSync(portraitPath))) {
  mkdirSync(path.dirname(portraitPath), { recursive: true });
  const result = await generateImageWithRetry({
    model: imageModel(),
    prompt: portraitPrompt(profile),
    size: "1024x1024",
    quality: imageQuality(),
    output_format: "png",
    background: "opaque",
    n: 1
  });
  writeImageResult(result, portraitPath, profile.id, "portrait");
  console.log(`Generated ${path.relative(repoRoot, portraitPath)}`);
}

if (!metadataOnly && !portraitOnly && (force || !existsSync(spritePath))) {
  mkdirSync(path.dirname(spritePath), { recursive: true });
  if (!aiSprites) {
    if (!existsSync(portraitPath)) {
      throw new Error(`Cannot derive sprite sheet; missing portrait at ${path.relative(repoRoot, portraitPath)}.`);
    }
    deriveSpriteSheet(portraitPath, spritePath);
    console.log(`Generated ${path.relative(repoRoot, spritePath)}`);
  } else {
    const spriteParams = existsSync(portraitPath)
      ? {
          image: await imageFileFromPath(portraitPath),
          model: imageModel(),
          prompt: spriteSheetPrompt(profile),
          size: "1024x1024",
          quality: imageQuality(),
          output_format: "png",
          background: "opaque",
          n: 1
        }
      : {
          model: imageModel(),
          prompt: spriteSheetPrompt(profile),
          size: "1024x1024",
          quality: imageQuality(),
          output_format: "png",
          background: "opaque",
          n: 1
        };
    const result = await generateImageWithRetry(spriteParams);
    writeImageResult(result, spritePath, profile.id, "sprite sheet");
    console.log(`Generated ${path.relative(repoRoot, spritePath)}`);
  }
}

if (!portraitOnly && !spritesOnly) {
  const nextData = existingProfile
    ? data.map((candidate) => (candidate.id === profile.id ? profile : candidate))
    : [...data, profile];
  writeFileSync(dataPath, `${JSON.stringify(nextData, null, 2)}\n`);
  console.log(`${existingProfile ? "Updated" : "Added"} ${profile.id} in ${path.relative(repoRoot, dataPath)}`);
}

function buildLocalProfile(existing) {
  const name = requestedName || existing?.name || titleFromId(id);
  const summary = option("summary") || existing?.summary || "New Mafia table suspect";
  const description = option("description") || existing?.style || summary;
  const style =
    option("style") ||
    existing?.style ||
    `${description} Speaks compactly, reacts to pressure, and turns social reads into sharp table accusations.`;
  const fallbackLines = repeatedOption("fallback-line");

  return normalizeProfile({
    id,
    name,
    summary,
    style,
    fallbackLines: fallbackLines.length ? fallbackLines : existing?.fallbackLines,
    imagePrompt: option("image-prompt") || existing?.imagePrompt || defaultImagePrompt(name, summary, description),
    portraitSrc: existing?.portraitSrc,
    spriteSheetSrc: existing?.spriteSheetSrc,
    voiceId: option("voice-id") || existing?.voiceId,
    packIds: repeatedOption("pack-id").length ? repeatedOption("pack-id") : existing?.packIds,
    chaosTier: option("chaos-tier") || existing?.chaosTier,
    voiceTone: option("voice-tone") || existing?.voiceTone,
    browserVoice: existing?.browserVoice
  });
}

async function buildProfile(existing) {
  const supplied = buildLocalProfile(existing);
  const hasCompleteCopy =
    !!option("style") && repeatedOption("fallback-line").length >= 3 && !!option("image-prompt");

  if (existing || hasCompleteCopy || !option("description")) {
    return supplied;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to draft character metadata from --description.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: characterModel(),
    instructions: [
      "Draft one original character profile for a local noir Mafia game.",
      "Return JSON only. Do not use copyrighted characters, public-figure likenesses, slurs, or hidden game facts.",
      "The character must be playable as any Mafia role and should speak compactly at a tense table."
    ].join(" "),
    input: [
      `id: ${id}`,
      `name: ${supplied.name}`,
      `summary: ${supplied.summary}`,
      `description: ${option("description")}`,
      `voice gender: ${voiceGender()}`,
      "Return this exact shape:",
      '{ "summary": "short label", "style": "one vivid paragraph of speech and behavior guidance", "fallbackLines": ["line 1", "line 2", "line 3"], "imagePrompt": "portrait subject prompt" }'
    ].join("\n"),
    max_output_tokens: 1200,
    text: {
      format: {
        type: "json_object"
      }
    },
    store: false
  });
  const drafted = JSON.parse(response.output_text || "{}");

  return normalizeProfile({
    ...supplied,
    summary: stringOr(drafted.summary, supplied.summary),
    style: stringOr(drafted.style, supplied.style),
    fallbackLines: arrayOfStringsOr(drafted.fallbackLines, supplied.fallbackLines),
    imagePrompt: stringOr(drafted.imagePrompt, supplied.imagePrompt)
  });
}

function normalizeProfile(profile) {
  const gender = voiceGender();
  return {
    id,
    name: cleanText(profile.name || titleFromId(id), 40),
    summary: cleanText(profile.summary || "New Mafia table suspect", 70),
    style: cleanText(profile.style || `${profile.summary} who plays the table with compact suspicion.`, 700),
    fallbackLines: normalizeFallbackLines(profile.fallbackLines),
    portraitSrc: profile.portraitSrc || `/portraits/characters/${id}.png`,
    spriteSheetSrc: profile.spriteSheetSrc || `/portraits/sprites/${id}.png`,
    ...(profile.voiceId ? { voiceId: profile.voiceId } : {}),
    ...(normalizePackIds(profile.packIds).length ? { packIds: normalizePackIds(profile.packIds) } : {}),
    ...(normalizeChaosTier(profile.chaosTier) ? { chaosTier: normalizeChaosTier(profile.chaosTier) } : {}),
    ...(profile.voiceTone ? { voiceTone: cleanText(profile.voiceTone, 80) } : {}),
    browserVoice: profile.browserVoice || browserVoiceForGender(gender),
    imagePrompt: cleanText(profile.imagePrompt || defaultImagePrompt(profile.name, profile.summary, profile.style), 420)
  };
}

function normalizePackIds(packIds) {
  return Array.isArray(packIds)
    ? [...new Set(packIds.map((packId) => normalizeId(packId)).filter(Boolean))].slice(0, 4)
    : [];
}

function normalizeChaosTier(value) {
  const tier = Number.parseInt(value, 10);
  return tier >= 1 && tier <= 3 ? tier : undefined;
}

function normalizeFallbackLines(lines) {
  const normalized = Array.isArray(lines) ? lines.map((line) => cleanText(line, 180)).filter(Boolean).slice(0, 5) : [];
  while (normalized.length < 3) {
    normalized.push(defaultFallbackLine(normalized.length));
  }
  return normalized;
}

function portraitPrompt(profile) {
  return [
    "Use case: stylized-concept",
    "Asset type: square NPC portrait for a noir pixel-inspired Mafia game UI",
    `Primary request: ${profile.imagePrompt}`,
    `Personality: ${profile.style}`,
    "Style: original character, 16-bit noir pixel-art game portrait, crisp chunky pixels, clear head-and-shoulders composition, dramatic candlelit Palermo table mood.",
    "Constraints: no text, no watermark, no exact likeness of a living public figure, no copyrighted character copy, safe for a game character library.",
    "Framing: centered bust portrait, dark simple background, strong silhouette, readable at small UI size."
  ].join("\n");
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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
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

function writeImageResult(result, outputPath, profileId, label) {
  const image = result.data?.[0]?.b64_json;
  if (!image) {
    throw new Error(`No ${label} image data returned for ${profileId}.`);
  }
  writeFileSync(outputPath, Buffer.from(image, "base64"));
}

function option(name) {
  const prefix = `--${name}=`;
  const arg = rawArgs.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function repeatedOption(name) {
  const prefix = `--${name}=`;
  return rawArgs.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length).trim()).filter(Boolean);
}

function normalizeId(value) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function titleFromId(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function defaultImagePrompt(name, summary, description) {
  return `Original Mafia table character named ${name}, ${summary}, ${description}, seated at a candlelit noir Palermo table, square pixel-art portrait.`;
}

function defaultFallbackLine(index) {
  return [
    "I do not trust how clean that answer sounded.",
    "Someone here is polishing fear into manners.",
    "Give me one real reason, not a little parade of smoke."
  ][index];
}

function browserVoiceForGender(gender) {
  if (gender === "feminine") {
    return {
      gender: "feminine",
      names: ["Samantha", "Victoria", "Google US English", "Microsoft Jenny", "Microsoft Aria"],
      rate: 1.04,
      pitch: 1.12
    };
  }

  return {
    gender: "masculine",
    names: ["Alex", "Daniel", "Google UK English Male", "Microsoft George", "Microsoft Guy"],
    rate: 0.96,
    pitch: 0.88
  };
}

function voiceGender() {
  return option("voice-gender") === "feminine" ? "feminine" : "masculine";
}

function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function imageQuality() {
  const quality = process.env.OPENAI_IMAGE_QUALITY?.trim();
  return quality === "medium" || quality === "high" || quality === "auto" ? quality : "low";
}

function characterModel() {
  return process.env.OPENAI_CHARACTER_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function arrayOfStringsOr(value, fallback) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
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
