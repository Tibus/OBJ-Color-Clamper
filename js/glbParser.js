// ============================================================================
// GLB Parser with Texture Baking to Vertex Colors
// ============================================================================

async function parseGLB(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);

  // Check magic number "glTF"
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) {
    throw new Error('Invalid GLB file: wrong magic number');
  }

  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  // Parse chunks
  let offset = 12;
  let jsonChunk = null;
  let binChunk = null;

  while (offset < arrayBuffer.byteLength) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);

    if (chunkType === 0x4E4F534A) { // JSON
      const jsonData = new Uint8Array(arrayBuffer, offset + 8, chunkLength);
      jsonChunk = JSON.parse(new TextDecoder().decode(jsonData));
    } else if (chunkType === 0x004E4942) { // BIN
      binChunk = new Uint8Array(arrayBuffer, offset + 8, chunkLength);
    }

    offset += 8 + chunkLength;
  }

  if (!jsonChunk) throw new Error('No JSON chunk found in GLB');

  const gltf = jsonChunk;
  const vertices = [];
  const faces = [];
  const vertexMap = new Map();

  // Extract textures
  const textures = await extractTextures(gltf, binChunk);

  // Store the first texture as original texture for display
  const firstTexture = textures.find(t => t !== null) || null;

  // Process all meshes
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      await processPrimitive(primitive, gltf, binChunk, textures, vertices, faces, vertexMap);
    }
  }

  return { vertices, faces, texture: firstTexture };
}

async function extractTextures(gltf, binChunk) {
  const textures = [];

  for (const texture of gltf.textures || []) {
    const imageIndex = texture.source;
    if (imageIndex === undefined) continue;

    const image = gltf.images[imageIndex];
    let imageData = null;

    if (image.bufferView !== undefined) {
      // Image embedded in binary chunk
      const bufferView = gltf.bufferViews[image.bufferView];
      const imageBytes = new Uint8Array(
        binChunk.buffer,
        binChunk.byteOffset + (bufferView.byteOffset || 0),
        bufferView.byteLength
      );
      imageData = await loadImageFromBytes(imageBytes, image.mimeType);
    } else if (image.uri) {
      // Data URI
      if (image.uri.startsWith('data:')) {
        imageData = await loadImageFromDataURI(image.uri);
      }
    }

    textures.push(imageData);
  }

  return textures;
}

function loadImageFromBytes(bytes, mimeType) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // Draw to canvas to get pixel data
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(url);
      resolve({ data: imageData.data, width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function loadImageFromDataURI(uri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ data: imageData.data, width: img.width, height: img.height });
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}

function getAccessorData(accessor, gltf, binChunk) {
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const byteStride = bufferView.byteStride || 0;

  const componentTypes = {
    5120: Int8Array,    // BYTE
    5121: Uint8Array,   // UNSIGNED_BYTE
    5122: Int16Array,   // SHORT
    5123: Uint16Array,  // UNSIGNED_SHORT
    5125: Uint32Array,  // UNSIGNED_INT
    5126: Float32Array  // FLOAT
  };

  const componentCounts = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16
  };

  const TypedArray = componentTypes[accessor.componentType];
  const componentCount = componentCounts[accessor.type];
  const elementCount = accessor.count;

  if (byteStride && byteStride !== componentCount * TypedArray.BYTES_PER_ELEMENT) {
    // Interleaved data - need to extract manually
    const result = [];
    const view = new DataView(binChunk.buffer, binChunk.byteOffset);
    for (let i = 0; i < elementCount; i++) {
      const elementOffset = byteOffset + i * byteStride;
      const element = [];
      for (let j = 0; j < componentCount; j++) {
        const compOffset = elementOffset + j * TypedArray.BYTES_PER_ELEMENT;
        if (accessor.componentType === 5126) {
          element.push(view.getFloat32(compOffset, true));
        } else if (accessor.componentType === 5123) {
          element.push(view.getUint16(compOffset, true));
        } else if (accessor.componentType === 5125) {
          element.push(view.getUint32(compOffset, true));
        }
      }
      result.push(element);
    }
    return result;
  } else {
    // Contiguous data
    const data = new TypedArray(
      binChunk.buffer,
      binChunk.byteOffset + byteOffset,
      elementCount * componentCount
    );

    const result = [];
    for (let i = 0; i < elementCount; i++) {
      const element = [];
      for (let j = 0; j < componentCount; j++) {
        element.push(data[i * componentCount + j]);
      }
      result.push(element);
    }
    return result;
  }
}

function sampleTexture(texture, u, v) {
  if (!texture) return null;

  // Wrap UV coordinates
  u = u - Math.floor(u);
  v = v - Math.floor(v);

  // Flip V (glTF uses top-left origin)
  v = 1 - v;

  const x = Math.floor(u * (texture.width - 1));
  const y = Math.floor(v * (texture.height - 1));
  const idx = (y * texture.width + x) * 4;

  return new Color(
    texture.data[idx] / 255,
    texture.data[idx + 1] / 255,
    texture.data[idx + 2] / 255
  );
}

async function processPrimitive(primitive, gltf, binChunk, textures, vertices, faces, vertexMap) {
  const attributes = primitive.attributes;

  // Get position data
  if (attributes.POSITION === undefined) return;
  const positionAccessor = gltf.accessors[attributes.POSITION];
  const positions = getAccessorData(positionAccessor, gltf, binChunk);

  // Get UV data
  let uvs = null;
  if (attributes.TEXCOORD_0 !== undefined) {
    const uvAccessor = gltf.accessors[attributes.TEXCOORD_0];
    uvs = getAccessorData(uvAccessor, gltf, binChunk);
  }

  // Get existing vertex colors
  let vertexColors = null;
  if (attributes.COLOR_0 !== undefined) {
    const colorAccessor = gltf.accessors[attributes.COLOR_0];
    vertexColors = getAccessorData(colorAccessor, gltf, binChunk);
  }

  // Get texture for this primitive
  let texture = null;
  if (primitive.material !== undefined) {
    const material = gltf.materials[primitive.material];
    if (material.pbrMetallicRoughness?.baseColorTexture) {
      const textureIndex = material.pbrMetallicRoughness.baseColorTexture.index;
      texture = textures[textureIndex];
    } else if (material.extensions?.KHR_materials_unlit?.baseColorTexture) {
      const textureIndex = material.extensions.KHR_materials_unlit.baseColorTexture.index;
      texture = textures[textureIndex];
    }

    // Also check for base color factor
    if (!texture && material.pbrMetallicRoughness?.baseColorFactor) {
      const factor = material.pbrMetallicRoughness.baseColorFactor;
      // Create a solid color "texture"
      texture = {
        data: new Uint8Array([
          Math.round(factor[0] * 255),
          Math.round(factor[1] * 255),
          Math.round(factor[2] * 255),
          255
        ]),
        width: 1,
        height: 1
      };
    }
  }

  // Create vertices with baked colors
  const baseVertexIndex = vertices.length;
  const localToGlobal = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    let color = null;

    // Priority: 1. Sample texture, 2. Use vertex color, 3. Default white
    if (texture && uvs && uvs[i]) {
      color = sampleTexture(texture, uvs[i][0], 1-uvs[i][1]);
    } else if (vertexColors && vertexColors[i]) {
      const vc = vertexColors[i];
      // Vertex colors can be normalized or not
      if (vc[0] > 1 || vc[1] > 1 || vc[2] > 1) {
        color = new Color(vc[0] / 255, vc[1] / 255, vc[2] / 255);
      } else {
        color = new Color(vc[0], vc[1], vc[2]);
      }
    }

    vertices.push({
      x: pos[0],
      y: pos[1],
      z: pos[2],
      color: color
    });
    localToGlobal.push(baseVertexIndex + i);
  }

  // Get indices
  if (primitive.indices !== undefined) {
    const indexAccessor = gltf.accessors[primitive.indices];
    const indices = getAccessorData(indexAccessor, gltf, binChunk);

    // Process triangles
    for (let i = 0; i < indices.length; i += 3) {
      faces.push([
        localToGlobal[indices[i][0]],
        localToGlobal[indices[i + 1][0]],
        localToGlobal[indices[i + 2][0]]
      ]);
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < positions.length; i += 3) {
      faces.push([
        localToGlobal[i],
        localToGlobal[i + 1],
        localToGlobal[i + 2]
      ]);
    }
  }
}
