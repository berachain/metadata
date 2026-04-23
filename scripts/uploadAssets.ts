/**
 * Uploads contributor-added images under src/assets/{tokens,vaults,validators}
 * to Cloudflare Images. Intended to run inside the `upload-assets` CI job after
 * a maintainer has approved the `cloudflare-uploads` environment deployment.
 *
 * Usage: tsx scripts/uploadAssets.ts <pr-head-dir>
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN
 *   GITHUB_REPOSITORY, PR_NUMBER, GH_TOKEN (for resolving changed files via gh)
 *
 * The script:
 *   1. Resolves the list of added/modified files under src/assets/** on the PR
 *      via `gh api /repos/{repo}/pulls/{pr}/files --paginate`.
 *   2. Per-file validates path, filename, extension, EIP-55 checksum (where
 *      applicable), 1024x1024 dimensions, PNG non-transparency, and 5 MB cap.
 *   3. Uploads to Cloudflare Images with id = "{type}/{filename}". On a 5409
 *      ALREADY_EXISTS error, DELETEs the existing image and retries once.
 *   4. Writes a summary to $GITHUB_STEP_SUMMARY and stdout, then exits non-zero
 *      if any file failed.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import {
  getImageDimensions,
  hasTransparency,
  isValidChecksumAddress,
} from "./utils/_imageChecks";

const HEAD_DIR = process.argv[2];

if (!HEAD_DIR) {
  console.error("Usage: tsx scripts/uploadAssets.ts <pr-head-dir>");
  process.exit(1);
}

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_IMAGES_API_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER;

if (
  !CLOUDFLARE_ACCOUNT_ID ||
  !CLOUDFLARE_IMAGES_API_TOKEN ||
  !GITHUB_REPOSITORY ||
  !PR_NUMBER
) {
  console.error(
    "Missing required env vars. Need: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN, GITHUB_REPOSITORY, PR_NUMBER",
  );
  process.exit(1);
}

const ALLOWED_TYPES = ["tokens", "vaults", "validators"] as const;
type AssetType = (typeof ALLOWED_TYPES)[number];

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;
const REQUIRED_DIMENSION = 1024;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const CF_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;

type Status = "uploaded" | "overwritten" | "skipped" | "failed";

interface Result {
  file: string;
  status: Status;
  message: string;
}

interface FileCheckOk {
  ok: true;
  type: AssetType;
  id: string;
  basename: string;
  ext: string;
}

interface FileCheckErr {
  ok: false;
  reason: string;
}

interface CloudflareResponse {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { id?: string; filename?: string; variants?: string[] };
}

// File list resolution
// ================================================================
const fetchChangedAssetFiles = (): string[] => {
  // `gh api --paginate --jq` emits JSONL (one object per line) when jq
  // produces per-element output. Parse that into a typed list.
  const raw = execFileSync(
    "gh",
    [
      "api",
      `repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files`,
      "--paginate",
      "--jq",
      ".[] | {filename, status}",
    ],
    { encoding: "utf-8" },
  );

  const entries = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { filename: string; status: string });

  return entries
    .filter(
      (e) =>
        e.status === "added" ||
        e.status === "modified" ||
        e.status === "changed" ||
        e.status === "renamed",
    )
    .filter((e) => e.filename.startsWith("src/assets/"))
    .map((e) => e.filename);
};

// Per-file static validation
// ================================================================
const validatePath = (relPath: string): FileCheckOk | FileCheckErr => {
  // Must be exactly src/assets/<type>/<filename> — no deeper nesting, no "..".
  const normalized = path.posix.normalize(relPath);
  if (normalized !== relPath || normalized.includes("..")) {
    return { ok: false, reason: "path normalization mismatch or contains .." };
  }

  const parts = normalized.split("/");
  if (parts.length !== 4 || parts[0] !== "src" || parts[1] !== "assets") {
    return {
      ok: false,
      reason: `path must be src/assets/<type>/<filename>, got depth ${parts.length}`,
    };
  }

  const type = parts[2];
  const filename = parts[3];
  if (!ALLOWED_TYPES.includes(type as AssetType)) {
    return {
      ok: false,
      reason: `type must be one of ${ALLOWED_TYPES.join("/")}, got "${type}"`,
    };
  }

  const ext = path.extname(filename).toLowerCase();
  if (
    !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])
  ) {
    return {
      ok: false,
      reason: `extension must be png/jpg/jpeg, got "${ext}"`,
    };
  }

  const basename = filename.slice(0, filename.length - ext.length);

  if (type === "validators") {
    if (!/^0x[0-9a-f]{96}$/i.test(basename)) {
      return {
        ok: false,
        reason: "filename must be 0x + 96 hex chars (validator pubkey)",
      };
    }
  } else {
    // tokens or vaults
    if (!/^0x[0-9a-f]{40}$/i.test(basename)) {
      return {
        ok: false,
        reason: "filename must be 0x + 40 hex chars (address)",
      };
    }
    if (!isValidChecksumAddress(basename)) {
      return {
        ok: false,
        reason: "address is not in EIP-55 checksum format",
      };
    }
  }

  return {
    ok: true,
    type: type as AssetType,
    id: `${type}/${filename}`,
    basename,
    ext,
  };
};

const validateImageContent = async (
  absPath: string,
  ext: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const stat = fs.statSync(absPath);
  if (stat.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      reason: `file size ${stat.size}B exceeds ${MAX_FILE_SIZE}B cap`,
    };
  }

  const dimensions = getImageDimensions(absPath);
  if (!dimensions) {
    return {
      ok: false,
      reason: "could not parse image header (unsupported format)",
    };
  }
  if (
    dimensions.width !== REQUIRED_DIMENSION ||
    dimensions.height !== REQUIRED_DIMENSION
  ) {
    return {
      ok: false,
      reason: `dimensions ${dimensions.width}x${dimensions.height} must be ${REQUIRED_DIMENSION}x${REQUIRED_DIMENSION}`,
    };
  }

  if (ext === ".png") {
    const transparent = await hasTransparency(absPath);
    if (transparent) {
      return { ok: false, reason: "PNG has transparent pixels" };
    }
  }

  return { ok: true };
};

// Cloudflare upload
// ================================================================
const deleteImage = async (id: string): Promise<boolean> => {
  const response = await fetch(`${CF_API_BASE}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CLOUDFLARE_IMAGES_API_TOKEN}` },
  });
  const body = (await response.json()) as CloudflareResponse;
  return response.ok && body.success === true;
};

const uploadImage = async (
  absPath: string,
  id: string,
  basename: string,
): Promise<CloudflareResponse & { httpStatus: number }> => {
  const buf = fs.readFileSync(absPath);
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  const formData = new FormData();
  formData.append("file", new Blob([ab]), basename);
  formData.append("id", id);

  const response = await fetch(CF_API_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLOUDFLARE_IMAGES_API_TOKEN}` },
    body: formData,
  });
  const body = (await response.json()) as CloudflareResponse;
  return { ...body, httpStatus: response.status };
};

const uploadWithOverwrite = async (
  absPath: string,
  id: string,
  basename: string,
): Promise<{ status: Exclude<Status, "skipped">; message: string }> => {
  const first = await uploadImage(absPath, id, basename);
  if (first.success) {
    return { status: "uploaded", message: "ok" };
  }

  const alreadyExists = first.errors?.some((e) => e.code === 5409);
  if (!alreadyExists) {
    return {
      status: "failed",
      message: `cloudflare upload failed (HTTP ${first.httpStatus}): ${JSON.stringify(first.errors ?? first)}`,
    };
  }

  // DELETE then retry once — "overwrite" mode per approved plan.
  const deleted = await deleteImage(id);
  if (!deleted) {
    return {
      status: "failed",
      message: `image already exists and DELETE to overwrite failed for id=${id}`,
    };
  }

  const second = await uploadImage(absPath, id, basename);
  if (second.success) {
    return { status: "overwritten", message: "deleted + re-uploaded" };
  }

  return {
    status: "failed",
    message: `overwrite re-upload failed (HTTP ${second.httpStatus}): ${JSON.stringify(second.errors ?? second)}`,
  };
};

// Summary
// ================================================================
const renderSummary = (results: Result[]): string => {
  const uploaded = results.filter((r) => r.status === "uploaded");
  const overwritten = results.filter((r) => r.status === "overwritten");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");

  const lines: string[] = [];
  lines.push("## Cloudflare asset upload summary");
  lines.push("");
  lines.push(`- Uploaded: **${uploaded.length}**`);
  lines.push(`- Overwritten: **${overwritten.length}**`);
  lines.push(`- Skipped: **${skipped.length}**`);
  lines.push(`- Failed: **${failed.length}**`);
  lines.push("");

  if (results.length > 0) {
    lines.push("| Status | File | Detail |");
    lines.push("| --- | --- | --- |");
    for (const r of results) {
      lines.push(
        `| ${r.status} | \`${r.file}\` | ${r.message.replace(/\|/g, "\\|")} |`,
      );
    }
  } else {
    lines.push("_No asset files changed in this PR._");
  }

  return lines.join("\n");
};

const writeSummary = (body: string) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${body}\n`);
  }
};

// Main
// ================================================================
const main = async () => {
  const changed = fetchChangedAssetFiles();
  console.log(
    chalk.cyan(
      `Found ${changed.length} changed/added file(s) under src/assets/`,
    ),
  );

  const results: Result[] = [];

  for (const relPath of changed) {
    const absPath = path.join(HEAD_DIR, relPath);

    if (!fs.existsSync(absPath)) {
      results.push({
        file: relPath,
        status: "skipped",
        message: "file not present in PR head (possibly deleted after rename)",
      });
      continue;
    }

    const fileCheck = validatePath(relPath);
    if (!fileCheck.ok) {
      results.push({
        file: relPath,
        status: "failed",
        message: fileCheck.reason,
      });
      continue;
    }

    const contentCheck = await validateImageContent(absPath, fileCheck.ext);
    if (!contentCheck.ok) {
      results.push({
        file: relPath,
        status: "failed",
        message: contentCheck.reason,
      });
      continue;
    }

    console.log(chalk.blue(`Uploading ${relPath} → id=${fileCheck.id}`));
    const upload = await uploadWithOverwrite(
      absPath,
      fileCheck.id,
      `${fileCheck.basename}${fileCheck.ext}`,
    );
    results.push({
      file: relPath,
      status: upload.status,
      message: upload.message,
    });
  }

  const summary = renderSummary(results);
  console.log();
  console.log(summary);
  writeSummary(summary);

  // Machine-readable output for anyone parsing stdout.
  console.log();
  console.log(
    JSON.stringify(
      {
        uploaded: results
          .filter((r) => r.status === "uploaded")
          .map((r) => r.file),
        overwritten: results
          .filter((r) => r.status === "overwritten")
          .map((r) => r.file),
        skipped: results
          .filter((r) => r.status === "skipped")
          .map((r) => r.file),
        failed: results
          .filter((r) => r.status === "failed")
          .map((r) => ({ file: r.file, error: r.message })),
      },
      null,
      2,
    ),
  );

  const failedCount = results.filter((r) => r.status === "failed").length;
  if (failedCount > 0) {
    console.error(chalk.red.bold(`\n${failedCount} file(s) failed`));
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
