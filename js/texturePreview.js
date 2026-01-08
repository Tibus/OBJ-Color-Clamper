// ============================================================================
// Texture Preview (Original vs Clamped)
// ============================================================================

// Generate clamped texture from original using the palette
function generateClampedTexture(originalTexture, palette) {
  if (!originalTexture) return null;

  const width = originalTexture.width;
  const height = originalTexture.height;
  const clampedData = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = originalTexture.data[idx] / 255;
    const g = originalTexture.data[idx + 1] / 255;
    const b = originalTexture.data[idx + 2] / 255;
    const a = originalTexture.data[idx + 3];

    // Find closest palette color
    const pixelColor = new Color(r, g, b);
    let minDist = Infinity;
    let closestColor = palette[0];

    for (const paletteColor of palette) {
      const dist = pixelColor.distanceTo(paletteColor);
      if (dist < minDist) {
        minDist = dist;
        closestColor = paletteColor;
      }
    }

    clampedData[idx] = Math.round(closestColor.r * 255);
    clampedData[idx + 1] = Math.round(closestColor.g * 255);
    clampedData[idx + 2] = Math.round(closestColor.b * 255);
    clampedData[idx + 3] = a;
  }

  return { data: clampedData, width, height };
}

// Create a canvas element from texture data
function textureToCanvas(texture) {
  if (!texture) return null;

  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(
    new Uint8ClampedArray(texture.data),
    texture.width,
    texture.height
  );
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Display textures in the preview containers
function displayTexturePreview(originalTex, clampedTex) {
  const container = document.getElementById('texturePreviewContainer');
  const originalPreview = document.getElementById('originalTexturePreview');
  const clampedPreview = document.getElementById('clampedTexturePreview');

  if (!container || !originalPreview || !clampedPreview) return;

  // Clear previous content
  originalPreview.innerHTML = '';
  clampedPreview.innerHTML = '';

  if (!originalTex) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // Original texture
  const originalCanvas = textureToCanvas(originalTex);
  if (originalCanvas) {
    originalCanvas.className = 'texture-canvas';
    originalPreview.appendChild(originalCanvas);
  }

  // Clamped texture
  const clampedCanvas = textureToCanvas(clampedTex);
  if (clampedCanvas) {
    clampedCanvas.className = 'texture-canvas';
    clampedPreview.appendChild(clampedCanvas);
  }
}

// Hide texture preview
function hideTexturePreview() {
  const container = document.getElementById('texturePreviewContainer');
  if (container) {
    container.style.display = 'none';
  }
}
