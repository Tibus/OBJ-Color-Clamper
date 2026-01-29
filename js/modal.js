// ============================================================================
// Modal & Download
// ============================================================================

function initModal() {
  elements.formatOptions.forEach(option => {
    option.addEventListener('click', () => {
      elements.formatOptions.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedFormat = option.dataset.format;
    });
  });

  elements.downloadBtn.addEventListener('click', () => {
    if (!processedOBJ) return;
    // Remove any supported extension from filename
    const baseName = loadedFile.name.replace(/\.(obj|stl|glb|3mf)$/i, '');
    elements.exportFilename.value = baseName + '_clamped';
    elements.modalOverlay.classList.add('show');
  });

  elements.btnCancel.addEventListener('click', () => {
    elements.modalOverlay.classList.remove('show');
  });

  elements.modalOverlay.addEventListener('click', e => {
    if (e.target === elements.modalOverlay) {
      elements.modalOverlay.classList.remove('show');
    }
  });

  elements.btnConfirm.addEventListener('click', async () => {
    const filename = elements.exportFilename.value.trim() || 'model_clamped';
    elements.modalOverlay.classList.remove('show');

    if (selectedFormat === 'obj') {
      showLoader('Exporting OBJ...');
      setTimeout(() => {
        downloadBlob(new Blob([processedOBJ], { type: 'text/plain' }), filename + '.obj');
        hideLoader();
      }, 100);
    } else {
      showLoader('Generating 3MF...');
      try {
        const blob = await generate3MF();
        downloadBlob(blob, filename + '.3mf');
      } catch (err) {
        alert('3MF export error: ' + err.message);
        console.error(err);
      }
      hideLoader();
    }
  });
}
