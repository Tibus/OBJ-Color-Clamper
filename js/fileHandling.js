// ============================================================================
// File Handling
// ============================================================================

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
    if (file?.name.toLowerCase().endsWith('.obj')) {
      handleFile(file);
    }
  });

  elements.fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  loadedFile = file;
  elements.fileName.textContent = file.name;

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
}
