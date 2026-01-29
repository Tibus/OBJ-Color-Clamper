// ============================================================================
// LocalStorage for Picked Palette
// ============================================================================

const PICKED_PALETTE_STORAGE_KEY = 'objColorClamper_pickedPalette';

function savePickedPalette(colors) {
  try {
    const data = colors.map(c => ({
      r: c.r,
      g: c.g,
      b: c.b,
      name: c.name
    }));
    localStorage.setItem(PICKED_PALETTE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

function loadPickedPalette() {
  try {
    const stored = localStorage.getItem(PICKED_PALETTE_STORAGE_KEY);
    if (!stored) return [];
    const data = JSON.parse(stored);
    return data.map(c => new Color(c.r, c.g, c.b, c.name));
  } catch {
    return [];
  }
}

function clearPickedPaletteStorage() {
  try {
    localStorage.removeItem(PICKED_PALETTE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
