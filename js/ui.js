// ============================================================================
// UI Elements
// ============================================================================

const elements = {};

function initElements() {
  elements.dropZone = document.getElementById('dropZone');
  elements.fileInput = document.getElementById('fileInput');
  elements.fileInfo = document.getElementById('fileInfo');
  elements.fileName = document.getElementById('fileName');
  elements.fileStats = document.getElementById('fileStats');
  elements.processBtn = document.getElementById('processBtn');
  elements.progressContainer = document.getElementById('progressContainer');
  elements.progressFill = document.getElementById('progressFill');
  elements.progressText = document.getElementById('progressText');
  elements.resultsCard = document.getElementById('resultsCard');
  elements.logCard = document.getElementById('logCard');
  elements.statsGrid = document.getElementById('statsGrid');
  elements.downloadBtn = document.getElementById('downloadBtn');
  elements.logContainer = document.getElementById('logContainer');
  elements.colorPool = document.getElementById('colorPool');
  elements.modalOverlay = document.getElementById('modalOverlay');
  elements.exportFilename = document.getElementById('exportFilename');
  elements.formatOptions = document.querySelectorAll('.format-option');
  elements.btnCancel = document.getElementById('btnCancel');
  elements.btnConfirm = document.getElementById('btnConfirm');
}

// ============================================================================
// Initialize Color Pool Display
// ============================================================================

function initColorPool() {
  COLOR_POOL.forEach(color => {
    const div = document.createElement('div');
    div.className = 'color-item';
    div.innerHTML = `
      <div class="color-swatch" style="background: ${color.toHex()}"></div>
      <span>${color.name}</span>
    `;
    elements.colorPool.appendChild(div);
  });
}

function initNumColorsSelect() {
  const select = document.getElementById('numColors');
  const defaultValue = 4;

  for (let i = 1; i <= COLOR_POOL.length; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    if (i === defaultValue) {
      option.selected = true;
    }
    select.appendChild(option);
  }
}

// ============================================================================
// Logging
// ============================================================================

function log(message, type = '') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = message;
  elements.logContainer.appendChild(line);
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
}

function clearLog() {
  elements.logContainer.innerHTML = '';
}

// ============================================================================
// Progress
// ============================================================================

function updateProgress(percent, text) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = text;
}

// ============================================================================
// Results Display
// ============================================================================

function displayResults(palette, stats) {
  elements.statsGrid.innerHTML = '';

  const savedIndices = loadMmuIndices();

  finalPalette = palette.filter(c => stats[c.name]).map((color, idx) => ({
    color,
    mmuIndex: savedIndices[color.name] || (idx + 1)
  }));

  const maxMmuIndex = finalPalette.length;

  finalPalette.forEach(item => {
    if (item.mmuIndex > maxMmuIndex) {
      item.mmuIndex = maxMmuIndex;
    }
  });

  finalPalette.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'stat-item';

    let optionsHtml = '';
    for (let i = 1; i <= maxMmuIndex; i++) {
      const selected = i === item.mmuIndex ? 'selected' : '';
      optionsHtml += `<option value="${i}" ${selected}>${i}</option>`;
    }

    div.innerHTML = `
      <div class="color-preview" style="background: ${item.color.toHex()}"></div>
      <div class="name">${item.color.name}</div>
      <div class="count">${stats[item.color.name].toLocaleString()} vertices</div>
      <div class="mmu-index-group">
        <label>MMU</label>
        <select class="mmu-index-select" data-color="${item.color.name}">
          ${optionsHtml}
        </select>
      </div>
    `;
    elements.statsGrid.appendChild(div);
  });

  document.querySelectorAll('.mmu-index-select').forEach(select => {
    select.addEventListener('change', e => {
      const colorName = e.target.dataset.color;
      const newIndex = parseInt(e.target.value) || 1;
      const paletteItem = finalPalette.find(p => p.color.name === colorName);
      if (paletteItem) {
        paletteItem.mmuIndex = newIndex;
        saveAllMmuIndices();
      }
    });
  });

  elements.resultsCard.classList.add('show');
  elements.logCard.classList.add('show');
}
