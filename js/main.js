// ============================================================================
// Initialize App
// ============================================================================

function init() {
  initElements();
  initTabs();
  initColorPool();
  initNumColorsSelect();
  initColorPoolToggle();
  initFileHandling();
  initModal();
  initViewer3D('viewer3DContainer');
  initProcessViewer3D('processViewer3DContainer');
  initResultViewer3D('resultViewer3DContainer');
  initPickedPalette();
  elements.processBtn.addEventListener('click', processOBJ);
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
