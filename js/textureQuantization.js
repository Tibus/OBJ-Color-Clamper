// ============================================================================
// Texture Quantization - Reduce texture to N colors before vertex baking
// ============================================================================

/**
 * Analyze texture and extract representative colors using k-means-like clustering
 * @param {Object} texture - {data: Uint8Array, width, height}
 * @param {number} numColors - Target number of colors
 * @returns {Array} Array of Color objects representing the palette
 */
function extractTextureColors(texture, numColors) {
  const { data, width, height } = texture;

  // Sample pixels (for large textures, sample to avoid performance issues)
  const maxSamples = 10000;
  const totalPixels = width * height;
  const sampleRate = Math.max(1, Math.floor(totalPixels / maxSamples));

  const samples = [];
  for (let i = 0; i < totalPixels; i += sampleRate) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const a = data[idx + 3] / 255;

    // Skip fully transparent pixels
    if (a < 0.1) continue;

    samples.push(new Color(r, g, b));
  }

  if (samples.length === 0) {
    return [new Color(1, 1, 1)]; // Default white if no valid pixels
  }

  // Use k-means++ initialization for better initial centroids
  const centroids = initializeCentroids(samples, numColors);

  // Run k-means clustering
  const maxIterations = 20;
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign samples to nearest centroid
    const clusters = centroids.map(() => []);

    for (const sample of samples) {
      let minDist = Infinity;
      let closestIdx = 0;

      for (let i = 0; i < centroids.length; i++) {
        const dist = sample.distanceTo(centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      clusters[closestIdx].push(sample);
    }

    // Update centroids
    let converged = true;
    for (let i = 0; i < centroids.length; i++) {
      if (clusters[i].length === 0) continue;

      const avgR = clusters[i].reduce((sum, c) => sum + c.r, 0) / clusters[i].length;
      const avgG = clusters[i].reduce((sum, c) => sum + c.g, 0) / clusters[i].length;
      const avgB = clusters[i].reduce((sum, c) => sum + c.b, 0) / clusters[i].length;

      const newCentroid = new Color(avgR, avgG, avgB);
      if (centroids[i].distanceTo(newCentroid) > 0.001) {
        converged = false;
      }
      centroids[i] = newCentroid;
    }

    if (converged) break;
  }

  // Name the colors using their hex codes
  centroids.forEach((c) => {
    c.name = c.toHex();
  });

  return centroids;
}

/**
 * K-means++ initialization - select initial centroids that are well spread out
 */
function initializeCentroids(samples, k) {
  const centroids = [];

  // First centroid: random sample
  const firstIdx = Math.floor(Math.random() * samples.length);
  centroids.push(samples[firstIdx].clone());

  // Subsequent centroids: choose with probability proportional to distance squared
  for (let i = 1; i < k; i++) {
    const distances = samples.map(sample => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = sample.distanceTo(centroid);
        if (dist < minDist) minDist = dist;
      }
      return minDist * minDist; // Square for probability weighting
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    if (totalDist === 0) break;

    // Weighted random selection
    let random = Math.random() * totalDist;
    let selectedIdx = 0;
    for (let j = 0; j < distances.length; j++) {
      random -= distances[j];
      if (random <= 0) {
        selectedIdx = j;
        break;
      }
    }

    centroids.push(samples[selectedIdx].clone());
  }

  return centroids;
}

/**
 * Quantize texture to the given palette
 * @param {Object} texture - {data: Uint8Array, width, height}
 * @param {Array} palette - Array of Color objects
 * @returns {Object} New texture with quantized colors
 */
function quantizeTexture(texture, palette) {
  const { data, width, height } = texture;
  const newData = new Uint8Array(data.length);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const a = data[idx + 3];

    // Find closest palette color
    let minDist = Infinity;
    let closestColor = palette[0];

    for (const color of palette) {
      const dist = new Color(r, g, b).distanceTo(color);
      if (dist < minDist) {
        minDist = dist;
        closestColor = color;
      }
    }

    newData[idx] = Math.round(closestColor.r * 255);
    newData[idx + 1] = Math.round(closestColor.g * 255);
    newData[idx + 2] = Math.round(closestColor.b * 255);
    newData[idx + 3] = a; // Preserve alpha
  }

  return { data: newData, width, height };
}

/**
 * Match extracted colors to closest colors in COLOR_POOL
 * @param {Array} extractedColors - Colors extracted from texture
 * @param {Array} colorPool - Available colors (COLOR_POOL)
 * @returns {Array} Matched colors from colorPool (no duplicates)
 */
function matchToColorPool(extractedColors, colorPool) {
  const matchedColors = [];
  const usedIndices = new Set();

  for (const extracted of extractedColors) {
    let minDist = Infinity;
    let bestIdx = -1;

    // Find closest unused color in pool
    for (let i = 0; i < colorPool.length; i++) {
      if (usedIndices.has(i)) continue;

      const dist = extracted.distanceTo(colorPool[i]);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      matchedColors.push(colorPool[bestIdx]);
      usedIndices.add(bestIdx);
    }
  }

  return matchedColors;
}

/**
 * Pre-process GLB texture: extract colors, match to pool, and quantize
 * @param {Object} texture - Original texture
 * @param {number} numColors - Target number of colors
 * @returns {Object} { quantizedTexture, extractedPalette }
 */
function preprocessGLBTexture(texture, numColors) {
  if (!texture) return { quantizedTexture: null, extractedPalette: [] };

  log(`Analyzing texture (${texture.width}x${texture.height})...`, 'info');

  // Extract representative colors from texture using k-means
  const extractedColors = extractTextureColors(texture, numColors);

  log(`Extracted ${extractedColors.length} dominant colors:`, 'info');
  extractedColors.forEach((c, i) => {
    log(`  ${i + 1}. ${c.toHex()}`);
  });

  // Match extracted colors to closest colors in COLOR_POOL
  log('Matching to available filament colors...', 'info');
  const matchedPalette = matchToColorPool(extractedColors, COLOR_POOL);

  log(`Matched palette:`, 'highlight');
  matchedPalette.forEach((c, i) => {
    log(`  ${i + 1}. ${c.name} ${c.toHex()}`);
  });

  // Quantize texture to matched COLOR_POOL colors
  log('Quantizing texture to filament colors...', 'info');
  const quantizedTexture = quantizeTexture(texture, matchedPalette);

  return { quantizedTexture, extractedPalette: matchedPalette };
}
