// ============================================================================
// Adjacency Graphs
// ============================================================================

function buildVertexAdjacency(vertexCount, faces) {
  const adjacency = new Map();
  for (let i = 0; i < vertexCount; i++) {
    adjacency.set(i, new Set());
  }

  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      for (let j = i + 1; j < face.length; j++) {
        const v1 = face[i];
        const v2 = face[j];
        if (v1 >= 0 && v1 < vertexCount && v2 >= 0 && v2 < vertexCount) {
          adjacency.get(v1).add(v2);
          adjacency.get(v2).add(v1);
        }
      }
    }
  }

  return adjacency;
}

function buildFaceAdjacency(faces) {
  const edgeToFaces = new Map();

  faces.forEach((face, faceIdx) => {
    for (let i = 0; i < face.length; i++) {
      const v1 = face[i];
      const v2 = face[(i + 1) % face.length];
      const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;

      if (!edgeToFaces.has(key)) {
        edgeToFaces.set(key, []);
      }
      edgeToFaces.get(key).push(faceIdx);
    }
  });

  const adjacency = new Map();
  for (let i = 0; i < faces.length; i++) {
    adjacency.set(i, new Set());
  }

  for (const indices of edgeToFaces.values()) {
    if (indices.length === 2) {
      adjacency.get(indices[0]).add(indices[1]);
      adjacency.get(indices[1]).add(indices[0]);
    }
  }

  return adjacency;
}
