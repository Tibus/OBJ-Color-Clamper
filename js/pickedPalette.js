// ============================================================================
// Picked Palette UI
// ============================================================================

const COLOR_TOLERANCE = 0.05; // Minimum distance to consider colors as different

function initPickedPalette() {
  // Load saved palette from localStorage
  pickedPalette = loadPickedPalette();

  // Set up event listeners
  const clearBtn = document.getElementById('clearPaletteBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllPickedColors);
  }

  const usePickedToggle = document.getElementById('usePickedColorsToggle');
  const useColorPoolToggle = document.getElementById('useColorPool');

  if (usePickedToggle && useColorPoolToggle) {
    // Make toggles mutually exclusive
    usePickedToggle.addEventListener('change', () => {
      if (usePickedToggle.checked) {
        useColorPoolToggle.checked = false;
        elements.colorPool.classList.add('hidden');
      }
      updateNumColorsFromPicked();
    });

    useColorPoolToggle.addEventListener('change', () => {
      if (useColorPoolToggle.checked) {
        usePickedToggle.checked = false;
      }
      updateNumColorsFromPicked();
    });
  }

  // Initial render
  renderPickedPalette();

  // If there are saved colors, show card and enable "use picked colors" toggle
  if (pickedPalette.length > 0) {
    const card = document.getElementById('pickedPaletteCard');
    if (card) {
      card.style.display = 'block';
    }

    // Auto-enable "use picked colors" and disable "use color pool"
    if (usePickedToggle && useColorPoolToggle) {
      usePickedToggle.checked = true;
      useColorPoolToggle.checked = false;
      elements.colorPool.classList.add('hidden');
    }

    // Update numColors to match picked palette
    updateNumColorsFromPicked();
  }
}

function isColorUnique(color, palette, tolerance = COLOR_TOLERANCE) {
  for (const existing of palette) {
    if (color.distanceTo(existing) < tolerance) {
      return false;
    }
  }
  return true;
}

function addColorToPalette(color) {
  if (!isColorUnique(color, pickedPalette)) {
    console.log('Color already in palette (too similar)');
    return false;
  }

  // Generate a name based on hex value if not provided
  if (!color.name) {
    color.name = color.toHex();
  }

  pickedPalette.push(color);
  savePickedPalette(pickedPalette);
  renderPickedPalette();

  // Show the picked palette card
  const card = document.getElementById('pickedPaletteCard');
  if (card) {
    card.style.display = 'block';
  }

  return true;
}

function removeColorFromPalette(index) {
  if (index >= 0 && index < pickedPalette.length) {
    pickedPalette.splice(index, 1);
    savePickedPalette(pickedPalette);
    renderPickedPalette();
  }
}

function clearAllPickedColors() {
  pickedPalette = [];
  clearPickedPaletteStorage();
  renderPickedPalette();
}

function getPickedColors() {
  return pickedPalette.slice(); // Return a copy
}

function renderPickedPalette() {
  const grid = document.getElementById('pickedPaletteGrid');
  if (!grid) return;

  grid.innerHTML = '';

  if (pickedPalette.length === 0) {
    grid.innerHTML = '<div class="picked-palette-empty">No colors picked yet</div>';
    updateNumColorsFromPicked();
    return;
  }

  pickedPalette.forEach((color, index) => {
    const item = document.createElement('div');
    item.className = 'picked-color-item';
    item.innerHTML = `
      <div class="picked-color-swatch" style="background: ${color.toHex()}"></div>
      <span class="picked-color-name">${color.name}</span>
      <button class="picked-color-remove" data-index="${index}" title="Remove color">x</button>
    `;
    grid.appendChild(item);

    // Add remove event listener
    const removeBtn = item.querySelector('.picked-color-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeColorFromPalette(index);
    });
  });

  updateNumColorsFromPicked();
}

function updateNumColorsFromPicked() {
  const numColorsSelect = document.getElementById('numColors');
  const usePickedToggle = document.getElementById('usePickedColorsToggle');
  const paramHelp = numColorsSelect ? numColorsSelect.parentElement.querySelector('.param-help') : null;

  if (!numColorsSelect) return;

  const isUsingPicked = usePickedToggle && usePickedToggle.checked;
  const hasPickedColors = pickedPalette.length > 0;

  if (isUsingPicked && hasPickedColors) {
    // Set value to number of picked colors and disable
    numColorsSelect.value = pickedPalette.length;
    numColorsSelect.disabled = true;
    numColorsSelect.parentElement.classList.add('disabled');
    if (paramHelp) {
      paramHelp.textContent = `Using ${pickedPalette.length} picked color${pickedPalette.length > 1 ? 's' : ''}`;
    }
  } else {
    // Re-enable the select
    numColorsSelect.disabled = false;
    numColorsSelect.parentElement.classList.remove('disabled');
    if (paramHelp) {
      paramHelp.textContent = 'How many colors to use';
    }
  }
}
