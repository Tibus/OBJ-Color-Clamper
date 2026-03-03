// ============================================================================
// Tab System
// ============================================================================

const TABS_STORAGE_KEY = 'objColorClamper_activeTab';
let activeTab = 'viewer';

function initTabs() {
  const saved = localStorage.getItem(TABS_STORAGE_KEY) || 'viewer';
  switchTab(saved);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabName) {
  activeTab = tabName;

  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'tab-' + tabName);
  });

  // Save preference
  localStorage.setItem(TABS_STORAGE_KEY, tabName);

  // Trigger Three.js resize so canvases recalculate when becoming visible
  requestAnimationFrame(() => {
    if (tabName === 'viewer' && typeof onViewerResize === 'function') {
      onViewerResize();
    }
    if (tabName === 'process') {
      if (typeof onProcessViewerResize === 'function') {
        onProcessViewerResize();
      }
      if (typeof onResultViewerResize === 'function') {
        onResultViewerResize();
      }
    }
  });
}
