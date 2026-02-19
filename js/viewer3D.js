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
  // Custom AO pipeline (works with logarithmicDepthBuffer)
  beautyRT: null,
  aoRT: null,
  aoMaterial: null,
  fxaaMaterial: null,
  fsQuad: null,
  fsScene: null,
  fsCamera: null,
  aoEnabled: true,
  aoDebug: false,
  shadowEnabled: true
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
  viewer3D.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true, logarithmicDepthBuffer: true });
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
  directionalLight.shadow.mapSize.width = 256;
  directionalLight.shadow.mapSize.height = 256;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  directionalLight.shadow.radius = 100;
  directionalLight.shadow.bias = -0.0001;
  viewer3D.scene.add(directionalLight);
  viewer3D.directionalLight = directionalLight;

  // Custom AO pipeline (compatible with logarithmicDepthBuffer)
  const ssW = width * 2, ssH = height * 2;

  // Beauty render target with depth texture
  viewer3D.beautyRT = new THREE.WebGLRenderTarget(ssW, ssH, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
  });
  viewer3D.beautyRT.depthTexture = new THREE.DepthTexture();
  viewer3D.beautyRT.depthTexture.type = THREE.UnsignedIntType;

  // AO output render target
  viewer3D.aoRT = new THREE.WebGLRenderTarget(ssW, ssH, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
  });

  // Full-screen quad for post-processing passes
  viewer3D.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  viewer3D.fsScene = new THREE.Scene();
  viewer3D.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  viewer3D.fsScene.add(viewer3D.fsQuad);

  // AO shader material (handles log depth natively)
  viewer3D.aoMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: viewer3D.beautyRT.depthTexture },
      cameraFar: { value: 1000.0 },
      resolution: { value: new THREE.Vector2(ssW, ssH) },
      kernelRadius: { value: 20.0 },
      aoStrength: { value: 0.7 },
      minDistance: { value: 0.001 },
      maxDistance: { value: 100.1 },
      proj00: { value: 1.0 },
      proj11: { value: 1.0 },
      aoDebug: { value: 0.0 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      '#define NUM_DIRS 12',
      '#define NUM_STEPS 3',
      'uniform sampler2D tDiffuse;',
      'uniform sampler2D tDepth;',
      'uniform float cameraFar;',
      'uniform vec2 resolution;',
      'uniform float kernelRadius;',
      'uniform float aoStrength;',
      'uniform float minDistance;',
      'uniform float maxDistance;',
      'uniform float proj00;',
      'uniform float proj11;',
      'uniform float aoDebug;',
      'varying vec2 vUv;',
      '',
      'float logDepthToViewZ(float d) {',
      '  return 1.0 - pow(2.0, d * log2(cameraFar + 1.0));',
      '}',
      '',
      'vec3 viewPosAt(vec2 uv) {',
      '  float d = texture2D(tDepth, uv).x;',
      '  if (d >= 1.0) return vec3(0.0, 0.0, 1.0);',
      '  float vz = logDepthToViewZ(d);',
      '  vec2 ndc = (uv - 0.5) * 2.0;',
      '  return vec3(ndc.x * (-vz) / proj00, ndc.y * (-vz) / proj11, vz);',
      '}',
      '',
      'float hash12(vec2 p) {',
      '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
      '  p3 += dot(p3, p3.yzx + 33.33);',
      '  return fract((p3.x + p3.y) * p3.z);',
      '}',
      '',
      'void main() {',
      '  vec4 color = texture2D(tDiffuse, vUv);',
      '  float d = texture2D(tDepth, vUv).x;',
      '  if (d >= 1.0) {',
      '    gl_FragColor = (aoDebug > 0.5) ? vec4(1.0) : color;',
      '    return;',
      '  }',
      '',
      '  vec3 pos = viewPosAt(vUv);',
      '  vec2 texel = 1.0 / resolution;',
      '',
      '  // Bilateral normal reconstruction',
      '  vec3 posL = viewPosAt(vUv - vec2(texel.x, 0.0));',
      '  vec3 posR = viewPosAt(vUv + vec2(texel.x, 0.0));',
      '  vec3 posD = viewPosAt(vUv - vec2(0.0, texel.y));',
      '  vec3 posU = viewPosAt(vUv + vec2(0.0, texel.y));',
      '  vec3 dx = (abs(posR.z - pos.z) < abs(posL.z - pos.z)) ? (posR - pos) : (pos - posL);',
      '  vec3 dy = (abs(posU.z - pos.z) < abs(posD.z - pos.z)) ? (posU - pos) : (pos - posD);',
      '  vec3 normal = normalize(cross(dx, dy));',
      '',
      '  float ao = 0.0;',
      '  float total = 0.0;',
      '  float rnd = hash12(gl_FragCoord.xy);',
      '  float angleStep = 6.283185 / float(NUM_DIRS);',
      '',
      '  for (int i = 0; i < NUM_DIRS; i++) {',
      '    float angle = (float(i) + rnd) * angleStep;',
      '    vec2 dir = vec2(cos(angle), sin(angle));',
      '    for (int j = 1; j <= NUM_STEPS; j++) {',
      '      float t = float(j) / float(NUM_STEPS);',
      '      vec2 sampleUv = vUv + dir * t * kernelRadius * texel;',
      '      if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) { total += 1.0; continue; }',
      '      vec3 sp = viewPosAt(sampleUv);',
      '      if (sp.z > -0.001) { total += 1.0; continue; }',
      '      vec3 diff = sp - pos;',
      '      float dist = length(diff);',
      '      if (dist < minDistance || dist > maxDistance) { total += 1.0; continue; }',
      '      ao += max(0.0, dot(normal, normalize(diff)));',
      '      total += 1.0;',
      '    }',
      '  }',
      '',
      '  if (total > 0.0) ao /= total;',
      '  float occlusion = clamp(1.0 - ao * aoStrength, 0.0, 1.0);',
      '  if (aoDebug > 0.5) {',
      '    gl_FragColor = vec4(vec3(occlusion), 1.0);',
      '  } else {',
      '    gl_FragColor = vec4(color.rgb * occlusion, color.a);',
      '  }',
      '}'
    ].join('\n'),
    depthWrite: false,
    depthTest: false
  });

  // FXAA material
  viewer3D.fxaaMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms),
    vertexShader: THREE.FXAAShader.vertexShader,
    fragmentShader: THREE.FXAAShader.fragmentShader,
    depthWrite: false,
    depthTest: false
  });
  viewer3D.fxaaMaterial.uniforms['resolution'].value.set(1.0 / ssW, 1.0 / ssH);

  // AO toggle button
  viewer3D.aoEnabled = true;
  const toggleAoBtn = document.getElementById('toggleAoBtn');
  if (toggleAoBtn) {
    toggleAoBtn.addEventListener('click', () => {
      viewer3D.aoEnabled = !viewer3D.aoEnabled;
      toggleAoBtn.classList.toggle('active', viewer3D.aoEnabled);
    });
  }

  // Shadow toggle button
  viewer3D.shadowEnabled = true;
  const toggleShadowBtn = document.getElementById('toggleShadowBtn');
  if (toggleShadowBtn) {
    toggleShadowBtn.addEventListener('click', () => {
      viewer3D.shadowEnabled = !viewer3D.shadowEnabled;
      toggleShadowBtn.classList.toggle('active', viewer3D.shadowEnabled);
    });
  }

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

  const ssW = width * 2, ssH = height * 2;
  if (viewer3D.beautyRT) viewer3D.beautyRT.setSize(ssW, ssH);
  if (viewer3D.aoRT) viewer3D.aoRT.setSize(ssW, ssH);
  if (viewer3D.aoMaterial) viewer3D.aoMaterial.uniforms.resolution.value.set(ssW, ssH);
  if (viewer3D.fxaaMaterial) viewer3D.fxaaMaterial.uniforms['resolution'].value.set(1.0 / ssW, 1.0 / ssH);
}

function animate() {
  viewer3D.animationId = requestAnimationFrame(animate);

  if (viewer3D.controls) {
    viewer3D.controls.update();
  }

  if (viewer3D.beautyRT && viewer3D.renderer && viewer3D.scene && viewer3D.camera) {
    renderViewerPipeline(viewer3D.scene.background);
  } else if (viewer3D.renderer && viewer3D.scene && viewer3D.camera) {
    viewer3D.renderer.render(viewer3D.scene, viewer3D.camera);
  }
}

function renderViewerPipeline(background) {
  const r = viewer3D.renderer;
  const scene = viewer3D.scene;
  const camera = viewer3D.camera;

  // Temporarily set scene background (null = transparent for PNG export)
  const savedBg = scene.background;
  scene.background = background;

  // Step 1: Render scene to beautyRT (with depth) — hide ground so AO only affects mesh
  if (viewer3D.groundPlane) viewer3D.groundPlane.visible = false;
  r.setRenderTarget(viewer3D.beautyRT);
  r.setClearColor(background || 0x000000, background ? 1 : 0);
  r.clear();
  r.render(scene, camera);

  // Step 2: AO pass (beautyRT → aoRT or direct to screen if no FXAA)
  if (viewer3D.aoEnabled) {
    const ao = viewer3D.aoMaterial;
    ao.uniforms.tDiffuse.value = viewer3D.beautyRT.texture;
    ao.uniforms.cameraFar.value = camera.far;
    ao.uniforms.proj00.value = camera.projectionMatrix.elements[0];
    ao.uniforms.proj11.value = camera.projectionMatrix.elements[5];
    ao.uniforms.aoDebug.value = viewer3D.aoDebug ? 1.0 : 0.0;
    viewer3D.fsQuad.material = ao;
    r.setRenderTarget(viewer3D.aoRT);
    r.render(viewer3D.fsScene, viewer3D.fsCamera);
  } else {
    // No AO: copy beauty to aoRT
    // Just use beautyRT directly in FXAA step
  }

  // Step 3: FXAA pass → screen
  const source = viewer3D.aoEnabled ? viewer3D.aoRT : viewer3D.beautyRT;
  viewer3D.fxaaMaterial.uniforms['tDiffuse'].value = source.texture;
  viewer3D.fsQuad.material = viewer3D.fxaaMaterial;
  r.setRenderTarget(null);
  r.setClearColor(0x000000, background ? 1 : 0);
  r.clear();
  r.render(viewer3D.fsScene, viewer3D.fsCamera);

  // Step 4: Ground plane overlay with shadow (no AO, correct depth occlusion)
  if (viewer3D.shadowEnabled && viewer3D.groundPlane && viewer3D.mesh) {
    viewer3D.groundPlane.visible = true;
    scene.background = null; // No background for overlay pass
    r.autoClear = false;
    r.shadowMap.autoUpdate = false;

    // Clear depth and re-render mesh depth only (no color) for occlusion
    r.clearDepth();
    viewer3D.mesh.material.colorWrite = false;
    r.render(scene, camera);
    viewer3D.mesh.material.colorWrite = true;

    // Render ground plane with correct depth test
    viewer3D.mesh.visible = false;
    r.render(scene, camera);

    // Restore
    viewer3D.mesh.visible = true;
    r.autoClear = true;
    r.shadowMap.autoUpdate = true;
  }

  // Restore scene background
  scene.background = savedBg;
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
    const s = maxDim * 6;
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

  // Tighten near/far planes for better depth precision (avoids z-fighting without logarithmic depth)
  // viewer3D.camera.near = cameraZ * 0.01;
  viewer3D.camera.far = cameraZ * 20;
  viewer3D.camera.updateProjectionMatrix();

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

  // Render full pipeline with transparent background
  renderViewerPipeline(null);

  // Capture from canvas
  const dataURL = viewer3D.renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `${baseName}.png`;
  a.click();
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
  resultViewer3D.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
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
    side: THREE.FrontSide,
    transparent: true,
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
