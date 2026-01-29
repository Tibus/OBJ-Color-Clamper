// ============================================================================
// 3D Viewer with Three.js
// ============================================================================

let viewer3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  mesh: null,
  container: null,
  animationId: null,
  vertices: null,
  faces: null
};

function initViewer3D(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  viewer3D.container = container;

  // Clear any existing content
  container.innerHTML = '';

  // Create scene
  viewer3D.scene = new THREE.Scene();
  viewer3D.scene.background = new THREE.Color(0x1a1a2e);

  // Create camera
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  viewer3D.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  viewer3D.camera.position.set(0, 0, 5);

  // Create renderer
  viewer3D.renderer = new THREE.WebGLRenderer({ antialias: true });
  viewer3D.renderer.setSize(width, height);
  viewer3D.renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(viewer3D.renderer.domElement);

  // Add OrbitControls
  viewer3D.controls = new THREE.OrbitControls(viewer3D.camera, viewer3D.renderer.domElement);
  viewer3D.controls.enableDamping = true;
  viewer3D.controls.dampingFactor = 0.05;

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  viewer3D.scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  viewer3D.scene.add(directionalLight);

  // Handle resize
  window.addEventListener('resize', onViewerResize);

  // Start animation loop
  animate();

  return true;
}

function onViewerResize() {
  if (!viewer3D.container || !viewer3D.camera || !viewer3D.renderer) return;

  const width = viewer3D.container.clientWidth;
  const height = viewer3D.container.clientHeight;

  viewer3D.camera.aspect = width / height;
  viewer3D.camera.updateProjectionMatrix();
  viewer3D.renderer.setSize(width, height);
}

function animate() {
  viewer3D.animationId = requestAnimationFrame(animate);

  if (viewer3D.controls) {
    viewer3D.controls.update();
  }

  if (viewer3D.renderer && viewer3D.scene && viewer3D.camera) {
    viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
  }
}

function loadModelToViewer(vertices, faces) {
  if (!viewer3D.scene) return;

  // Store for raycasting
  viewer3D.vertices = vertices;
  viewer3D.faces = faces;

  // console.log("vertices, faces", vertices, faces);

  // Remove existing mesh
  if (viewer3D.mesh) {
    viewer3D.scene.remove(viewer3D.mesh);
    viewer3D.mesh.geometry.dispose();
    viewer3D.mesh.material.dispose();
    viewer3D.mesh = null;
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  // Flatten vertices for triangles (each face becomes triangles)
  const positions = [];
  const colors = [];

  for (const face of faces) {
    // Support both formats: face.vertices (from parser) or face as array
    const faceIndices = face.vertices || face;

    // Fan triangulation for faces with more than 3 vertices
    for (let i = 1; i < faceIndices.length - 1; i++) {
      const i0 = faceIndices[0];
      const i1 = faceIndices[i];
      const i2 = faceIndices[i + 1];

      const v0 = vertices[i0];
      const v1 = vertices[i1];
      const v2 = vertices[i2];

      // Positions
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);

      // Colors
      const c0 = v0.color || new Color(0.5, 0.5, 0.5);
      const c1 = v1.color || new Color(0.5, 0.5, 0.5);
      const c2 = v2.color || new Color(0.5, 0.5, 0.5);

      colors.push(c0.r, c0.g, c0.b);
      colors.push(c1.r, c1.g, c1.b);
      colors.push(c2.r, c2.g, c2.b);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Create material with vertex colors
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  viewer3D.mesh = new THREE.Mesh(geometry, material);
  viewer3D.scene.add(viewer3D.mesh);

  // Auto-fit camera to bounds
  fitCameraToObject(viewer3D.mesh);

  // Show viewer card
  const viewerCard = document.getElementById('viewerCard');
  if (viewerCard) {
    viewerCard.style.display = 'block';
  }

  // Show picked palette card
  const pickedPaletteCard = document.getElementById('pickedPaletteCard');
  if (pickedPaletteCard) {
    pickedPaletteCard.style.display = 'block';
  }

  requestAnimationFrame(() => {
    onViewerResize();
  });
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = viewer3D.camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

  cameraZ *= 1.5; // Add some padding

  viewer3D.camera.position.set(center.x, center.y, center.z + cameraZ);
  viewer3D.camera.lookAt(center);

  viewer3D.controls.target.copy(center);
  viewer3D.controls.update();
}

function clearViewer() {
  if (viewer3D.mesh && viewer3D.scene) {
    viewer3D.scene.remove(viewer3D.mesh);
    viewer3D.mesh.geometry.dispose();
    viewer3D.mesh.material.dispose();
    viewer3D.mesh = null;
  }
  viewer3D.vertices = null;
  viewer3D.faces = null;
}

function getViewerMesh() {
  return viewer3D.mesh;
}

function getViewerData() {
  return {
    vertices: viewer3D.vertices,
    faces: viewer3D.faces
  };
}

function getViewerRenderer() {
  return viewer3D.renderer;
}

function getViewerCamera() {
  return viewer3D.camera;
}

// ============================================================================
// Result Viewer (for processed model)
// ============================================================================

let resultViewer3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  mesh: null,
  container: null,
  animationId: null
};

function initResultViewer3D(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  resultViewer3D.container = container;

  // Clear any existing content
  container.innerHTML = '';

  // Create scene
  resultViewer3D.scene = new THREE.Scene();
  resultViewer3D.scene.background = new THREE.Color(0x1a1a2e);

  // Create camera
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  resultViewer3D.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  resultViewer3D.camera.position.set(0, 0, 5);

  // Create renderer
  resultViewer3D.renderer = new THREE.WebGLRenderer({ antialias: true });
  resultViewer3D.renderer.setSize(width, height);
  resultViewer3D.renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(resultViewer3D.renderer.domElement);

  // Add OrbitControls
  resultViewer3D.controls = new THREE.OrbitControls(resultViewer3D.camera, resultViewer3D.renderer.domElement);
  resultViewer3D.controls.enableDamping = true;
  resultViewer3D.controls.dampingFactor = 0.05;

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  resultViewer3D.scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  resultViewer3D.scene.add(directionalLight);

  // Handle resize
  window.addEventListener('resize', onResultViewerResize);

  // Start animation loop
  animateResultViewer();

  return true;
}

function onResultViewerResize() {
  if (!resultViewer3D.container || !resultViewer3D.camera || !resultViewer3D.renderer) return;

  const width = resultViewer3D.container.clientWidth;
  const height = resultViewer3D.container.clientHeight;

  if (width === 0 || height === 0) return;

  resultViewer3D.camera.aspect = width / height;
  resultViewer3D.camera.updateProjectionMatrix();
  resultViewer3D.renderer.setSize(width, height);
}

function animateResultViewer() {
  resultViewer3D.animationId = requestAnimationFrame(animateResultViewer);

  if (resultViewer3D.controls) {
    resultViewer3D.controls.update();
  }

  if (resultViewer3D.renderer && resultViewer3D.scene && resultViewer3D.camera) {
    resultViewer3D.renderer.render(resultViewer3D.scene, resultViewer3D.camera);
  }
}

function loadResultToViewer(vertices, faces) {
  if (!resultViewer3D.scene) return;

  // Store for highlighting
  resultViewer3D.vertices = vertices;
  resultViewer3D.faces = faces;
  resultViewer3D.originalColors = null;

  // Remove existing mesh
  if (resultViewer3D.mesh) {
    resultViewer3D.scene.remove(resultViewer3D.mesh);
    resultViewer3D.mesh.geometry.dispose();
    resultViewer3D.mesh.material.dispose();
    resultViewer3D.mesh = null;
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  // Flatten vertices for triangles (each face becomes triangles)
  const positions = [];
  const colors = [];

  for (const face of faces) {
    // Support both formats: face.vertices (from parser) or face as array
    const faceIndices = face.vertices || face;

    // Fan triangulation for faces with more than 3 vertices
    for (let i = 1; i < faceIndices.length - 1; i++) {
      const i0 = faceIndices[0];
      const i1 = faceIndices[i];
      const i2 = faceIndices[i + 1];

      const v0 = vertices[i0];
      const v1 = vertices[i1];
      const v2 = vertices[i2];

      // Positions
      positions.push(v0.x, v0.y, v0.z);
      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);

      // Colors
      const c0 = v0.color || new Color(0.5, 0.5, 0.5);
      const c1 = v1.color || new Color(0.5, 0.5, 0.5);
      const c2 = v2.color || new Color(0.5, 0.5, 0.5);

      colors.push(c0.r, c0.g, c0.b);
      colors.push(c1.r, c1.g, c1.b);
      colors.push(c2.r, c2.g, c2.b);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Create material with vertex colors
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  resultViewer3D.mesh = new THREE.Mesh(geometry, material);
  resultViewer3D.scene.add(resultViewer3D.mesh);

  // Auto-fit camera to bounds
  fitResultCameraToObject(resultViewer3D.mesh);

  // Update size after card becomes visible
  requestAnimationFrame(() => {
    onResultViewerResize();
  });
}

function fitResultCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = resultViewer3D.camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

  cameraZ *= 1.5; // Add some padding

  resultViewer3D.camera.position.set(center.x, center.y, center.z + cameraZ);
  resultViewer3D.camera.lookAt(center);

  resultViewer3D.controls.target.copy(center);
  resultViewer3D.controls.update();
}

function clearResultViewer() {
  if (resultViewer3D.mesh && resultViewer3D.scene) {
    resultViewer3D.scene.remove(resultViewer3D.mesh);
    resultViewer3D.mesh.geometry.dispose();
    resultViewer3D.mesh.material.dispose();
    resultViewer3D.mesh = null;
  }
  resultViewer3D.originalColors = null;
  resultViewer3D.vertices = null;
  resultViewer3D.faces = null;
}

/**
 * Highlight vertices of a specific color on the result model
 * @param {Color} targetColor - The color to highlight
 */
function highlightResultColor(targetColor) {
  if (!resultViewer3D.mesh || !resultViewer3D.vertices || !resultViewer3D.faces) return;

  const geometry = resultViewer3D.mesh.geometry;
  const colorAttribute = geometry.getAttribute('color');

  // Store original colors if not already stored
  if (!resultViewer3D.originalColors) {
    resultViewer3D.originalColors = new Float32Array(colorAttribute.array);
  }

  const colors = colorAttribute.array;
  const vertices = resultViewer3D.vertices;
  const faces = resultViewer3D.faces;

  // Tolerance for color matching
  const tolerance = 0.05;

  let colorIndex = 0;
  for (const face of faces) {
    const faceIndices = face.vertices || face;

    for (let i = 1; i < faceIndices.length - 1; i++) {
      const indices = [faceIndices[0], faceIndices[i], faceIndices[i + 1]];

      for (const idx of indices) {
        const v = vertices[idx];
        const vc = v.color || { r: 0.5, g: 0.5, b: 0.5 };

        // Check if this vertex matches the target color
        const isMatch = Math.abs(vc.r - targetColor.r) < tolerance &&
                        Math.abs(vc.g - targetColor.g) < tolerance &&
                        Math.abs(vc.b - targetColor.b) < tolerance;

        if (isMatch) {
          // Brighten matched color
          colors[colorIndex] = 1;//Math.min(1, vc.r * 1.3 + 0.2);
          colors[colorIndex + 1] = 1;//Math.min(1, vc.g * 1.3 + 0.2);
          colors[colorIndex + 2] = 1;//Math.min(1, vc.b * 1.3 + 0.2);
        } else {
          // Dim non-matched colors
          colors[colorIndex] = 0;//vc.r * 0.1;
          colors[colorIndex + 1] = 0;//vc.g * 0.1;
          colors[colorIndex + 2] = 0;//vc.b * 0.1;
        }

        colorIndex += 3;
      }
    }
  }

  colorAttribute.needsUpdate = true;
}

/**
 * Restore original colors on the result model
 */
function resetResultColors() {
  if (!resultViewer3D.mesh || !resultViewer3D.originalColors) return;

  const geometry = resultViewer3D.mesh.geometry;
  const colorAttribute = geometry.getAttribute('color');

  // Copy original colors back
  colorAttribute.array.set(resultViewer3D.originalColors);
  colorAttribute.needsUpdate = true;
}
