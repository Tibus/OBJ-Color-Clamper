// ============================================================================
// Color Selection & Remapping
// ============================================================================

// Algorithm 0: Frequency-based sans pool (regroupe les couleurs similaires des vertices)
function selectBestColorsFrequencyNoPool(vertexColors, count, similarityThreshold = 1) {
  const clusters = [];

  for (const vertexColor of vertexColors) {
    let foundCluster = false;

    for (const cluster of clusters) {
      const dist = vertexColor.distanceTo(cluster.representative);
      if (dist < similarityThreshold) {
        cluster.count++;
        // Moyenne pondérée pour le représentant
        cluster.representative.r = (cluster.representative.r * (cluster.count - 1) + vertexColor.r) / cluster.count;
        cluster.representative.g = (cluster.representative.g * (cluster.count - 1) + vertexColor.g) / cluster.count;
        cluster.representative.b = (cluster.representative.b * (cluster.count - 1) + vertexColor.b) / cluster.count;
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({
        representative: vertexColor.clone(),
        count: 1
      });
    }
  }

  clusters.sort((a, b) => b.count - a.count);

  log('\nClusters de couleurs trouvés:', 'info');
  for (let i = 0; i < Math.min(clusters.length, count + 3); i++) {
    const c = clusters[i];
    const hex = `#${Math.round(c.representative.r * 255).toString(16).padStart(2, '0')}${Math.round(c.representative.g * 255).toString(16).padStart(2, '0')}${Math.round(c.representative.b * 255).toString(16).padStart(2, '0')}`;
    log(`  Cluster ${i + 1}: ${c.count} vertices (${hex})`);
  }

  return clusters.slice(0, count).map((cluster, idx) => {
    const color = cluster.representative.clone();
    color.name = `color_${idx + 1}`;
    return color;
  });
}

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



// Main selection function (uses algorithm based on parameter)
function selectBestColors(vertexColors, poolColors, count) {
  return selectBestColorsFrequency(vertexColors, poolColors, count);
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
