import sharp from "sharp";

const OUTPUT_SIZE = 1024;

/**
 * Merges two token images side-by-side (50:50 vertical split)
 * Takes the LEFT half of image1 and RIGHT half of image2
 * @param image1Buffer - Buffer of first token image (left half will be used)
 * @param image2Buffer - Buffer of second token image (right half will be used)
 * @param brandColor - Optional hex color for border and divider (e.g., "#0066FF")
 * @returns Buffer of merged 1024x1024 image
 */
export async function mergeTwoTokenImages(
  image1Buffer: Buffer,
  image2Buffer: Buffer,
  brandColor?: string,
): Promise<Buffer> {
  const halfWidth = OUTPUT_SIZE / 2;
  const borderWidth = 48; // Width of the circular border (3x thicker)
  const dividerWidth = 24; // Width of the center divider line (3x thicker)

  // Parse brand color to RGB (default to white if not provided)
  let bgR = 255;
  let bgG = 255;
  let bgB = 255;
  if (brandColor) {
    const hex = brandColor.replace("#", "");
    bgR = Number.parseInt(hex.substring(0, 2), 16);
    bgG = Number.parseInt(hex.substring(2, 4), 16);
    bgB = Number.parseInt(hex.substring(4, 6), 16);
  }

  // First, resize both images to 1024x1024 to ensure we're working with full images
  const [fullImage1, fullImage2] = await Promise.all([
    sharp(image1Buffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
        fit: "cover",
        position: "center",
      })
      .toBuffer(),
    sharp(image2Buffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
        fit: "cover",
        position: "center",
      })
      .toBuffer(),
  ]);

  // Extract LEFT half of image1 (left 512 pixels)
  const leftHalf = await sharp(fullImage1)
    .extract({
      left: 0,
      top: 0,
      width: halfWidth,
      height: OUTPUT_SIZE,
    })
    .toBuffer();

  // Extract RIGHT half of image2 (right 512 pixels)
  const rightHalf = await sharp(fullImage2)
    .extract({
      left: halfWidth,
      top: 0,
      width: halfWidth,
      height: OUTPUT_SIZE,
    })
    .toBuffer();

  // Composite the two halves together with background color matching border color
  let merged = await sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 3,
      background: { r: bgR, g: bgG, b: bgB },
    },
  })
    .composite([
      { input: leftHalf, top: 0, left: 0 },
      { input: rightHalf, top: 0, left: halfWidth },
    ])
    .jpeg()
    .toBuffer();

  // Add brand color border and divider if provided
  if (brandColor) {
    const r = bgR;
    const g = bgG;
    const b = bgB;

    // Create circular mask with border
    const radius = OUTPUT_SIZE / 2;
    const center = OUTPUT_SIZE / 2;

    // Create SVG for circular border and center divider
    const svgBorder = `
      <svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}">
        <!-- Circular border (outer ring) -->
        <circle
          cx="${center}"
          cy="${center}"
          r="${radius - borderWidth / 2}"
          fill="none"
          stroke="rgb(${r},${g},${b})"
          stroke-width="${borderWidth}"
        />
        <!-- Center divider line -->
        <line
          x1="${halfWidth}"
          y1="0"
          x2="${halfWidth}"
          y2="${OUTPUT_SIZE}"
          stroke="rgb(${r},${g},${b})"
          stroke-width="${dividerWidth}"
        />
      </svg>
    `;

    // Apply circular mask to the merged image
    const circleMask = Buffer.from(
      `<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="white"/>
      </svg>`,
    );

    // First apply circular mask
    const maskedImage = await sharp(merged)
      .composite([
        {
          input: circleMask,
          blend: "dest-in",
        },
      ])
      .toBuffer();

    // Then overlay the border and divider
    merged = await sharp(maskedImage)
      .composite([
        {
          input: Buffer.from(svgBorder),
          top: 0,
          left: 0,
        },
      ])
      .jpeg()
      .toBuffer();
  }

  return merged;
}

/**
 * Merges three token images in a pie chart layout (120° segments each)
 * @param image1Buffer - Buffer of first token image
 * @param image2Buffer - Buffer of second token image
 * @param image3Buffer - Buffer of third token image
 * @returns Buffer of merged 1024x1024 image
 */
export async function mergeThreeTokenImages(
  image1Buffer: Buffer,
  image2Buffer: Buffer,
  image3Buffer: Buffer,
): Promise<Buffer> {
  // For a 3-way pie chart, we'll create three triangular sections
  // This is a simplified approach using masks
  const centerX = OUTPUT_SIZE / 2;
  const centerY = OUTPUT_SIZE / 2;
  const sectionSize = Math.ceil(OUTPUT_SIZE / Math.sqrt(3));

  // Resize all three images to fit in their sections
  const [resized1, resized2, resized3] = await Promise.all([
    sharp(image1Buffer)
      .resize(sectionSize, sectionSize, {
        fit: "cover",
        position: "center",
      })
      .toBuffer(),
    sharp(image2Buffer)
      .resize(sectionSize, sectionSize, {
        fit: "cover",
        position: "center",
      })
      .toBuffer(),
    sharp(image3Buffer)
      .resize(sectionSize, sectionSize, {
        fit: "cover",
        position: "center",
      })
      .toBuffer(),
  ]);

  // For simplicity, create a 3x3 grid layout (top, middle-left, middle-right)
  // This is easier than true pie chart segments and still looks good
  const thirdSize = Math.ceil(OUTPUT_SIZE / 3);
  const twoThirds = thirdSize * 2;

  const [positioned1, positioned2, positioned3] = await Promise.all([
    sharp(resized1)
      .resize(twoThirds, thirdSize, { fit: "cover" })
      .toBuffer(),
    sharp(resized2)
      .resize(thirdSize, twoThirds, { fit: "cover" })
      .toBuffer(),
    sharp(resized3)
      .resize(thirdSize, twoThirds, { fit: "cover" })
      .toBuffer(),
  ]);

  // Composite in a triangle-ish pattern
  const merged = await sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: positioned1,
        top: 0,
        left: Math.floor((OUTPUT_SIZE - twoThirds) / 2),
      }, // Top center
      { input: positioned2, top: thirdSize, left: 0 }, // Bottom left
      { input: positioned3, top: thirdSize, left: twoThirds }, // Bottom right
    ])
    .jpeg()
    .toBuffer();

  return merged;
}

/**
 * Uses a single token image as the vault image (resized to 1024x1024)
 * @param imageBuffer - Buffer of the token image
 * @returns Buffer of resized 1024x1024 image
 */
export async function useSingleTokenImage(
  imageBuffer: Buffer,
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "cover",
      position: "center",
    })
    .jpeg()
    .toBuffer();
}

/**
 * Merges token images based on count
 * @param imageBuffers - Array of token image buffers
 * @param brandColor - Optional hex color for border and divider (e.g., "#0066FF")
 * @returns Buffer of merged image, or null if invalid count
 */
export async function mergeTokenImages(
  imageBuffers: Buffer[],
  brandColor?: string,
): Promise<Buffer | null> {
  if (imageBuffers.length === 1) {
    return useSingleTokenImage(imageBuffers[0]);
  }

  if (imageBuffers.length === 2) {
    return mergeTwoTokenImages(imageBuffers[0], imageBuffers[1], brandColor);
  }

  if (imageBuffers.length === 3) {
    return mergeThreeTokenImages(
      imageBuffers[0],
      imageBuffers[1],
      imageBuffers[2],
    );
  }

  console.error(`Unsupported token count: ${imageBuffers.length}`);
  return null;
}
