// ============================================================================
// Color Selection & Remapping
// ============================================================================

// Algorithm 1: Frequency-based (select most frequent colors)
function selectBestColorsFrequency(vertexColors, poolColors, count) {
  const stats = poolColors.map(color => ({
    color,
    matchCount: 0,
    totalDistance: 0
  }));

  for (const vertexColor of vertexColors) {
    let minDist = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < poolColors.length; i++) {
      const dist = vertexColor.distanceTo(poolColors[i]);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    stats[closestIdx].matchCount++;
    stats[closestIdx].totalDistance += minDist;
  }

  log('\nColor distribution:', 'info');
  const sorted = [...stats].sort((a, b) => b.matchCount - a.matchCount);
  for (const s of sorted) {
    if (s.matchCount > 0) {
      log(`  ${s.color.name}: ${s.matchCount} vertices`);
    }
  }

  return sorted.filter(s => s.matchCount > 0).slice(0, count).map(s => s.color);
}

// Algorithm 2: Greedy (iteratively select color that best covers remaining vertices)
function selectBestColorsGreedy(vertexColors, poolColors, count) {
  const selectedColors = [];
  const selectedIndices = new Set();

  // Map each vertex to its closest pool color index
  const vertexToPoolIdx = vertexColors.map(vc => {
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < poolColors.length; i++) {
      const dist = vc.distanceTo(poolColors[i]);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    return closestIdx;
  });

  log('\nGreedy color selection:', 'info');

  for (let round = 0; round < count; round++) {
    // Count how many vertices map to each unselected pool color
    const coverage = poolColors.map(() => 0);

    for (let i = 0; i < vertexColors.length; i++) {
      const poolIdx = vertexToPoolIdx[i];
      // Only count if this pool color hasn't been selected yet
      if (!selectedIndices.has(poolIdx)) {
        coverage[poolIdx]++;
      }
    }

    // Select color with best coverage (most vertices)
    let bestIdx = -1;
    let bestCount = 0;

    for (let i = 0; i < poolColors.length; i++) {
      if (selectedIndices.has(i)) continue;

      if (coverage[i] > bestCount) {
        bestCount = coverage[i];
        bestIdx = i;
      }
    }

    // If no color has any coverage, pick any remaining color
    if (bestIdx < 0) {
      for (let i = 0; i < poolColors.length; i++) {
        if (!selectedIndices.has(i)) {
          bestIdx = i;
          break;
        }
      }
    }

    if (bestIdx < 0) break; // No more colors available

    const selectedColor = poolColors[bestIdx];
    selectedColors.push(selectedColor);
    selectedIndices.add(bestIdx);
    log(`  ${round + 1}. ${selectedColor.name}: covers ${bestCount} vertices`);

    // Reassign vertices that were mapped to the selected color to their next closest unselected color
    for (let i = 0; i < vertexColors.length; i++) {
      if (vertexToPoolIdx[i] === bestIdx) {
        // Find next closest unselected pool color
        let minDist = Infinity;
        let newClosestIdx = -1;
        for (let j = 0; j < poolColors.length; j++) {
          if (selectedIndices.has(j)) continue;
          const dist = vertexColors[i].distanceTo(poolColors[j]);
          if (dist < minDist) {
            minDist = dist;
            newClosestIdx = j;
          }
        }
        if (newClosestIdx >= 0) {
          vertexToPoolIdx[i] = newClosestIdx;
        }
      }
    }
  }

  return selectedColors;
}

// Main selection function (uses algorithm based on parameter)
function selectBestColors(vertexColors, poolColors, count, useGreedy = false) {
  if (useGreedy) {
    return selectBestColorsGreedy(vertexColors, poolColors, count);
  } else {
    return selectBestColorsFrequency(vertexColors, poolColors, count);
  }
}

function remapColors(vertices, palette) {
  for (const vertex of vertices) {
    if (!vertex.color) continue;

    let minDist = Infinity;
    let closestColor = palette[0];

    for (const paletteColor of palette) {
      const dist = vertex.color.distanceTo(paletteColor);
      if (dist < minDist) {
        minDist = dist;
        closestColor = paletteColor;
      }
    }

    vertex.color = closestColor.clone();
  }
}
