// ============================================================================
// Main Processing
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processOBJ() {
  const numColors = parseInt(document.getElementById('numColors').value);
  const threshold = parseInt(document.getElementById('islandThreshold').value);

  clearLog();
  elements.progressContainer.classList.add('show');
  elements.resultsCard.classList.remove('show');
  elements.logCard.classList.remove('show');
  elements.processBtn.disabled = true;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      updateProgress(10, 'Parsing OBJ...');
      log('Parsing OBJ file...', 'info');
      await sleep(20);

      const { vertices, vertexLineIndices, originalLines, faces } = parseOBJ(e.target.result);
      log(`  ${vertices.length} vertices, ${faces.length} faces`);

      updateProgress(20, 'Building graphs...');
      const vertexAdjacency = buildVertexAdjacency(vertices.length, faces);

      const colors = vertices.filter(v => v.color).map(v => v.color);
      if (!colors.length) {
        log('\nNo vertex colors found!', 'error');
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
      processedOBJ = exportOBJContent(vertices, originalLines, vertexLineIndices);
      processedData = { vertices, faces };

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
  reader.readAsText(loadedFile);
}
