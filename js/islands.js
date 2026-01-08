// ============================================================================
// Island Detection & Merging
// ============================================================================

function findColorIslands(vertices, adjacency) {
  const visited = new Set();
  const islands = [];

  for (let startIdx = 0; startIdx < vertices.length; startIdx++) {
    if (visited.has(startIdx) || !vertices[startIdx].color) continue;

    const island = [];
    const queue = [startIdx];
    const colorName = vertices[startIdx].color.name;

    while (queue.length > 0) {
      const idx = queue.shift();
      if (visited.has(idx)) continue;

      const vertex = vertices[idx];
      if (!vertex.color || vertex.color.name !== colorName) continue;

      visited.add(idx);
      island.push(idx);

      for (const neighborIdx of adjacency.get(idx) || []) {
        if (!visited.has(neighborIdx) && vertices[neighborIdx].color?.name === colorName) {
          queue.push(neighborIdx);
        }
      }
    }

    if (island.length > 0) {
      islands.push({
        vertices: island,
        colorName,
        color: vertices[startIdx].color.clone()
      });
    }
  }

  return islands;
}

function mergeSmallIslands(vertices, adjacency, minSize, palette) {
  let totalMerged = 0;
  let iterations = 0;

  while (iterations++ < 10) {
    const islands = findColorIslands(vertices, adjacency);
    islands.sort((a, b) => a.vertices.length - b.vertices.length);

    let merged = 0;

    for (const island of islands) {
      if (island.vertices.length >= minSize) continue;

      const neighborColors = new Map();
      for (const vertexIdx of island.vertices) {
        for (const neighborIdx of adjacency.get(vertexIdx) || []) {
          const neighbor = vertices[neighborIdx];
          if (neighbor.color && neighbor.color.name !== island.colorName) {
            neighborColors.set(neighbor.color.name, (neighborColors.get(neighbor.color.name) || 0) + 1);
          }
        }
      }

      if (neighborColors.size === 0) continue;

      let bestColor = null;
      let bestCount = 0;
      for (const [name, count] of neighborColors) {
        if (count > bestCount) {
          bestCount = count;
          bestColor = name;
        }
      }

      if (bestColor) {
        const newColor = palette.find(c => c.name === bestColor);
        if (newColor) {
          for (const vertexIdx of island.vertices) {
            vertices[vertexIdx].color = newColor.clone();
          }
          merged += island.vertices.length;
        }
      }
    }

    totalMerged += merged;
    if (merged === 0) break;
  }

  log(`  Merged ${totalMerged} vertices (vertex islands)`, 'success');
  return totalMerged;
}

function getFaceDominantColor(face, vertices) {
  const counts = new Map();
  for (const vertexIdx of face) {
    const color = vertices[vertexIdx]?.color;
    if (color?.name) {
      counts.set(color.name, (counts.get(color.name) || 0) + 1);
    }
  }

  let dominant = null;
  let maxCount = 0;
  for (const [name, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = name;
    }
  }

  return dominant;
}

function mergeIsolatedFaces(vertices, faces, faceAdjacency, minSize, palette) {
  let totalMerged = 0;
  let iterations = 0;

  while (iterations++ < 10) {
    const faceColors = faces.map(face => getFaceDominantColor(face, vertices));
    let merged = 0;

    // Individual isolated faces
    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
      const myColor = faceColors[faceIdx];
      if (!myColor) continue;

      const neighbors = faceAdjacency.get(faceIdx);
      if (!neighbors?.size) continue;

      const neighborCounts = new Map();
      let hasSameColor = false;

      for (const neighborFace of neighbors) {
        const neighborColor = faceColors[neighborFace];
        if (!neighborColor) continue;
        if (neighborColor === myColor) {
          hasSameColor = true;
          break;
        }
        neighborCounts.set(neighborColor, (neighborCounts.get(neighborColor) || 0) + 1);
      }

      if (!hasSameColor && neighborCounts.size > 0) {
        let bestColor = null;
        let bestCount = 0;
        for (const [name, count] of neighborCounts) {
          if (count > bestCount) {
            bestCount = count;
            bestColor = name;
          }
        }

        if (bestColor) {
          const newColor = palette.find(c => c.name === bestColor);
          if (newColor) {
            for (const vertexIdx of faces[faceIdx]) {
              if (vertices[vertexIdx].color?.name === myColor) {
                vertices[vertexIdx].color = newColor.clone();
                merged++;
              }
            }
          }
        }
      }
    }

    // Face islands
    const updatedColors = faces.map(face => getFaceDominantColor(face, vertices));
    const visited = new Set();
    const faceIslands = [];

    for (let startFace = 0; startFace < faces.length; startFace++) {
      if (visited.has(startFace) || !updatedColors[startFace]) continue;

      const island = [];
      const queue = [startFace];
      const colorName = updatedColors[startFace];

      while (queue.length > 0) {
        const faceIdx = queue.shift();
        if (visited.has(faceIdx) || updatedColors[faceIdx] !== colorName) continue;

        visited.add(faceIdx);
        island.push(faceIdx);

        for (const neighborFace of faceAdjacency.get(faceIdx) || []) {
          if (!visited.has(neighborFace) && updatedColors[neighborFace] === colorName) {
            queue.push(neighborFace);
          }
        }
      }

      if (island.length > 0) {
        faceIslands.push({ faces: island, colorName });
      }
    }

    for (const island of faceIslands.sort((a, b) => a.faces.length - b.faces.length)) {
      if (island.faces.length >= minSize) continue;

      const neighborCounts = new Map();
      for (const faceIdx of island.faces) {
        for (const neighborFace of faceAdjacency.get(faceIdx) || []) {
          const neighborColor = updatedColors[neighborFace];
          if (neighborColor && neighborColor !== island.colorName) {
            neighborCounts.set(neighborColor, (neighborCounts.get(neighborColor) || 0) + 1);
          }
        }
      }

      if (neighborCounts.size === 0) continue;

      let bestColor = null;
      let bestCount = 0;
      for (const [name, count] of neighborCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestColor = name;
        }
      }

      if (bestColor) {
        const newColor = palette.find(c => c.name === bestColor);
        if (newColor) {
          const affected = new Set();
          for (const faceIdx of island.faces) {
            for (const vertexIdx of faces[faceIdx]) {
              if (vertices[vertexIdx].color?.name === island.colorName) {
                vertices[vertexIdx].color = newColor.clone();
                affected.add(vertexIdx);
              }
            }
          }
          merged += affected.size;
        }
      }
    }

    totalMerged += merged;
    if (merged === 0) break;
  }

  log(`  Merged ${totalMerged} vertices (face islands)`, 'success');
  return totalMerged;
}
