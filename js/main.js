// ============================================================================
// Initialize App
// ============================================================================

function getPageType() {
  return document.body.dataset.page || 'converter';
}

function init() {
  const page = getPageType();

  initElements();
  initFileHandling();

  if (page === 'viewer') {
    initViewer3D('viewer3DContainer');
  } else if (page === 'converter') {
    initColorPool();
    initNumColorsSelect();
    initColorPoolToggle();
    initModal();
    initProcessViewer3D('processViewer3DContainer');
    initResultViewer3D('resultViewer3DContainer');
    initPickedPalette();
    if (elements.processBtn) {
      elements.processBtn.addEventListener('click', processOBJ);
    }
    if (elements.downloadBtn) {
      elements.downloadBtn.addEventListener('click', () => openExportModal('_clamped'));
    }
  } else if (page === 'decimator') {
    initViewer3D('viewer3DContainer');
    initResultViewer3D('resultViewer3DContainer');
    initDecimatorUI();
    initModal();
    if (elements.processBtn) {
      elements.processBtn.addEventListener('click', processDecimation);
    }
    if (elements.downloadBtn) {
      elements.downloadBtn.addEventListener('click', () => openExportModal('_decimated'));
    }
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
