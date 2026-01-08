// ============================================================================
// OBJ Parsing
// ============================================================================

function parseOBJ(content) {
  const lines = content.split('\n');
  const vertices = [];
  const vertexLineIndices = [];
  const faces = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);

      let color = null;
      if (parts.length >= 7) {
        let r = parseFloat(parts[4]);
        let g = parseFloat(parts[5]);
        let b = parseFloat(parts[6]);

        if (r > 1 || g > 1 || b > 1) {
          r /= 255;
          g /= 255;
          b /= 255;
        }

        color = new Color(
          Math.max(0, Math.min(1, r)),
          Math.max(0, Math.min(1, g)),
          Math.max(0, Math.min(1, b))
        );
      }

      vertices.push({ x, y, z, color, lineIndex: index });
      vertexLineIndices.push(index);
    }

    if (trimmed.startsWith('f ')) {
      const parts = trimmed.split(/\s+/).slice(1);
      const faceVertices = parts.map(p => {
        const idx = parseInt(p.split('/')[0]);
        return idx > 0 ? idx - 1 : vertices.length + idx;
      });
      faces.push(faceVertices);
    }
  });

  return { vertices, vertexLineIndices, originalLines: lines, faces };
}
