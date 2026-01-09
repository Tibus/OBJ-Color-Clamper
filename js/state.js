// ============================================================================
// Global State
// ============================================================================

let loadedFile = null;
let loadedFileType = null; // 'obj', 'stl', or 'glb'
let processedOBJ = null;
let processedData = null;
let selectedFormat = 'obj';
let finalPalette = null;
let originalTexture = null; // Original texture from GLB
let clampedTexture = null;  // Texture after clamping
let glbExtractedPalette = null; // Palette extracted from GLB texture