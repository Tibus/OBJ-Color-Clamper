// ============================================================================
// Color Selection & Remapping
// ============================================================================

// Algorithm 0: K-means++ without pool (clustering vertex colors)
function selectBestColorsFrequencyNoPool(vertexColors, count, maxIterations = 20) {
  if (vertexColors.length === 0) return [];
  if (vertexColors.length <= count) {
    return vertexColors.map((c, idx) => {
      const color = c.clone();
      color.name = `color_${idx + 1}`;
      return color;
    });
  }

  // Seeded PRNG for deterministic results (mulberry32)
  let seed = 12345;
  const random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // K-means++ initialization
  const centroids = [];

  // First centroid: randomly chosen
  const firstIdx = Math.floor(random() * vertexColors.length);
  centroids.push(vertexColors[firstIdx].clone());

  // Next centroids: probability proportional to D(x)²
  while (centroids.length < count) {
    const distances = [];
    let totalDist = 0;

    for (const color of vertexColors) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = color.distanceTo(centroid);
        if (dist < minDist) minDist = dist;
      }
      const distSquared = minDist * minDist;
      distances.push(distSquared);
      totalDist += distSquared;
    }

    // Weighted selection
    let r = random() * totalDist;
    let selectedIdx = 0;
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i];
      if (r <= 0) {
        selectedIdx = i;
        break;
      }
    }
    centroids.push(vertexColors[selectedIdx].clone());
  }

  // K-means iterations
  let assignments = new Array(vertexColors.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assignment step: assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < vertexColors.length; i++) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let j = 0; j < centroids.length; j++) {
        const dist = vertexColors[i].distanceTo(centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = j;
        }
      }
      if (assignments[i] !== closestIdx) {
        assignments[i] = closestIdx;
        changed = true;
      }
    }

    if (!changed && iter > 0) {
      log(`  K-means++ converged after ${iter} iterations`, 'info');
      break;
    }

    // Update step: recalculate centroids
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < vertexColors.length; i++) {
      const cluster = assignments[i];
      sums[cluster].r += vertexColors[i].r;
      sums[cluster].g += vertexColors[i].g;
      sums[cluster].b += vertexColors[i].b;
      sums[cluster].count++;
    }

    for (let j = 0; j < centroids.length; j++) {
      if (sums[j].count > 0) {
        centroids[j].r = sums[j].r / sums[j].count;
        centroids[j].g = sums[j].g / sums[j].count;
        centroids[j].b = sums[j].b / sums[j].count;
      }
    }
  }

  // Count vertices per cluster
  const counts = new Array(centroids.length).fill(0);
  for (const assignment of assignments) {
    counts[assignment]++;
  }

  // Create results with counts
  const results = centroids.map((centroid, idx) => ({
    representative: centroid,
    count: counts[idx]
  }));

  results.sort((a, b) => b.count - a.count);

  log('\nK-means++ clusters found:', 'info');
  for (let i = 0; i < results.length; i++) {
    const c = results[i];
    const hex = `#${Math.round(c.representative.r * 255).toString(16).padStart(2, '0')}${Math.round(c.representative.g * 255).toString(16).padStart(2, '0')}${Math.round(c.representative.b * 255).toString(16).padStart(2, '0')}`;
    log(`  Cluster ${i + 1}: ${c.count} vertices (${hex})`);
  }

  return results.map((cluster, idx) => {
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
