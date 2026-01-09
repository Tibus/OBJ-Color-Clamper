// ============================================================================
// Initialize App
// ============================================================================

function init() {
  initElements();
  initColorPool();
  initNumColorsSelect();
  initColorPoolToggle();
  initFileHandling();
  initModal();
  elements.processBtn.addEventListener('click', processOBJ);
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
