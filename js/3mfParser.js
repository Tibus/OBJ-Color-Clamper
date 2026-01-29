// ============================================================================
// 3MF Parser
// ============================================================================

/**
 * Parse a 3MF file (ZIP containing XML model data)
 * @param {ArrayBuffer} buffer - The 3MF file as ArrayBuffer
 * @returns {Promise<Object>} { vertices, faces }
 */
async function parse3MF(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Find the 3D model file (usually 3D/3dmodel.model)
  let modelFile = null;
  const filenames = Object.keys(zip.files);
  for (let i = 0; i < filenames.length; i++) {
    if (filenames[i].toLowerCase().endsWith('.model')) {
      modelFile = zip.files[filenames[i]];
      break;
    }
  }

  if (!modelFile) {
    throw new Error('No .model file found in 3MF archive');
  }

  const xmlContent = await modelFile.async('text');
  return parseModelXML(xmlContent);
}

/**
 * Parse the XML model content
 * @param {string} xmlContent - The XML content of the .model file
 * @returns {Object} { vertices, faces }
 */
function parseModelXML(xmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  // Try multiple namespaces (different 3MF versions)
  const namespaces = [
    'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
    'http://schemas.microsoft.com/3dmanufacturing/core/2018',
    ''  // No namespace fallback
  ];

  let ns = namespaces[0];
  let meshes = doc.getElementsByTagNameNS(ns, 'mesh');

  // Try different namespaces if no meshes found
  for (let i = 1; i < namespaces.length && meshes.length === 0; i++) {
    ns = namespaces[i];
    if (ns === '') {
      meshes = doc.getElementsByTagName('mesh');
    } else {
      meshes = doc.getElementsByTagNameNS(ns, 'mesh');
    }
  }

  if (meshes.length === 0) {
    throw new Error('No mesh found in 3MF model');
  }

  // Parse all color sources
  const colorMap = new Map();

  // 1. Parse basematerials
  parseBaseMaterials(doc, ns, colorMap);

  // 2. Parse colorgroup (alternative color storage)
  parseColorGroups(doc, ns, colorMap);

  console.log('3MF Color map:', colorMap);

  const allVertices = [];
  const allFaces = [];
  let vertexOffset = 0;

  // Get default color from object if specified
  const objects = ns === '' ? doc.getElementsByTagName('object') : doc.getElementsByTagNameNS(ns, 'object');
  let defaultObjectColor = null;

  for (let objIdx = 0; objIdx < objects.length; objIdx++) {
    const obj = objects[objIdx];
    const pid = obj.getAttribute('pid');
    const pindex = obj.getAttribute('pindex');

    if (pid && pindex !== null) {
      const colorKey = `${pid}_${pindex}`;
      if (colorMap.has(colorKey)) {
        defaultObjectColor = colorMap.get(colorKey);
      } else if (colorMap.has(parseInt(pindex))) {
        defaultObjectColor = colorMap.get(parseInt(pindex));
      }
    }
  }

  for (let meshIdx = 0; meshIdx < meshes.length; meshIdx++) {
    const mesh = meshes[meshIdx];

    // Parse vertices
    const verticesEl = ns === ''
      ? mesh.getElementsByTagName('vertices')[0]
      : mesh.getElementsByTagNameNS(ns, 'vertices')[0];

    const vertexEls = verticesEl
      ? (ns === '' ? verticesEl.getElementsByTagName('vertex') : verticesEl.getElementsByTagNameNS(ns, 'vertex'))
      : [];

    const meshVertices = [];
    for (let i = 0; i < vertexEls.length; i++) {
      const v = vertexEls[i];
      const x = parseFloat(v.getAttribute('x')) || 0;
      const y = parseFloat(v.getAttribute('y')) || 0;
      const z = parseFloat(v.getAttribute('z')) || 0;

      // Use default object color or gray
      const defaultColor = defaultObjectColor
        ? defaultObjectColor.clone()
        : new Color(0.8, 0.8, 0.8, 'default');

      meshVertices.push({ x, y, z, color: defaultColor });
    }

    // Parse triangles
    const trianglesEl = ns === ''
      ? mesh.getElementsByTagName('triangles')[0]
      : mesh.getElementsByTagNameNS(ns, 'triangles')[0];

    const triangleEls = trianglesEl
      ? (ns === '' ? trianglesEl.getElementsByTagName('triangle') : trianglesEl.getElementsByTagNameNS(ns, 'triangle'))
      : [];

    for (let i = 0; i < triangleEls.length; i++) {
      const t = triangleEls[i];
      const v1 = parseInt(t.getAttribute('v1')) || 0;
      const v2 = parseInt(t.getAttribute('v2')) || 0;
      const v3 = parseInt(t.getAttribute('v3')) || 0;

      // Try to get face color from various attributes
      let faceColor = getTriangleColor(t, colorMap);

      // Apply color to vertices of this face
      if (faceColor && meshVertices[v1] && meshVertices[v2] && meshVertices[v3]) {
        meshVertices[v1].color = faceColor.clone();
        meshVertices[v2].color = faceColor.clone();
        meshVertices[v3].color = faceColor.clone();
      }

      allFaces.push({
        vertices: [v1 + vertexOffset, v2 + vertexOffset, v3 + vertexOffset]
      });
    }

    for (let i = 0; i < meshVertices.length; i++) {
      allVertices.push(meshVertices[i]);
    }
    vertexOffset += meshVertices.length;
  }

  return {
    vertices: allVertices,
    faces: allFaces
  };
}

/**
 * Parse basematerials elements
 */
function parseBaseMaterials(doc, ns, colorMap) {
  const baseMaterialsList = ns === ''
    ? doc.getElementsByTagName('basematerials')
    : doc.getElementsByTagNameNS(ns, 'basematerials');

  for (let m = 0; m < baseMaterialsList.length; m++) {
    const materials = baseMaterialsList[m];
    const materialsId = materials.getAttribute('id') || '0';

    const bases = ns === ''
      ? materials.getElementsByTagName('base')
      : materials.getElementsByTagNameNS(ns, 'base');

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      const displayColor = base.getAttribute('displaycolor');
      if (displayColor) {
        const color = parse3MFColorString(displayColor);
        if (color) {
          // Store with multiple keys for different lookup methods
          colorMap.set(i, color);
          colorMap.set(`${materialsId}_${i}`, color);
          colorMap.set(String(i), color);
        }
      }
    }
  }
}

/**
 * Parse colorgroup elements (Bambu/Prusa style)
 */
function parseColorGroups(doc, ns, colorMap) {
  // Try material namespace
  const materialNs = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02';

  let colorGroups = doc.getElementsByTagNameNS(materialNs, 'colorgroup');
  if (colorGroups.length === 0) {
    colorGroups = doc.getElementsByTagName('colorgroup');
  }

  for (let g = 0; g < colorGroups.length; g++) {
    const group = colorGroups[g];
    const groupId = group.getAttribute('id') || '0';

    let colors = group.getElementsByTagNameNS(materialNs, 'color');
    if (colors.length === 0) {
      colors = group.getElementsByTagName('color');
    }

    for (let i = 0; i < colors.length; i++) {
      const colorEl = colors[i];
      const colorValue = colorEl.getAttribute('color');
      if (colorValue) {
        const color = parse3MFColorString(colorValue);
        if (color) {
          colorMap.set(i, color);
          colorMap.set(`${groupId}_${i}`, color);
        }
      }
    }
  }
}

/**
 * Get color for a triangle from various attributes
 */
function getTriangleColor(triangle, colorMap) {
  // Try different attribute combinations

  // 1. paint_color (Bambu style, 1-based)
  const paintColor = triangle.getAttribute('paint_color');
  if (paintColor) {
    const idx = parseInt(paintColor) - 1;
    if (colorMap.has(idx)) return colorMap.get(idx);
  }

  // 2. pid + p1 (standard 3MF)
  const pid = triangle.getAttribute('pid');
  const p1 = triangle.getAttribute('p1');

  if (p1 !== null) {
    const idx = parseInt(p1);
    // Try with pid prefix
    if (pid && colorMap.has(`${pid}_${idx}`)) {
      return colorMap.get(`${pid}_${idx}`);
    }
    // Try just index
    if (colorMap.has(idx)) {
      return colorMap.get(idx);
    }
  }

  // 3. Just p1 attribute
  if (triangle.hasAttribute('p1')) {
    const idx = parseInt(triangle.getAttribute('p1'));
    if (colorMap.has(idx)) return colorMap.get(idx);
  }

  return null;
}

/**
 * Parse a color string (hex format like #RRGGBB or #RRGGBBAA)
 * @param {string} colorStr - Color string
 * @returns {Color|null}
 */
function parse3MFColorString(colorStr) {
  if (!colorStr) return null;

  // Remove # if present
  let hex = colorStr.replace('#', '');

  // Handle different formats
  if (hex.length === 6) {
    // RRGGBB
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    return new Color(r, g, b, colorStr);
  } else if (hex.length === 8) {
    // RRGGBBAA
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    return new Color(r, g, b, colorStr);
  }

  return null;
}
