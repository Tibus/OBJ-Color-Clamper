// ============================================================================
// File Handling
// ============================================================================

const SUPPORTED_EXTENSIONS = ['.obj', '.stl', '.glb'];

function isSupportedFile(filename) {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function getFileType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.obj')) return 'obj';
  if (lower.endsWith('.stl')) return 'stl';
  if (lower.endsWith('.glb')) return 'glb';
  return null;
}

function initFileHandling() {
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());

  elements.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    elements.dropZone.classList.add('dragover');
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('dragover');
  });

  elements.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && isSupportedFile(file.name)) {
      handleFile(file);
    }
  });

  elements.fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  loadedFile = file;
  loadedFileType = getFileType(file.name);
  elements.fileName.textContent = file.name;

  // Clear previous viewer
  clearViewer();
  parsedModelData = null;

  console.log("loadedFileType", loadedFileType);

  if (loadedFileType === 'obj') {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      const lines = content.split('\n');
      const vertexCount = lines.filter(l => l.trim().startsWith('v ')).length;
      const faceCount = lines.filter(l => l.trim().startsWith('f ')).length;
      elements.fileStats.textContent = `${vertexCount.toLocaleString()} vertices, ${faceCount.toLocaleString()} faces`;
      elements.fileInfo.classList.add('show');
      elements.processBtn.disabled = false;

      // Parse and load into 3D viewer
      try {
        const parsed = parseOBJ(content);
        parsedModelData = {
          vertices: parsed.vertices,
          faces: parsed.faces,
          vertexLineIndices: parsed.vertexLineIndices,
          originalLines: parsed.originalLines
        };
        loadModelToViewer(parsed.vertices, parsed.faces);
        initColorPicker();
      } catch (err) {
        console.error('Error parsing OBJ for viewer:', err);
      }
    };
    reader.readAsText(file);
  } else if (loadedFileType === 'stl') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buffer = e.target.result;
        const dataView = new DataView(buffer);
        const triangleCount = dataView.getUint32(80, true);
        elements.fileStats.textContent = `${triangleCount.toLocaleString()} triangles (STL)`;
        elements.fileInfo.classList.add('show');
        elements.processBtn.disabled = false;

        // Parse and load into 3D viewer
        try {
          const parsed = parseSTL(buffer);
          parsedModelData = {
            vertices: parsed.vertices,
            faces: parsed.faces
          };
          loadModelToViewer(parsed.vertices, parsed.faces);
          initColorPicker();
        } catch (err) {
          console.error('Error parsing STL for viewer:', err);
        }
      } catch (err) {
        elements.fileStats.textContent = 'Error reading STL file';
        elements.fileInfo.classList.add('show');
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (loadedFileType === 'glb') {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const buffer = e.target.result;
        const dataView = new DataView(buffer);
        const magic = dataView.getUint32(0, true);
        if (magic === 0x46546C67) {
          elements.fileStats.textContent = `GLB file (textures will be baked to vertex colors)`;
          elements.fileInfo.classList.add('show');
          elements.processBtn.disabled = false;

          // Parse and load into 3D viewer
          try {
            const parsed = await parseGLB(buffer);
            parsedModelData = {
              vertices: parsed.vertices,
              faces: parsed.faces,
              texture: parsed.texture
            };
            loadModelToViewer(parsed.vertices, parsed.faces);
            initColorPicker();
          } catch (err) {
            console.error('Error parsing GLB for viewer:', err);
          }
        } else {
          elements.fileStats.textContent = 'Invalid GLB file';
          elements.fileInfo.classList.add('show');
        }
      } catch (err) {
        elements.fileStats.textContent = 'Error reading GLB file';
        elements.fileInfo.classList.add('show');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}
