// ============================================================================
// STL Parsing (Binary with vertex colors)
// ============================================================================

function parseSTL(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);
  const vertices = [];
  const faces = [];

  // Check if binary STL (skip 80-byte header, read triangle count)
  const triangleCount = dataView.getUint32(80, true);
  const expectedSize = 80 + 4 + triangleCount * 50;

  if (arrayBuffer.byteLength !== expectedSize) {
    throw new Error('Invalid or ASCII STL file. Only binary STL with colors is supported.');
  }

  let offset = 84; // After header and triangle count
  const vertexMap = new Map(); // For deduplication

  for (let i = 0; i < triangleCount; i++) {
    // Skip normal (12 bytes)
    offset += 12;

    const faceIndices = [];

    // Read 3 vertices
    for (let v = 0; v < 3; v++) {
      const x = dataView.getFloat32(offset, true);
      const y = dataView.getFloat32(offset + 4, true);
      const z = dataView.getFloat32(offset + 8, true);
      offset += 12;

      // Create vertex key for deduplication
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

      let vertexIndex;
      if (vertexMap.has(key)) {
        vertexIndex = vertexMap.get(key);
      } else {
        vertexIndex = vertices.length;
        vertices.push({ x, y, z, color: null, colors: [] });
        vertexMap.set(key, vertexIndex);
      }
      faceIndices.push(vertexIndex);
    }

    // Read attribute byte count (contains color in some formats)
    const attribute = dataView.getUint16(offset, true);
    offset += 2;

    // Extract color from attribute (RGB555 format with valid bit)
    // Bit 15: valid color flag (1 = has color)
    // Bits 0-4: Blue, Bits 5-9: Green, Bits 10-14: Red
    let faceColor = null;
    if (attribute & 0x8000) {
      // VisCAM/SolidView format
      const r = ((attribute >> 10) & 0x1F) / 31;
      const g = ((attribute >> 5) & 0x1F) / 31;
      const b = (attribute & 0x1F) / 31;
      faceColor = new Color(r, g, b);
    } else if (attribute !== 0) {
      // Alternative format: try RGB555 without valid bit
      const r = ((attribute >> 10) & 0x1F) / 31;
      const g = ((attribute >> 5) & 0x1F) / 31;
      const b = (attribute & 0x1F) / 31;
      if (r > 0 || g > 0 || b > 0) {
        faceColor = new Color(r, g, b);
      }
    }

    // Assign face color to vertices (accumulate for averaging later)
    if (faceColor) {
      for (const idx of faceIndices) {
        vertices[idx].colors.push(faceColor);
      }
    }

    faces.push(faceIndices);
  }

  // Average colors for each vertex
  for (const vertex of vertices) {
    if (vertex.colors.length > 0) {
      let r = 0, g = 0, b = 0;
      for (const c of vertex.colors) {
        r += c.r;
        g += c.g;
        b += c.b;
      }
      const count = vertex.colors.length;
      vertex.color = new Color(r / count, g / count, b / count);
    }
    delete vertex.colors;
  }

  return { vertices, faces };
}
