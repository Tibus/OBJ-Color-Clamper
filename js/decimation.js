// ============================================================================
// Triangle Decimation via WASM (with Web Worker for non-blocking UI)
// ============================================================================

let decimationModule = null;
let decimationReady = false;

async function loadDecimationWasm() {
  if (decimationReady) return decimationModule;
  decimationModule = await DecimationModule();
  decimationReady = true;
  return decimationModule;
}

async function decimateMeshWasm(module, vertices, triangles, targetCount, tolerance, preserveColorBorders) {
  const numVerts = vertices.length;
  const numTris = triangles.length;

  // Pack vertices: [x, y, z, r, g, b] per vertex
  const vertexData = new Float32Array(numVerts * 6);
  for (let i = 0; i < numVerts; i++) {
    const v = vertices[i];
    vertexData[i * 6 + 0] = v.x;
    vertexData[i * 6 + 1] = v.y;
    vertexData[i * 6 + 2] = v.z;
    const c = v.color;
    vertexData[i * 6 + 3] = c ? c.r : 0.5;
    vertexData[i * 6 + 4] = c ? c.g : 0.5;
    vertexData[i * 6 + 5] = c ? c.b : 0.5;
  }

  // Pack faces: [i0, i1, i2] per triangle
  const faceData = new Int32Array(numTris * 3);
  for (let i = 0; i < numTris; i++) {
    faceData[i * 3 + 0] = triangles[i][0];
    faceData[i * 3 + 1] = triangles[i][1];
    faceData[i * 3 + 2] = triangles[i][2];
  }

  // Allocate WASM memory
  const vertBytes = vertexData.byteLength;
  const faceBytes = faceData.byteLength;
  const vertPtr = module._malloc(vertBytes);
  const facePtr = module._malloc(faceBytes);

  // Copy data into WASM heap
  module.HEAPF32.set(vertexData, vertPtr >> 2);
  module.HEAP32.set(faceData, facePtr >> 2);

  // Call decimation (async with ASYNCIFY - yields to browser for progress updates)
  await module.ccall('decimate', null,
    ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [vertPtr, numVerts, facePtr, numTris, targetCount, tolerance, preserveColorBorders ? 1 : 0],
    { async: true });

  // Free input buffers
  module._free(vertPtr);
  module._free(facePtr);

  // Read output
  const outVertCount = module._getOutputVertexCount();
  const outFaceCount = module._getOutputFaceCount();
  const outVertPtr = module._getOutputVertices();
  const outFacePtr = module._getOutputFaces();

  // Build color name map from input vertices for name preservation
  const colorNameMap = new Map();
  for (const v of vertices) {
    if (v.color && v.color.name) {
      const key = `${v.color.r.toFixed(4)},${v.color.g.toFixed(4)},${v.color.b.toFixed(4)}`;
      if (!colorNameMap.has(key)) colorNameMap.set(key, v.color.name);
    }
  }

  // Read output vertices (6 floats each: x,y,z,r,g,b)
  const outVerts = [];
  for (let i = 0; i < outVertCount; i++) {
    const base = (outVertPtr >> 2) + i * 6;
    const r = module.HEAPF32[base + 3];
    const g = module.HEAPF32[base + 4];
    const b = module.HEAPF32[base + 5];
    const key = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`;
    const name = colorNameMap.get(key) || null;
    outVerts.push({
      x: module.HEAPF32[base + 0],
      y: module.HEAPF32[base + 1],
      z: module.HEAPF32[base + 2],
      color: new Color(r, g, b, name)
    });
  }

  // Read output faces (3 ints each)
  const outFaces = [];
  for (let i = 0; i < outFaceCount; i++) {
    const base = (outFacePtr >> 2) + i * 3;
    outFaces.push([
      module.HEAP32[base + 0],
      module.HEAP32[base + 1],
      module.HEAP32[base + 2]
    ]);
  }

  return { vertices: outVerts, faces: outFaces };
}

// ============================================================================
// Decimation Processing (called from UI)
// ============================================================================

async function processDecimation() {
  const isAutoMode = decimationMode === 'auto';
  const targetPercent = parseInt(document.getElementById('targetTriangles').value) || 50;
  const tolerance = Math.pow(10, parseFloat(document.getElementById('decimTolerance').value)) || 0.01;
  const preserveBorders = document.getElementById('preserveColorBorders').checked;

  if (!parsedModelData) return;

  const { vertices, faces } = parsedModelData;

  // Triangulate faces
  const allTris = [];
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) {
      allTris.push([face[0], face[i], face[i + 1]]);
    }
  }

  // targetCount = 0 triggers auto mode in WASM (tolerance-based stopping)
  const targetCount = isAutoMode ? 0 : Math.max(4, Math.floor(allTris.length * targetPercent / 100));

  if (isAutoMode) {
    log(`Starting WASM decimation (auto): ${allTris.length} triangles, tolerance ${tolerance}`);
  } else {
    log(`Starting WASM decimation: ${allTris.length} triangles -> target ${targetCount}`);
  }
  log(`Tolerance: ${tolerance}, Preserve color borders: ${preserveBorders}`);

  elements.progressContainer.classList.add('show');
  updateProgress(5, 'Loading WASM module...');
  await sleep(50);

  try {
    const module = await loadDecimationWasm();
    updateProgress(10, 'Decimating mesh...');
    await sleep(10);

    const t0 = performance.now();

    // Start progress polling (WASM updates progressValue 0.0-1.0 via emscripten_sleep)
    const progressInterval = setInterval(() => {
      const p = module._getProgress(); // 0.0 to 1.0
      if (p > 0) {
        const percent = Math.round(p * 100);
        const uiProgress = 10 + Math.floor(p * 85); // map 0.0-1.0 to 10-95
        updateProgress(uiProgress, `Decimating mesh... ${percent}%`);
      }
    }, 100);

    const result = await decimateMeshWasm(module, vertices, allTris,
                                    targetCount, tolerance, preserveBorders);

    clearInterval(progressInterval);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    updateProgress(95, 'Building result...');
    await sleep(50);

    const reduction = ((1 - result.faces.length / allTris.length) * 100).toFixed(1);
    log(`Done in ${elapsed}s: ${allTris.length} -> ${result.faces.length} triangles (${reduction}% reduction)`, 'success');
    log(`Vertices: ${vertices.length} -> ${result.vertices.length}`, 'info');

    // Store for export
    processedData = { vertices: result.vertices, faces: result.faces };
    processedOBJ = generateOBJFromData(result.vertices, result.faces);

    // Build finalPalette from unique vertex colors (needed for 3MF export)
    const colorSet = new Map();
    for (const v of result.vertices) {
      if (v.color && v.color.name && !colorSet.has(v.color.name)) {
        colorSet.set(v.color.name, v.color);
      }
    }
    finalPalette = [];
    for (const [name, color] of colorSet) {
      finalPalette.push({ color, mmuIndex: finalPalette.length + 1 });
    }

    // Display stats
    displayDecimationResults(allTris.length, result.faces.length, vertices.length, result.vertices.length);

    // Show result in viewer
    const resultViewerCard = document.getElementById('resultViewerCard');
    if (resultViewerCard) {
      resultViewerCard.classList.add('show');
      loadResultToViewer(result.vertices, result.faces);
    }

    updateProgress(100, 'Complete');
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    console.error(err);
    updateProgress(0, 'Failed');
  }
}

function displayDecimationResults(origTris, newTris, origVerts, newVerts) {
  const statsGrid = elements.statsGrid;
  if (!statsGrid) return;
  statsGrid.innerHTML = '';

  const reduction = ((1 - newTris / origTris) * 100).toFixed(1);

  const stats = [
    { label: 'Original Triangles', value: origTris.toLocaleString() },
    { label: 'Reduced Triangles', value: newTris.toLocaleString() },
    { label: 'Original Vertices', value: origVerts.toLocaleString() },
    { label: 'Reduced Vertices', value: newVerts.toLocaleString() },
    { label: 'Reduction', value: reduction + '%' },
  ];

  stats.forEach(stat => {
    const div = document.createElement('div');
    div.className = 'stat-item';
    div.innerHTML = `
      <div class="name">${stat.label}</div>
      <div class="count" style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">${stat.value}</div>
    `;
    statsGrid.appendChild(div);
  });

  elements.resultsCard.classList.add('show');
  elements.logCard.classList.add('show');
}

// ============================================================================
// Decimator UI
// ============================================================================

let decimationMode = 'target'; // 'target' or 'auto'

function initDecimatorUI() {
  const targetSlider = document.getElementById('targetTriangles');
  const targetValue = document.getElementById('targetTrianglesValue');
  const tolSlider = document.getElementById('decimTolerance');
  const tolValue = document.getElementById('decimToleranceValue');
  const targetGroup = document.getElementById('targetGroup');
  const toleranceHelp = document.getElementById('toleranceHelp');

  // Mode selector
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      decimationMode = btn.dataset.mode;

      if (decimationMode === 'auto') {
        if (targetGroup) targetGroup.style.display = 'none';
        if (toleranceHelp) toleranceHelp.textContent = 'Lower = preserve more detail, higher = more aggressive reduction';
      } else {
        if (targetGroup) targetGroup.style.display = '';
        if (toleranceHelp) toleranceHelp.textContent = 'Maximum geometric error allowed';
      }
    });
  });

  if (targetSlider && targetValue) {
    targetSlider.addEventListener('input', () => {
      targetValue.textContent = targetSlider.value + '%';
    });
  }

  if (tolSlider && tolValue) {
    tolSlider.addEventListener('input', () => {
      const val = Math.pow(10, parseFloat(tolSlider.value));
      tolValue.textContent = val.toFixed(val < 0.01 ? 4 : val < 0.1 ? 3 : 2);
    });
    // Set initial display
    const initVal = Math.pow(10, parseFloat(tolSlider.value));
    tolValue.textContent = initVal.toFixed(initVal < 0.01 ? 4 : initVal < 0.1 ? 3 : 2);
  }

  // Pre-load WASM module
  loadDecimationWasm().catch(err => console.warn('WASM preload failed:', err));
}
