// ============================================================================
// Color Selection & Remapping
// ============================================================================

function selectBestColors(vertexColors, poolColors, count) {
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
