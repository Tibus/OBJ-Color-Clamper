// ============================================================================
// Bambu G-code Parser
// ============================================================================

function parseGcode(content, options) {
  options = options || {};
  const skipMovementParsing = options.skipMovementParsing || false;
  const lines = content.split('\n');
  const stats = {
    // Printer & profile
    printerModel: null,
    nozzleDiameter: null,
    printProfile: null,
    // Filaments
    filaments: [],
    totalFilamentUsedG: null,
    totalFilamentUsedMm: null,
    // Time
    estimatedTime: null,
    estimatedTimeSeconds: null,
    // Temperatures
    nozzleTemp: null,
    nozzleTempInitial: null,
    bedTemp: null,
    bedTempInitial: null,
    chamberTemp: null,
    // Layer info
    layerHeight: null,
    firstLayerHeight: null,
    totalLayers: null,
    // Print settings
    wallLoops: null,
    topShellLayers: null,
    bottomShellLayers: null,
    infillDensity: null,
    infillPattern: null,
    supportEnabled: null,
    supportType: null,
    // Speeds
    outerWallSpeed: null,
    innerWallSpeed: null,
    infillSpeed: null,
    topSurfaceSpeed: null,
    travelSpeed: null,
    firstLayerSpeed: null,
    // Dimensions & bounds
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    // Counters
    toolChanges: 0,
    toolChangeList: [],
    retractCount: 0,
    layerTimes: [],
    // Filament per tool
    filamentPerTool: {},
    filamentWeightPerTool: {},
    filamentTypePerTool: {},
    filamentColorPerTool: {},
    // Waste tracking
    flushExtrusionMm: 0,
    wipeTowerExtrusionMm: 0,
    flushCount: 0,
    wipeTowerCount: 0,
    filamentDiameter: 1.75,
    filamentDensity: null,
    flushMultiplier: null,
    flushVolumesMatrix: null,
    flushIntoInfill: null,
    flushIntoSupport: null,
    // New firmware: has explicit filament load (M628 S1), track XY-only tower E
    hasExplicitFilamentLoad: false,
    wipeTowerExtrusionXYMm: 0,
    wipeTowerCompensateMm: 0,
    // Thumbnails (base64)
    thumbnails: [],
  };

  let inThumbnail = false;
  let thumbnailData = '';
  let thumbnailSize = '';
  let currentLayer = -1;
  let currentTool = 0;
  let currentZ = 0;
  // Flush/purge & wipe tower tracking
  let inFlush = false;
  let inWipeTower = false;
  let inFilamentLoad = false; // between M628 S1 and M629 S1 (new firmware explicit load)

  // Key-value comment patterns from Bambu slicer
  const kvPatterns = {
    printerModel: /^;\s*printer_model\s*=\s*(.+)/i,
    nozzleDiameter: /^;\s*nozzle_diameter\s*=\s*(.+)/i,
    printProfile: /^;\s*print_settings_id\s*=\s*(.+)/i,
    layerHeight: /^;\s*layer_height\s*=\s*(.+)/i,
    firstLayerHeight: /^;\s*(?:first_layer_height|initial_layer_print_height)\s*=\s*(.+)/i,
    totalLayers: /^;\s*total\s*layer\s*num(?:ber)?\s*=\s*(\d+)/i,
    wallLoops: /^;\s*(?:wall_loops|perimeters)\s*=\s*(\d+)/i,
    topShellLayers: /^;\s*(?:top_shell_layers|top_solid_layers)\s*=\s*(\d+)/i,
    bottomShellLayers: /^;\s*(?:bottom_shell_layers|bottom_solid_layers)\s*=\s*(\d+)/i,
    infillDensity: /^;\s*(?:sparse_infill_density|fill_density)\s*=\s*(.+)/i,
    infillPattern: /^;\s*(?:sparse_infill_pattern|fill_pattern)\s*=\s*(.+)/i,
    supportEnabled: /^;\s*(?:enable_support|support_material)\s*=\s*(.+)/i,
    supportType: /^;\s*(?:support_type|support_material_style)\s*=\s*(.+)/i,
    nozzleTemp: /^;\s*(?:nozzle_temperature\s*=|temperature\s*=)\s*(.+)/i,
    nozzleTempInitial: /^;\s*(?:nozzle_temperature_initial_layer|first_layer_temperature)\s*=\s*(.+)/i,
    bedTemp: /^;\s*(?:bed_temperature\s*=|hot_plate_temp\s*=)\s*(.+)/i,
    bedTempInitial: /^;\s*(?:bed_temperature_initial_layer|hot_plate_temp_initial_layer|first_layer_bed_temperature)\s*=\s*(.+)/i,
    chamberTemp: /^;\s*chamber_temperature\s*=\s*(.+)/i,
    outerWallSpeed: /^;\s*(?:outer_wall_speed|external_perimeter_speed)\s*=\s*(.+)/i,
    innerWallSpeed: /^;\s*(?:inner_wall_speed|perimeter_speed)\s*=\s*(.+)/i,
    infillSpeed: /^;\s*(?:sparse_infill_speed|infill_speed)\s*=\s*(.+)/i,
    topSurfaceSpeed: /^;\s*(?:top_surface_speed|top_solid_infill_speed)\s*=\s*(.+)/i,
    travelSpeed: /^;\s*(?:travel_speed)\s*=\s*(.+)/i,
    firstLayerSpeed: /^;\s*(?:initial_layer_speed|first_layer_speed)\s*=\s*(.+)/i,
  };

  // Filament usage patterns (supports both `=` and `:` separators)
  const filamentUsedGPattern = /^;\s*total\s*filament\s*(?:used\s*)?\[g\]\s*[:=]\s*(.+)/i;
  const filamentUsedMmPattern = /^;\s*total\s*filament\s*(?:used\s*)?\[mm?\]\s*[:=]\s*(.+)/i;
  const filamentUsedGAlt = /^;\s*(?:total\s*)?filament\s*(?:used\s*)?\[g\]\s*[:=]\s*(.+)/i;
  const filamentUsedMmAlt = /^;\s*(?:total\s*)?filament\s*(?:used\s*)?\[mm?\]\s*[:=]\s*(.+)/i;

  // Bambu header patterns (colon-separated, in HEADER_BLOCK)
  const bambuHeaderTotalLayers = /^;\s*total\s*layer\s*number\s*:\s*(\d+)/i;
  const bambuHeaderFilamentWeight = /^;\s*total\s*filament\s*weight\s*\[g\]\s*:\s*(.+)/i;
  const bambuHeaderFilamentLength = /^;\s*total\s*filament\s*length\s*\[mm\]\s*:\s*(.+)/i;
  const bambuHeaderMaxZ = /^;\s*max_z_height\s*:\s*(.+)/i;

  // Filament info per extruder
  const filamentTypePattern = /^;\s*filament_type\s*=\s*(.+)/i;
  const filamentColorPattern = /^;\s*(?:filament_colour|filament_color)\s*=\s*(.+)/i;

  // Flush/waste config patterns
  const filamentDiameterPattern = /^;\s*filament_diameter\s*=\s*(.+)/i;
  const filamentDensityPattern = /^;\s*filament_density\s*=\s*(.+)/i;
  const flushMultiplierPattern = /^;\s*flush_multiplier\s*=\s*(.+)/i;
  const flushVolumesMatrixPattern = /^;\s*flush_volumes_matrix\s*=\s*(.+)/i;
  const flushIntoInfillPattern = /^;\s*flush_into_infill\s*=\s*(.+)/i;
  const flushIntoSupportPattern = /^;\s*flush_into_support\s*=\s*(.+)/i;

  // Estimated time (supports `= value`, `: value`, and Bambu combined header)
  const timePattern = /^;\s*(?:estimated\s*printing\s*time|total\s*estimated\s*time)[^:=]*[:=]\s*(.+)/i;
  const timePatternAlt = /^;\s*TIME:\s*(\d+)/i;
  // Bambu header: "; model printing time: Xh Ym Zs; total estimated time: Xh Ym Zs"
  const bambuTimePattern = /^;\s*model\s*printing\s*time\s*:\s*(.+?);\s*total\s*estimated\s*time\s*:\s*(.+)/i;

  // Thumbnail patterns (Bambu uses base64 encoded PNG thumbnails in comments)
  const thumbnailBegin = /^;\s*thumbnail\s+begin\s+(\d+x\d+)\s+/i;
  const thumbnailEnd = /^;\s*thumbnail\s+end/i;

  // Layer change pattern (Bambu style)
  const layerChangePattern = /^;\s*(?:CHANGE_LAYER|LAYER_CHANGE|Z_HEIGHT:)/i;
  const layerCommentPattern = /^;\s*layer\s+(\d+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Thumbnail extraction
    if (thumbnailBegin.test(line)) {
      inThumbnail = true;
      thumbnailData = '';
      thumbnailSize = line.match(thumbnailBegin)[1];
      continue;
    }
    if (inThumbnail) {
      if (thumbnailEnd.test(line)) {
        inThumbnail = false;
        stats.thumbnails.push({ size: thumbnailSize, data: thumbnailData });
      } else {
        // Strip leading '; ' from thumbnail data lines
        thumbnailData += line.replace(/^;\s*/, '');
      }
      continue;
    }

    // Comment lines with metadata
    if (line.startsWith(';')) {
      // Key-value pairs
      for (const [key, pattern] of Object.entries(kvPatterns)) {
        const match = line.match(pattern);
        if (match) {
          const val = match[1].trim();
          if (stats[key] === null) {
            stats[key] = val;
          }
        }
      }

      // Filament usage
      let match;
      if ((match = line.match(filamentUsedGPattern))) {
        stats.totalFilamentUsedG = match[1].trim();
      } else if ((match = line.match(filamentUsedGAlt))) {
        if (!stats.totalFilamentUsedG) {
          stats.totalFilamentUsedG = match[1].trim();
        }
        // Per-tool
        const vals = match[1].trim().split(/[,;]\s*/);
        vals.forEach((v, idx) => {
          const g = parseFloat(v);
          if (!isNaN(g) && g > 0) stats.filamentWeightPerTool[idx] = g;
        });
      }
      if ((match = line.match(filamentUsedMmPattern))) {
        stats.totalFilamentUsedMm = match[1].trim();
      } else if ((match = line.match(filamentUsedMmAlt))) {
        if (!stats.totalFilamentUsedMm) {
          stats.totalFilamentUsedMm = match[1].trim();
        }
        const vals = match[1].trim().split(/[,;]\s*/);
        vals.forEach((v, idx) => {
          const mm = parseFloat(v);
          if (!isNaN(mm) && mm > 0) stats.filamentPerTool[idx] = mm;
        });
      }

      // Filament type/color (can be comma-separated for multi-tool)
      if ((match = line.match(filamentTypePattern))) {
        const types = match[1].trim().split(/[,;]\s*/);
        types.forEach((t, idx) => {
          if (t) stats.filamentTypePerTool[idx] = t;
        });
      }
      if ((match = line.match(filamentColorPattern))) {
        const colors = match[1].trim().split(/[,;]\s*/);
        colors.forEach((c, idx) => {
          if (c) stats.filamentColorPerTool[idx] = c;
        });
      }

      // Flush/waste config
      if ((match = line.match(filamentDiameterPattern))) {
        stats.filamentDiameter = parseFloat(match[1].trim().split(/[,;]/)[0]) || 1.75;
      }
      if ((match = line.match(filamentDensityPattern))) {
        stats.filamentDensity = match[1].trim().split(/[,;]/)[0].trim();
      }
      if ((match = line.match(flushMultiplierPattern))) {
        stats.flushMultiplier = match[1].trim();
      }
      if ((match = line.match(flushVolumesMatrixPattern))) {
        stats.flushVolumesMatrix = match[1].trim();
      }
      if ((match = line.match(flushIntoInfillPattern))) {
        stats.flushIntoInfill = match[1].trim();
      }
      if ((match = line.match(flushIntoSupportPattern))) {
        stats.flushIntoSupport = match[1].trim();
      }

      // Flush/wipe tower block markers
      if (line === '; FLUSH_START') { inFlush = true; continue; }
      if (line === '; FLUSH_END') { inFlush = false; stats.flushCount++; continue; }
      if (line === '; WIPE_TOWER_START') { inWipeTower = true; continue; }
      if (line === '; WIPE_TOWER_END') { inWipeTower = false; stats.wipeTowerCount++; continue; }

      // Bambu header patterns (colon-separated)
      if ((match = line.match(bambuHeaderTotalLayers))) {
        if (!stats.totalLayers) stats.totalLayers = match[1].trim();
      }
      if ((match = line.match(bambuHeaderFilamentWeight))) {
        if (!stats.totalFilamentUsedG) {
          const vals = match[1].trim().split(/[,;]\s*/);
          const total = vals.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
          stats.totalFilamentUsedG = total.toFixed(2);
          vals.forEach((v, idx) => {
            const g = parseFloat(v);
            if (!isNaN(g) && g > 0) stats.filamentWeightPerTool[idx] = g;
          });
        }
      }
      if ((match = line.match(bambuHeaderFilamentLength))) {
        if (!stats.totalFilamentUsedMm) {
          const vals = match[1].trim().split(/[,;]\s*/);
          const total = vals.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
          stats.totalFilamentUsedMm = total.toFixed(2);
          vals.forEach((v, idx) => {
            const mm = parseFloat(v);
            if (!isNaN(mm) && mm > 0) stats.filamentPerTool[idx] = mm;
          });
        }
      }

      // Time
      if ((match = line.match(bambuTimePattern))) {
        // Bambu combined: model time + total time
        if (!stats.estimatedTime) {
          stats.estimatedTime = match[2].trim();
          stats.estimatedTimeSeconds = parseTimeToSeconds(match[2].trim());
          stats.modelPrintingTime = match[1].trim();
        }
      } else if ((match = line.match(timePattern))) {
        if (!stats.estimatedTime) {
          stats.estimatedTime = match[1].trim();
          stats.estimatedTimeSeconds = parseTimeToSeconds(match[1].trim());
        }
      } else if ((match = line.match(timePatternAlt))) {
        if (!stats.estimatedTimeSeconds) {
          stats.estimatedTimeSeconds = parseInt(match[1]);
          stats.estimatedTime = formatSeconds(parseInt(match[1]));
        }
      }

      // Layer changes
      if (layerChangePattern.test(line)) {
        currentLayer++;
      }
      if ((match = line.match(layerCommentPattern))) {
        currentLayer = parseInt(match[1]);
      }

      continue;
    }

    // Track M628 S1 / M629 S1 (explicit filament load, new firmware)
    if (line === 'M628 S1') { inFilamentLoad = true; stats.hasExplicitFilamentLoad = true; continue; }
    if (line.startsWith('M629 S1')) { inFilamentLoad = false; continue; }

    // Extrusion tracking inside flush and wipe tower blocks.
    // FLUSH blocks are nested inside WIPE_TOWER blocks in Bambu gcode.
    // We track them separately: flush = purge volume, tower = tower-only (excl. flush).
    if (line.startsWith('G1 ')) {
      const eMatch = line.match(/E([\d.]+)/);
      if (eMatch) {
        const eVal = parseFloat(eMatch[1]);
        if (inFlush) {
          stats.flushExtrusionMm += eVal;
        } else if (inFilamentLoad) {
          // Skip: explicit filament load (E18 etc), not deposited on tower
        } else if (inWipeTower) {
          stats.wipeTowerExtrusionMm += eVal;
          // Also track E moves with XY (actual tower printing vs primes/compensation)
          if (/[XY]/.test(line)) {
            stats.wipeTowerExtrusionXYMm += eVal;
          }
          // Track compensation extrusion (ooze at nozzle wiper, not deposited on tower)
          if (line.includes('Compensate')) {
            stats.wipeTowerCompensateMm += eVal;
          }
        }
      }
    }

    if (!skipMovementParsing) {
      // G-code commands
      if (line.startsWith('G0 ') || line.startsWith('G1 ') || line.startsWith('G0;') || line.startsWith('G1;')) {
        // Extract coordinates
        const xMatch = line.match(/X([-\d.]+)/);
        const yMatch = line.match(/Y([-\d.]+)/);
        const zMatch = line.match(/Z([-\d.]+)/);
        if (xMatch) {
          const x = parseFloat(xMatch[1]);
          if (x > stats.maxX) stats.maxX = x;
          if (x < stats.minX) stats.minX = x;
        }
        if (yMatch) {
          const y = parseFloat(yMatch[1]);
          if (y > stats.maxY) stats.maxY = y;
          if (y < stats.minY) stats.minY = y;
        }
        if (zMatch) {
          const z = parseFloat(zMatch[1]);
          if (z > stats.maxZ) stats.maxZ = z;
          if (z < stats.minZ) stats.minZ = z;
          currentZ = z;
        }
      }

      // Retractions
      if (line.startsWith('G1 ') && line.match(/E-[\d.]+/)) {
        stats.retractCount++;
      }
    }

    // Tool changes
    const toolMatch = line.match(/^T(\d+)/);
    if (toolMatch) {
      const tool = parseInt(toolMatch[1]);
      if (tool !== currentTool) {
        stats.toolChanges++;
        stats.toolChangeList.push({ layer: currentLayer, from: currentTool, to: tool });
        currentTool = tool;
      }
    }
  }

  // Use totalLayers from comments, or from counted layers
  if (!stats.totalLayers && currentLayer >= 0) {
    stats.totalLayers = currentLayer + 1;
  }

  // Clean up nozzle diameter (take first value if comma-separated)
  if (stats.nozzleDiameter) {
    stats.nozzleDiameter = stats.nozzleDiameter.split(/[,;]/)[0].trim();
  }

  // Clean up print profile (remove quotes)
  if (stats.printProfile) {
    stats.printProfile = stats.printProfile.replace(/^["']|["']$/g, '');
  }

  // Build filaments summary
  const toolIndices = new Set([
    ...Object.keys(stats.filamentTypePerTool),
    ...Object.keys(stats.filamentColorPerTool),
    ...Object.keys(stats.filamentPerTool),
    ...Object.keys(stats.filamentWeightPerTool),
  ].map(Number));

  for (const idx of [...toolIndices].sort((a, b) => a - b)) {
    stats.filaments.push({
      index: idx,
      type: stats.filamentTypePerTool[idx] || null,
      color: stats.filamentColorPerTool[idx] || null,
      usedMm: stats.filamentPerTool[idx] || null,
      usedG: stats.filamentWeightPerTool[idx] || null,
    });
  }

  // Compute waste volumes and weights
  const filR = stats.filamentDiameter / 2;
  const filArea = Math.PI * filR * filR; // mm2
  const density = parseFloat(stats.filamentDensity) || 1.24; // g/cm3

  if (stats.flushExtrusionMm > 0) {
    stats.flushVolumeCm3 = Math.round(stats.flushExtrusionMm * filArea / 1000 * 100) / 100;
    stats.flushWeightG = Math.round(stats.flushVolumeCm3 * density * 100) / 100;
  }
  // For wipe tower waste:
  // - New firmware (hasExplicitFilamentLoad / M628 S1): use XY-only E (actual tower printing).
  //   The E-only moves include large filament loads + compensation, not deposited on tower.
  // - Old firmware: use all tower E minus compensation (E6 ooze at nozzle wiper position).
  const towerMm = stats.hasExplicitFilamentLoad
    ? stats.wipeTowerExtrusionXYMm
    : stats.wipeTowerExtrusionMm - stats.wipeTowerCompensateMm;
  if (towerMm > 0) {
    stats.wipeTowerVolumeCm3 = Math.round(towerMm * filArea / 1000 * 100) / 100;
    stats.wipeTowerWeightG = Math.round(stats.wipeTowerVolumeCm3 * density * 100) / 100;
  }
  // Total waste
  const totalWasteMm = stats.flushExtrusionMm + towerMm;
  if (totalWasteMm > 0) {
    stats.totalWasteVolumeCm3 = Math.round(totalWasteMm * filArea / 1000 * 100) / 100;
    stats.totalWasteWeightG = Math.round(stats.totalWasteVolumeCm3 * density * 100) / 100;
  }

  // Compute bounding box dimensions
  if (stats.maxX !== -Infinity) {
    stats.sizeX = Math.round((stats.maxX - stats.minX) * 100) / 100;
    stats.sizeY = Math.round((stats.maxY - stats.minY) * 100) / 100;
    stats.sizeZ = Math.round((stats.maxZ - stats.minZ) * 100) / 100;
  }

  return stats;
}

function parseTimeToSeconds(timeStr) {
  // Handles formats like "1h 23m 45s", "1h23m45s", "01:23:45", "5400"
  let seconds = 0;
  const hmsMatch = timeStr.match(/(\d+)\s*h/i);
  const mMatch = timeStr.match(/(\d+)\s*m(?:in)?/i);
  const sMatch = timeStr.match(/(\d+)\s*s/i);

  if (hmsMatch || mMatch || sMatch) {
    if (hmsMatch) seconds += parseInt(hmsMatch[1]) * 3600;
    if (mMatch) seconds += parseInt(mMatch[1]) * 60;
    if (sMatch) seconds += parseInt(sMatch[1]);
    return seconds;
  }

  const colonMatch = timeStr.match(/(\d+):(\d+):(\d+)/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 3600 + parseInt(colonMatch[2]) * 60 + parseInt(colonMatch[3]);
  }

  const numOnly = parseInt(timeStr);
  if (!isNaN(numOnly)) return numOnly;

  return null;
}

function formatSeconds(totalSeconds) {
  if (!totalSeconds) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}