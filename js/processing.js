// ============================================================================
// Main Processing
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processFile() {
  const numColors = parseInt(document.getElementById('numColors').value);
  const threshold = parseInt(document.getElementById('islandThreshold').value);
  const useColorPool = document.getElementById('useColorPool').checked;
  const usePickedToggle = document.getElementById('usePickedColorsToggle');
  const usePickedColors = usePickedToggle && usePickedToggle.checked;
  const userPickedColors = getPickedColors();

  // const useGreedy = document.getElementById('algorithm').value === 'greedy';

  clearLog();
  elements.progressContainer.classList.add('show');
  elements.resultsCard.classList.remove('show');
  elements.logCard.classList.remove('show');
  elements.processBtn.disabled = true;

  // Hide result viewer
  const resultViewerCard = document.getElementById('resultViewerCard');
  if (resultViewerCard) {
    resultViewerCard.classList.remove('show');
  }
  clearResultViewer();

  // Reset textures and GLB palette
  originalTexture = null;
  clampedTexture = null;
  glbExtractedPalette = null;
  hideTexturePreview();

  const reader = new FileReader();

  reader.onload = async e => {
    try {
      let vertices, faces, vertexLineIndices, originalLines;

      if (loadedFileType === 'obj') {
        updateProgress(10, 'Parsing OBJ...');
        log('Parsing OBJ file...', 'info');
        await sleep(20);

        const parsed = parseOBJ(e.target.result);
        vertices = parsed.vertices;
        faces = parsed.faces;
        vertexLineIndices = parsed.vertexLineIndices;
        originalLines = parsed.originalLines;

      } else if (loadedFileType === 'stl') {
        updateProgress(10, 'Parsing STL...');
        log('Parsing STL file...', 'info');
        await sleep(20);

        const parsed = parseSTL(e.target.result);
        vertices = parsed.vertices;
        faces = parsed.faces;
        vertexLineIndices = null;
        originalLines = null;

      } else if (loadedFileType === 'glb') {
        updateProgress(5, 'Parsing GLB...');
        log('Parsing GLB file...', 'info');
        await sleep(20);

        updateProgress(8, 'Extracting textures...');
        log('Extracting textures...', 'info');

        const parsed = await parseGLB(e.target.result);

        // Store original texture for preview
        originalTexture = parsed.texture;

        // Pre-quantize texture to target number of colors
        if (parsed.texture) {
          updateProgress(12, 'Quantizing texture...');
          await sleep(20);

          const { quantizedTexture, extractedPalette } = preprocessGLBTexture(parsed.texture, numColors, useColorPool);

          // Re-bake vertex colors using quantized texture
          log('Baking quantized texture to vertex colors...', 'info');
          for (const vertex of parsed.vertices) {
            if (vertex.uv && quantizedTexture) {
              vertex.color = sampleTexture(quantizedTexture, vertex.uv[0], 1 - vertex.uv[1]);
            }
          }

          // Store quantized palette for later use
          glbExtractedPalette = extractedPalette;
          clampedTexture = quantizedTexture;
        }

        vertices = parsed.vertices;
        faces = parsed.faces;
        vertexLineIndices = null;
        originalLines = null;
      }

      log(`  ${vertices.length} vertices, ${faces.length} faces`);

      updateProgress(20, 'Building graphs...');
      const vertexAdjacency = buildVertexAdjacency(vertices.length, faces);

      const colors = vertices.filter(v => v.color).map(v => v.color);
      if (!colors.length) {
        log('\nNo vertex colors found!', 'error');
        elements.processBtn.disabled = false;
        return;
      }

      let palette;

      // For GLB with pre-quantized texture, use extracted palette
      if (loadedFileType === 'glb' && glbExtractedPalette && glbExtractedPalette.length > 0) {
        updateProgress(30, 'Using extracted palette...');
        log('\nUsing colors extracted from texture:', 'highlight');
        palette = glbExtractedPalette;
        palette.forEach((c, i) => log(`  ${i + 1}. ${c.toHex()}`));

        // Colors are already baked from quantized texture, just need to ensure they match palette exactly
        updateProgress(50, 'Finalizing vertex colors...');
        await sleep(20);
        remapColors(vertices, palette);
      } else {
        // Priority 1: User-picked colors
        if (usePickedColors && userPickedColors.length > 0) {
          updateProgress(40, 'Using picked colors...');
          await sleep(20);
          // Use picked colors, limited to numColors
          palette = userPickedColors.slice(0, numColors);
          log('\nUsing user-picked colors:', 'highlight');
          palette.forEach((c, i) => log(`  ${i + 1}. ${c.name} ${c.toHex()}`));
        }
        // Priority 2: COLOR_POOL (filament colors)
        else if (useColorPool) {
          // For OBJ/STL, select from COLOR_POOL
          updateProgress(40, 'Matching to filament colors...');
          await sleep(20);
          palette = selectBestColorsFrequency(colors, COLOR_POOL, numColors);

          log('\nSelected palette:', 'highlight');
          palette.forEach((c, i) => log(`  ${i + 1}. ${c.name} ${c.toHex()}`));
        }
        // Priority 3: K-means extraction
        else {
          const extractedColors = selectBestColorsFrequencyNoPool(colors, numColors);
          // Use extracted colors directly
          log('\nUsing extracted colors directly:', 'highlight');
          palette = extractedColors;
          palette.forEach((c, i) => log(`  ${i + 1}. ${c.toHex()}`));
        }

        updateProgress(50, 'Remapping colors...');
        await sleep(20);
        remapColors(vertices, palette);
      }

      updateProgress(60, 'Merging vertex islands...');
      log('\nMerging small islands...', 'info');
      await sleep(20);
      mergeSmallIslands(vertices, vertexAdjacency, threshold, palette);

      updateProgress(80, 'Merging face islands...');
      await sleep(20);
      const faceAdjacency = buildFaceAdjacency(faces);
      mergeIsolatedFaces(vertices, faces, faceAdjacency, Math.max(2, Math.ceil(threshold / 3)), palette);

      updateProgress(90, 'Generating output...');
      await sleep(20);

      // Generate OBJ content
      if (loadedFileType === 'obj') {
        processedOBJ = exportOBJContent(vertices, originalLines, vertexLineIndices);
      } else {
        // For STL/GLB, generate new OBJ from scratch
        processedOBJ = generateOBJFromData(vertices, faces);
      }
      processedData = { vertices, faces };

      // Display texture preview for GLB (texture already quantized during loading)
      if (loadedFileType === 'glb' && originalTexture && clampedTexture) {
        displayTexturePreview(originalTexture, clampedTexture);
      }

      const finalStats = {};
      palette.forEach(c => finalStats[c.name] = 0);
      for (const v of vertices) {
        if (v.color) finalStats[v.color.name]++;
      }

      log('\nFinal distribution:', 'highlight');
      for (const [name, count] of Object.entries(finalStats)) {
        if (count) log(`  ${name}: ${count} vertices`);
      }

      updateProgress(100, 'Done!');
      log('\n✓ Processing complete!', 'success');
      displayResults(palette, finalStats);

      // Load result into 3D viewer
      const resultViewerCard = document.getElementById('resultViewerCard');
      if (resultViewerCard) {
        resultViewerCard.classList.add('show');
      }
      loadResultToViewer(vertices, faces);
    } catch (err) {
      log(`\nError: ${err.message}`, 'error');
      console.error(err);
    }
    elements.processBtn.disabled = false;
  };

  // Read file with appropriate method
  if (loadedFileType === 'obj') {
    reader.readAsText(loadedFile);
  } else {
    reader.readAsArrayBuffer(loadedFile);
  }
}

// Alias for backward compatibility
const processOBJ = processFile;
