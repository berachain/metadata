/**
 * One-off script: download a vault logo, process to 1024x1024 non-transparent,
 * save to src/assets/vaults, and upload to Cloudflare Images.
 *
 * Usage: tsx scripts/addVaultLogo.ts <logo_url> <vault_address>
 * Example: tsx scripts/addVaultLogo.ts "https://i.ibb.co/956Qvz0/snr-USD-Logo-1.png" 0x18e310dd4a6179d9600e95d18926ab7819b2a071
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import sharp from "sharp";

config();

const LOGO_URL = process.argv[2];
const VAULT_ADDRESS = process.argv[3]?.toLowerCase();

if (!LOGO_URL || !VAULT_ADDRESS || !VAULT_ADDRESS.match(/^0x[0-9a-f]{40}$/)) {
  console.error(
    "Usage: tsx scripts/addVaultLogo.ts <logo_url> <vault_address>",
  );
  process.exit(1);
}

const ASSETS_VAULTS = path.join(process.cwd(), "src", "assets", "vaults");
const OUTPUT_PATH = path.join(ASSETS_VAULTS, `${VAULT_ADDRESS}.png`);

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_IMAGES_API_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN;

async function main() {
  console.log("Downloading logo from", LOGO_URL);
  const response = await fetch(LOGO_URL);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  console.log("Processing: resize 1024x1024, flatten (non-transparent)");
  const processed = await sharp(buffer)
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  if (!fs.existsSync(ASSETS_VAULTS)) {
    fs.mkdirSync(ASSETS_VAULTS, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, processed);
  console.log("Saved to", OUTPUT_PATH);

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_IMAGES_API_TOKEN) {
    console.warn(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_IMAGES_API_TOKEN. Skipping upload.",
    );
    console.log(
      "Logo URI (after you upload manually): https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/vaults/" +
        VAULT_ADDRESS +
        ".png/public",
    );
    return;
  }

  const formData = new FormData();
  formData.append("file", new Blob([processed]), `${VAULT_ADDRESS}.png`);
  formData.append("id", `vaults/${VAULT_ADDRESS}.png`);

  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_IMAGES_API_TOKEN}`,
    },
    body: formData,
  });

  const result = (await uploadResponse.json()) as {
    success?: boolean;
    errors?: { code?: number; message?: string }[];
    result?: { id?: string; filename?: string; variants?: string[] };
  };
  const alreadyExists = result.errors?.some((e) => e.code === 5409);
  if (alreadyExists) {
    console.log(
      "Image already exists on Cloudflare Images (id: vaults/" +
        VAULT_ADDRESS +
        ").",
    );
  } else {
    console.log("Cloudflare API response:", JSON.stringify(result, null, 2));
    if (!uploadResponse.ok || !result.success) {
      throw new Error(`Cloudflare upload failed: ${JSON.stringify(result)}`);
    }
    console.log("Uploaded to Cloudflare Images.");
  }
  const logoUri =
    "https://imagedelivery.net/qNj7Q3MCke89zoKzav7eDQ/vaults/" +
    VAULT_ADDRESS +
    ".png/public";
  console.log("Logo URI:", logoUri);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
