// ============================================================================
// Color Picker - Raycasting for 3D model color selection
// ============================================================================

let colorPickerRaycaster = null;
let colorPickerMouse = null;
let colorPickerInitialized = false;
let mouseDownPos = { x: 0, y: 0 };
const DRAG_THRESHOLD = 5; // pixels

function initColorPicker() {
  // Only initialize once to prevent multiple event listeners
  if (colorPickerInitialized) return;

  colorPickerRaycaster = new THREE.Raycaster();
  colorPickerMouse = new THREE.Vector2();

  const renderer = getViewerRenderer();
  if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('pointerdown', onViewerMouseDown);
    renderer.domElement.addEventListener('click', onViewerClick);
    renderer.domElement.style.cursor = 'crosshair';
    colorPickerInitialized = true;
  }
}

function onViewerMouseDown(event) {
  mouseDownPos.x = event.clientX;
  mouseDownPos.y = event.clientY;
}

function onViewerClick(event) {
  // Check if mouse moved too much (camera was dragged)
  const dx = event.clientX - mouseDownPos.x;
  const dy = event.clientY - mouseDownPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  console.log("distance > DRAG_THRESHOLD", distance, DRAG_THRESHOLD, mouseDownPos, event.clientX, event.clientY);

  if (distance > DRAG_THRESHOLD) {
    return; // It was a drag, not a click
  }

  const renderer = getViewerRenderer();
  const camera = getViewerCamera();
  const mesh = getViewerMesh();

  if (!renderer || !camera || !mesh) return;

  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();

  // Calculate mouse position in normalized device coordinates
  colorPickerMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  colorPickerMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Perform raycasting
  colorPickerRaycaster.setFromCamera(colorPickerMouse, camera);
  const intersects = colorPickerRaycaster.intersectObject(mesh);

  if (intersects.length > 0) {
    const intersection = intersects[0];
    const color = extractColorFromIntersection(intersection);

    if (color) {
      const added = addColorToPalette(color);
      if (added) {
        showPickFeedback(event.clientX, event.clientY, color);
        console.log(`Picked color: ${color.toHex()}`);
      }
    }
  }
}

function extractColorFromIntersection(intersection) {
  const mesh = getViewerMesh();
  if (!mesh) return null;

  const geometry = mesh.geometry;
  const colorAttribute = geometry.getAttribute('color');

  if (!colorAttribute) return null;

  // Get the face index (for non-indexed geometry, face index = floor(a / 3))
  const faceIndex = intersection.faceIndex;
  if (faceIndex === undefined) return null;

  // Get the triangle vertex indices
  const a = faceIndex * 3;
  const b = faceIndex * 3 + 1;
  const c = faceIndex * 3 + 2;

  // Get colors of the three vertices
  const colors = [
    new Color(colorAttribute.getX(a), colorAttribute.getY(a), colorAttribute.getZ(a)),
    new Color(colorAttribute.getX(b), colorAttribute.getY(b), colorAttribute.getZ(b)),
    new Color(colorAttribute.getX(c), colorAttribute.getY(c), colorAttribute.getZ(c))
  ];

  // Use barycentric coordinates to interpolate color at the exact intersection point
  const bary = intersection.uv ? intersection.uv : { x: 0.33, y: 0.33 };

  // If we have barycentric coordinates in the intersection, use them
  // Otherwise, use the closest vertex color based on the face
  if (intersection.face) {
    // For a more accurate pick, we can use the closest vertex or the dominant color
    // Here we'll use the closest vertex based on barycentric interpolation
    const point = intersection.point;
    const positionAttribute = geometry.getAttribute('position');

    // Get vertex positions
    const v0 = new THREE.Vector3(
      positionAttribute.getX(a),
      positionAttribute.getY(a),
      positionAttribute.getZ(a)
    );
    const v1 = new THREE.Vector3(
      positionAttribute.getX(b),
      positionAttribute.getY(b),
      positionAttribute.getZ(b)
    );
    const v2 = new THREE.Vector3(
      positionAttribute.getX(c),
      positionAttribute.getY(c),
      positionAttribute.getZ(c)
    );

    // Transform to world space
    v0.applyMatrix4(mesh.matrixWorld);
    v1.applyMatrix4(mesh.matrixWorld);
    v2.applyMatrix4(mesh.matrixWorld);

    // Find closest vertex
    const d0 = point.distanceTo(v0);
    const d1 = point.distanceTo(v1);
    const d2 = point.distanceTo(v2);

    if (d0 <= d1 && d0 <= d2) {
      return colors[0];
    } else if (d1 <= d2) {
      return colors[1];
    } else {
      return colors[2];
    }
  }

  // Default: return the first vertex color
  return colors[0];
}

function showPickFeedback(x, y, color) {
  // Create a visual feedback element
  const feedback = document.createElement('div');
  feedback.className = 'pick-feedback';
  feedback.style.left = `${x}px`;
  feedback.style.top = `${y}px`;
  feedback.style.backgroundColor = color.toHex();
  document.body.appendChild(feedback);

  // Animate and remove
  requestAnimationFrame(() => {
    feedback.classList.add('animate');
    setTimeout(() => {
      feedback.remove();
    }, 500);
  });
}
