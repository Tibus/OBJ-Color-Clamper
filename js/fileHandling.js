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

  if (loadedFileType === 'obj') {
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split('\n');
      const vertexCount = lines.filter(l => l.trim().startsWith('v ')).length;
      const faceCount = lines.filter(l => l.trim().startsWith('f ')).length;
      elements.fileStats.textContent = `${vertexCount.toLocaleString()} vertices, ${faceCount.toLocaleString()} faces`;
      elements.fileInfo.classList.add('show');
      elements.processBtn.disabled = false;
    };
    reader.readAsText(file);
  } else if (loadedFileType === 'stl') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const dataView = new DataView(e.target.result);
        const triangleCount = dataView.getUint32(80, true);
        elements.fileStats.textContent = `${triangleCount.toLocaleString()} triangles (STL)`;
        elements.fileInfo.classList.add('show');
        elements.processBtn.disabled = false;
      } catch (err) {
        elements.fileStats.textContent = 'Error reading STL file';
        elements.fileInfo.classList.add('show');
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (loadedFileType === 'glb') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const dataView = new DataView(e.target.result);
        const magic = dataView.getUint32(0, true);
        if (magic === 0x46546C67) {
          elements.fileStats.textContent = `GLB file (textures will be baked to vertex colors)`;
          elements.fileInfo.classList.add('show');
          elements.processBtn.disabled = false;
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
