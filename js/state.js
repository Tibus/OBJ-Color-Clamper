// ============================================================================
// Global State
// ============================================================================

let loadedFile = null;
let loadedFileType = null; // 'obj', 'stl', or 'glb'
let processedOBJ = null;
let processedData = null;
let selectedFormat = 'obj';
let finalPalette = null;
let originalTexture = null; // Texture originale du GLB
let clampedTexture = null;  // Texture après clamping