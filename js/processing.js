// ============================================================================
// Main Processing
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processFile() {
  const numColors = parseInt(document.getElementById('numColors').value);
  const threshold = parseInt(document.getElementById('islandThreshold').value);

  clearLog();
  elements.progressContainer.classList.add('show');
  elements.resultsCard.classList.remove('show');
  elements.logCard.classList.remove('show');
  elements.processBtn.disabled = true;

  // Reset textures
  originalTexture = null;
  clampedTexture = null;
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
        vertices = parsed.vertices;
        faces = parsed.faces;
        vertexLineIndices = null;
        originalLines = null;

        // Store original texture for preview
        originalTexture = parsed.texture;

        log('Baking textures to vertex colors...', 'info');
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

      updateProgress(30, 'Selecting colors...');
      log('\nSelecting best colors...', 'info');
      await sleep(20);
      const palette = selectBestColors(colors, COLOR_POOL, numColors);

      log('\nSelected palette:', 'highlight');
      palette.forEach((c, i) => log(`  ${i + 1}. ${c.name} ${c.toHex()}`));

      updateProgress(50, 'Remapping colors...');
      await sleep(20);
      remapColors(vertices, palette);

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

      // Generate clamped texture preview for GLB
      if (loadedFileType === 'glb' && originalTexture) {
        clampedTexture = generateClampedTexture(originalTexture, palette);
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
