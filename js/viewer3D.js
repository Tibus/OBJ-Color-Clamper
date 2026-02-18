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
  faces: null,
  composer: null,
  ssaoPass: null
};

function initViewer3D(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  viewer3D.container = container;

  // Clear any existing content
  container.innerHTML = '';

  // Create scene
  viewer3D.scene = new THREE.Scene();
  viewer3D.scene.background = new THREE.Color(0xffffff);

  // Create camera
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  viewer3D.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  viewer3D.camera.position.set(0, 0, 5);

  // Create renderer (preserveDrawingBuffer for PNG export)
  viewer3D.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  viewer3D.renderer.setSize(width, height);
  viewer3D.renderer.setPixelRatio(window.devicePixelRatio);
  viewer3D.renderer.shadowMap.enabled = true;
  viewer3D.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(viewer3D.renderer.domElement);

  // Add OrbitControls
  viewer3D.controls = new THREE.OrbitControls(viewer3D.camera, viewer3D.renderer.domElement);
  viewer3D.controls.enableDamping = true;
  viewer3D.controls.dampingFactor = 0.05;

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  viewer3D.scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 512;
  directionalLight.shadow.mapSize.height = 512;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  directionalLight.shadow.radius = 20;
  directionalLight.shadow.bias = -0.0001;
  viewer3D.scene.add(directionalLight);
  viewer3D.directionalLight = directionalLight;

  // SSAO post-processing
  viewer3D.composer = new THREE.EffectComposer(viewer3D.renderer);
  const renderPass = new THREE.RenderPass(viewer3D.scene, viewer3D.camera);
  viewer3D.composer.addPass(renderPass);

  viewer3D.ssaoPass = new THREE.SSAOPass(viewer3D.scene, viewer3D.camera, width * 2, height * 2);
  viewer3D.ssaoPass.kernelRadius = 10;
  viewer3D.ssaoPass.minDistance = 0.001;
  viewer3D.ssaoPass.maxDistance = 0.04;
  viewer3D.ssaoPass.output = THREE.SSAOPass.OUTPUT.SSAO;
  viewer3D.composer.addPass(viewer3D.ssaoPass);

  viewer3D.fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
  viewer3D.fxaaPass.uniforms['resolution'].value.set(1 / (width * 2), 1 / (height * 2));
  viewer3D.composer.addPass(viewer3D.fxaaPass);

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
  if (viewer3D.composer) viewer3D.composer.setSize(width * 2, height * 2);
  if (viewer3D.ssaoPass) viewer3D.ssaoPass.setSize(width * 2, height * 2);
  if (viewer3D.fxaaPass) viewer3D.fxaaPass.uniforms['resolution'].value.set(1 / (width * 2), 1 / (height * 2));
}

function animate() {
  viewer3D.animationId = requestAnimationFrame(animate);

  if (viewer3D.controls) {
    viewer3D.controls.update();
  }

  if (viewer3D.composer) {
    // Step 1: Render scene with SSAO (hide ground plane so AO only affects the mesh)
    if (viewer3D.groundPlane) viewer3D.groundPlane.visible = false;
    viewer3D.composer.render();

    // Step 2: Composite ground plane with correct depth occlusion
    if (viewer3D.groundPlane && viewer3D.mesh) {
      const savedBg = viewer3D.scene.background;
      viewer3D.scene.background = null;
      viewer3D.renderer.autoClear = false;
      viewer3D.renderer.shadowMap.autoUpdate = false;

      // Clear depth (composer's full-screen quad overwrote it)
      viewer3D.renderer.clearDepth();

      // Re-render mesh depth only (no color) so ground plane is properly occluded
      viewer3D.mesh.material.colorWrite = false;
      viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
      viewer3D.mesh.material.colorWrite = true;

      // Render ground plane with correct depth test
      viewer3D.groundPlane.visible = true;
      viewer3D.mesh.visible = false;
      viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);

      // Restore state
      viewer3D.mesh.visible = true;
      viewer3D.renderer.autoClear = true;
      viewer3D.renderer.shadowMap.autoUpdate = true;
      viewer3D.scene.background = savedBg;
    }
  } else if (viewer3D.renderer && viewer3D.scene && viewer3D.camera) {
    viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
  }
}

function loadModelToViewer(vertices, faces, faceColors) {
  if (!viewer3D.scene) return;

  // Store for raycasting
  viewer3D.vertices = vertices;
  viewer3D.faces = faces;

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

  for (let fIdx = 0; fIdx < faces.length; fIdx++) {
    const face = faces[fIdx];
    // Support both formats: face.vertices (from parser) or face as array
    const faceIndices = face.vertices || face;
    // Use per-face color if available (3MF), otherwise fall back to vertex colors
    const fColor = faceColors ? faceColors[fIdx] : null;

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

      // Colors - use per-face color when available for accurate 3MF display
      if (fColor) {
        colors.push(fColor.r, fColor.g, fColor.b);
        colors.push(fColor.r, fColor.g, fColor.b);
        colors.push(fColor.r, fColor.g, fColor.b);
      } else {
        const c0 = v0.color || new Color(0.5, 0.5, 0.5);
        const c1 = v1.color || new Color(0.5, 0.5, 0.5);
        const c2 = v2.color || new Color(0.5, 0.5, 0.5);

        colors.push(c0.r, c0.g, c0.b);
        colors.push(c1.r, c1.g, c1.b);
        colors.push(c2.r, c2.g, c2.b);
      }
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
  viewer3D.mesh.castShadow = true;

  // Rotate -90° on X to convert Z-up (3MF/STL) to Y-up (Three.js)
  viewer3D.mesh.rotation.x = -Math.PI / 2;

  viewer3D.scene.add(viewer3D.mesh);

  // Remove previous shadow ground
  if (viewer3D.groundPlane) {
    viewer3D.scene.remove(viewer3D.groundPlane);
    viewer3D.groundPlane.geometry.dispose();
    viewer3D.groundPlane.material.dispose();
    viewer3D.groundPlane = null;
  }

  // Add shadow ground plane beneath the model
  const box = new THREE.Box3().setFromObject(viewer3D.mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const groundSize = maxDim * 4;

  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.12 });
  viewer3D.groundPlane = new THREE.Mesh(groundGeo, groundMat);
  viewer3D.groundPlane.rotation.x = -Math.PI / 2;
  viewer3D.groundPlane.position.set(center.x, box.min.y, center.z);
  viewer3D.groundPlane.receiveShadow = true;
  viewer3D.groundPlane.renderOrder = 0; // Render after the mesh to ensure it appears on top
  viewer3D.scene.add(viewer3D.groundPlane);

  // Update shadow light: almost directly above for a soft contact shadow
  if (viewer3D.directionalLight) {
    viewer3D.directionalLight.position.set(center.x, center.y + maxDim * 4, center.z + maxDim * 0.5);
    viewer3D.directionalLight.target.position.copy(center);
    viewer3D.scene.add(viewer3D.directionalLight.target);
    // Very wide frustum + low-res shadow map = very blurry shadow
    const s = maxDim * 3;
    viewer3D.directionalLight.shadow.camera.left = -s;
    viewer3D.directionalLight.shadow.camera.right = s;
    viewer3D.directionalLight.shadow.camera.top = s;
    viewer3D.directionalLight.shadow.camera.bottom = -s;
    viewer3D.directionalLight.shadow.camera.far = maxDim * 10;
    viewer3D.directionalLight.shadow.camera.updateProjectionMatrix();
  }

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
  if (viewer3D.groundPlane && viewer3D.scene) {
    viewer3D.scene.remove(viewer3D.groundPlane);
    viewer3D.groundPlane.geometry.dispose();
    viewer3D.groundPlane.material.dispose();
    viewer3D.groundPlane = null;
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

function exportViewerPNG(baseName) {
  if (!viewer3D.renderer || !viewer3D.scene || !viewer3D.camera) return;

  const savedBackground = viewer3D.scene.background;
  viewer3D.scene.background = null;
  viewer3D.renderer.setClearColor(0x000000, 0);

  if (viewer3D.composer) {
    // Full render pipeline: SSAO + depth + ground plane (same as animate)
    if (viewer3D.groundPlane) viewer3D.groundPlane.visible = false;
    viewer3D.composer.render();

    if (viewer3D.groundPlane && viewer3D.mesh) {
      viewer3D.renderer.autoClear = false;
      viewer3D.renderer.shadowMap.autoUpdate = false;

      viewer3D.renderer.clearDepth();
      viewer3D.mesh.material.colorWrite = false;
      viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
      viewer3D.mesh.material.colorWrite = true;

      viewer3D.groundPlane.visible = true;
      viewer3D.mesh.visible = false;
      viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);

      viewer3D.mesh.visible = true;
      viewer3D.renderer.autoClear = true;
      viewer3D.renderer.shadowMap.autoUpdate = true;
    }
  } else {
    viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
  }

  // Capture from canvas
  const dataURL = viewer3D.renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `${baseName}.png`;
  a.click();

  // Restore
  viewer3D.scene.background = savedBackground;
  viewer3D.renderer.setClearColor(0x000000, 1);
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
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  resultViewer3D.mesh = new THREE.Mesh(geometry, material);
  resultViewer3D.mesh.renderOrder = 1;
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
