// ============================================================================
// LocalStorage for MMU
// ============================================================================

const MMU_STORAGE_KEY = 'objColorClamper_mmuIndices';

function loadMmuIndices() {
  try {
    const stored = localStorage.getItem(MMU_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAllMmuIndices() {
  if (!finalPalette) return;
  const indices = loadMmuIndices();
  for (const item of finalPalette) {
    indices[item.color.name] = item.mmuIndex;
  }
  try {
    localStorage.setItem(MMU_STORAGE_KEY, JSON.stringify(indices));
  } catch {
    // Ignore storage errors
  }
}
