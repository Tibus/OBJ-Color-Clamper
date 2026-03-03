#!/usr/bin/env node
// =============================================================================
// remap-3mf-colors.js
// Opens a 3MF file and remaps filament/extruder colours to the nearest match
// from a restricted palette.
//
// Supports:
//   - Bambu Studio  → Metadata/project_settings.config (JSON, filament_colour)
//   - PrusaSlicer   → Metadata/Slic3r_PE.config (INI, extruder_colour)
//
// When a colour doesn't match exactly, the user is prompted to pick a target.
// Mappings are saved to color-mappings.json so each colour is only asked once.
//
// Usage:  node remap-3mf-colors.js <input.3mf> [output.3mf]
//         If output is omitted, overwrites the input file.
// =============================================================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const JSZip = require('jszip');

const MAPPINGS_FILE = path.join(__dirname, 'color-mappings.json');

// ── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  { name: 'Blanc',    hex: '#FFFFFF' },
  { name: 'Noir',     hex: '#000000' },
  { name: 'Gris', hex: '#6F707A' },
  { name: 'Brun fonçé', hex: '#86592d' },
  { name: 'Brun clair', hex: '#FFBE80' },
  { name: 'Crême', hex: '#FFDEB3' },
  //{ name: 'Doré',   he },
  { name: 'Jaune', hex: '#FFFF00' },
  { name: 'Bleu fonçé', hex: '#3399FF' },
  { name: 'Bleu clair', hex: '#8FAEE6' },
  { name: 'Rouge', hex: '#FF3300' },
  { name: 'Vert', hex: '#6FD22D' },
  { name: 'Rose', hex: '#FF80BF' },
  { name: 'Orange', hex: '#FF9900' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 8) hex = hex.slice(0, 6);
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function normalizeHex(hex) {
  hex = hex.trim().toUpperCase().replace('#', '');
  if (hex.length === 8) hex = hex.slice(0, 6);
  return '#' + hex;
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

function findExact(hex) {
  const norm = normalizeHex(hex);
  return PALETTE.find(e => normalizeHex(e.hex) === norm) || null;
}

function findNearest(hex) {
  const rgb = hexToRgb(hex);
  let bestDist = Infinity;
  let bestEntry = PALETTE[0];
  for (const entry of PALETTE) {
    const d = colorDistance(rgb, hexToRgb(entry.hex));
    if (d < bestDist) {
      bestDist = d;
      bestEntry = entry;
    }
  }
  return bestEntry;
}

// ── Mappings persistence ────────────────────────────────────────────────────
function loadMappings() {
  try {
    return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveMappings(mappings) {
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2) + '\n');
}

// ── Terminal colour display ────────────────────────────────────────────────
function colorSwatch(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = Math.round(r * 255);
  const G = Math.round(g * 255);
  const B = Math.round(b * 255);
  return `\x1b[48;2;${R};${G};${B}m    \x1b[0m`;
}

// ── Interactive prompt ──────────────────────────────────────────────────────
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function askMapping(rl, sourceHex) {
  const nearest = findNearest(sourceHex);

  console.log(`\n  Colour ${sourceHex} ${colorSwatch(sourceHex)} is not in the palette.`);
  console.log(`  Nearest match: ${nearest.hex} ${colorSwatch(nearest.hex)} (${nearest.name})\n`);
  console.log('  Available colours:');
  PALETTE.forEach((e, i) => {
    const marker = e.hex === nearest.hex ? ' ← nearest' : '';
    console.log(`    ${String(i + 1).padStart(2)}. ${colorSwatch(e.hex)} ${e.hex}  ${e.name}${marker}`);
  });
  console.log(`    ${String(0).padStart(2)}. (enter a custom hex)`);

  return new Promise((resolve) => {
    rl.question(`\n  Choice [1-${PALETTE.length}, or 0 for custom] (default: nearest ${nearest.name}): `, (answer) => {
      answer = answer.trim();

      // Default = nearest
      if (answer === '') {
        resolve(nearest.hex);
        return;
      }

      const num = parseInt(answer, 10);
      if (num === 0) {
        rl.question('  Enter hex colour (e.g. #FF0000): ', (custom) => {
          resolve(normalizeHex(custom));
        });
        return;
      }

      if (num >= 1 && num <= PALETTE.length) {
        resolve(PALETTE[num - 1].hex);
        return;
      }

      // Invalid → use nearest
      console.log('  Invalid choice, using nearest.');
      resolve(nearest.hex);
    });
  });
}

// ── Slicer detection & format handlers ────────────────────────────────────

/**
 * Detect slicer format from the ZIP contents.
 * Returns 'bambu' | 'prusa' | null
 */
function detectSlicer(zip) {
  if (zip.file('Metadata/project_settings.config')) return 'bambu';
  if (zip.file('Metadata/Slic3r_PE.config')) return 'prusa';
  return null;
}

/**
 * Bambu Studio: reads filament_colour from JSON config.
 * Returns { colours: string[], configPath, configText, config }
 */
async function readBambuColours(zip) {
  const configPath = 'Metadata/project_settings.config';
  const configText = await zip.file(configPath).async('string');
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    throw new Error('Failed to parse project_settings.config as JSON.');
  }
  if (!config.filament_colour || !Array.isArray(config.filament_colour)) {
    throw new Error('No filament_colour array found in Bambu config.');
  }
  return { colours: config.filament_colour, configPath, config };
}

function writeBambuColours(zip, ctx, remapped) {
  ctx.config.filament_colour = remapped;
  zip.file(ctx.configPath, JSON.stringify(ctx.config, null, 2));
}

/**
 * PrusaSlicer: reads extruder_colour from INI-style config.
 * Returns { colours: string[], configPath, configText }
 */
async function readPrusaColours(zip) {
  const configPath = 'Metadata/Slic3r_PE.config';
  const configText = await zip.file(configPath).async('string');

  // Find extruder_colour line:  "; extruder_colour = #HEX1;#HEX2;..."
  const match = configText.match(/^;\s*extruder_colour\s*=\s*(.+)$/m);
  if (!match) {
    throw new Error('No extruder_colour found in Slic3r_PE.config.');
  }
  const colours = match[1].trim().split(';').map(c => c.trim()).filter(Boolean);
  return { colours, configPath, configText };
}

function writePrusaColours(zip, ctx, remapped) {
  // Rebuild the extruder_colour line
  const newLine = `; extruder_colour = ${remapped.join(';')}`;
  const updated = ctx.configText.replace(
    /^;\s*extruder_colour\s*=\s*.+$/m,
    newLine,
  );
  zip.file(ctx.configPath, updated);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node remap-3mf-colors.js <input.3mf> [output.3mf]');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] ? path.resolve(args[1]) : inputPath;

  console.log("InputPath : ", inputPath);

  // Read ZIP
  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);

  // Detect slicer format
  const slicer = detectSlicer(zip);
  if (!slicer) {
    console.error(
      'Unsupported 3MF format: no Bambu project_settings.config or Prusa Slic3r_PE.config found.',
    );
    process.exit(1);
  }

  console.log(`Detected slicer: ${slicer === 'bambu' ? 'Bambu Studio' : 'PrusaSlicer'}`);

  // Read colours from the appropriate config
  let ctx, sourceColours;
  if (slicer === 'bambu') {
    ctx = await readBambuColours(zip);
  } else {
    ctx = await readPrusaColours(zip);
  }
  sourceColours = ctx.colours;

  // Load saved mappings
  const mappings = loadMappings();
  let mappingsChanged = false;
  let rl = null;

  console.log(`Found ${sourceColours.length} colour(s):\n`);

  const remapped = [];

  for (let i = 0; i < sourceColours.length; i++) {
    const hex = normalizeHex(sourceColours[i]);

    // 1) Exact palette match → keep as-is
    const exact = findExact(hex);
    if (exact) {
      console.log(`  [${i + 1}] ${colorSwatch(hex)} ${hex}  =  ${exact.hex}  (${exact.name})`);
      remapped.push(exact.hex);
      continue;
    }

    // 2) Already mapped in config → reuse
    if (mappings[hex]) {
      const target = mappings[hex];
      const entry = findExact(target);
      const label = entry ? entry.name : 'custom';
      console.log(`  [${i + 1}] ${colorSwatch(hex)} ${hex}  →  ${colorSwatch(target)} ${target}  (${label}, saved mapping)`);
      remapped.push(target);
      continue;
    }

    // 3) Ask the user
    if (!rl) rl = createRL();
    const chosen = await askMapping(rl, hex);
    mappings[hex] = normalizeHex(chosen);
    mappingsChanged = true;

    const entry = findExact(chosen);
    const label = entry ? entry.name : 'custom';
    console.log(`  [${i + 1}] ${colorSwatch(hex)} ${hex}  →  ${colorSwatch(chosen)} ${normalizeHex(chosen)}  (${label})`);
    remapped.push(normalizeHex(chosen));
  }

  if (rl) rl.close();

  // Save mappings if changed
  if (mappingsChanged) {
    saveMappings(mappings);
    console.log(`\nMappings saved to ${MAPPINGS_FILE}`);
  }

  // Write remapped colours back
  if (slicer === 'bambu') {
    writeBambuColours(zip, ctx, remapped);
  } else {
    writePrusaColours(zip, ctx, remapped);
  }

  const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, output);

  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
