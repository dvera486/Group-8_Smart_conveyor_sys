// main.js
let scene, camera, renderer, conveyor, boxes = [], boxCount = 0;
let speed = 10.0, baseSpeed = 10.0;
let userRunning = true; // controlled by Start/Stop
let overloaded = false; // true when load hits/exceeds maxLoadKg
let activeInputFactor = 'speed';
let computeSelectionKey = 'speed';
const boxWidth = 1, boxHeight = 1, boxDepth = 1;
let boxWeightKg = 0.5;
let totalWeightKg = 0.0;
const maxLoadKg = 20.0;
let beltLength = 40; // Make belt much longer

// References to belt components so we can adjust belt length dynamically.
let beltTexture;
let leftRail, rightRail, frameBeam;
let tunnelTop, leftWall, rightWall, rearPost;
let entryCurtain, exitCurtain;
let legs = [];
let lastFrameTimeMs = null;

function showResultModal({ title, subtitle, rows }) {
  const overlay = document.getElementById('result-modal-overlay');
  if (!overlay) return;

  const titleEl = document.getElementById('result-modal-title');
  if (titleEl) titleEl.textContent = title ?? '';

  const subtitleEl = document.getElementById('result-modal-subtitle');
  if (subtitleEl) subtitleEl.textContent = subtitle ?? '';

  const rowsEl = document.getElementById('result-modal-rows');
  if (rowsEl) rowsEl.innerHTML = '';

  if (rowsEl && Array.isArray(rows)) {
    for (const r of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';

      const labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = r.label ?? '';

      const valueEl = document.createElement('span');
      valueEl.className = 'value';
      valueEl.textContent = r.value ?? '';

      rowEl.appendChild(labelEl);
      rowEl.appendChild(valueEl);
      rowsEl.appendChild(rowEl);
    }
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
}

function showTravelModal({ timeSec, boxSpeedMps, beltLengthM }) {
  // Compute all factor values; selected factor is shown last.
  const distanceM = beltLengthM;
  const speedMps = (timeSec > 0) ? (distanceM / timeSec) : boxSpeedMps;
  const massKg = Math.max(boxWeightKg, 1e-6); // use single-box mass for formula outputs

  const factorRows = {
    speed: { label: 'Speed', value: `${speedMps.toFixed(3)} m/s` },
    length: { label: 'Belt length', value: `${distanceM.toFixed(3)} m` },
    time: { label: 'Time', value: `${timeSec.toFixed(3)} s` },
    weight: { label: 'Box weight', value: `${massKg.toFixed(3)} kg` }
  };

  const orderedKeys = ['speed', 'length', 'time', 'weight']
    .filter((k) => k !== computeSelectionKey)
    .concat(computeSelectionKey);
  const rows = orderedKeys.map((k) => factorRows[k]);

  showResultModal({
    title: 'Box Travel Results',
    subtitle: `Computed focus: ${factorRows[computeSelectionKey]?.label ?? 'Speed'}`,
    rows
  });
}

function updateBeltLength(newLength) {
  // Allow input handler to call freely without throwing.
  if (!Number.isFinite(newLength) || newLength <= 0) return;
  if (!scene) return; // init() not run yet

  const prevLength = beltLength;
  if (newLength === prevLength) return;

  beltLength = newLength;
  const base = 40; // matches the initial belt length in this project
  const ratio = beltLength / base;

  // Scale belt + rails + top frame
  if (conveyor) conveyor.scale.x = ratio;
  if (leftRail) leftRail.scale.x = ratio;
  if (rightRail) rightRail.scale.x = ratio;
  if (frameBeam) frameBeam.scale.x = ratio;

  // Adjust stripe repetition so it stays proportional to belt length
  if (beltTexture && beltTexture.repeat) {
    // Default belt length in this app is 40, which uses repeat=10.
    const base = 40;
    beltTexture.repeat.set(10 * (beltLength / base), 1);
    beltTexture.needsUpdate = true;
  }

  // Update tunnel/curtain positions based on the belt length
  const tunnelLength = 10;
  const tunnelThickness = 0.2;

  if (tunnelTop) tunnelTop.position.x = -beltLength / 4;
  if (leftWall) leftWall.position.x = -beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2;
  if (rightWall) rightWall.position.x = -beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2;
  if (rearPost) rearPost.position.x = -beltLength / 4 + tunnelLength / 2 - tunnelThickness / 2;
  if (entryCurtain) entryCurtain.position.x = -beltLength / 4 - tunnelLength / 2 + tunnelThickness;
  if (exitCurtain) exitCurtain.position.x = -beltLength / 4 + tunnelLength / 2 - tunnelThickness;

  // Rebuild support legs so they match the new length.
  for (const leg of legs) scene.remove(leg);
  legs = [];

  const railOffsetZ = 1.1;
  const legGeometry = new THREE.BoxGeometry(0.4, 1.2, 0.4);
  const legMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });
  const legSpacing = 8;

  for (let x = -beltLength / 2 + 2; x <= beltLength / 2 - 2; x += legSpacing) {
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(x, -1.6, -railOffsetZ);
    scene.add(leftLeg);
    legs.push(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(x, -1.6, railOffsetZ);
    scene.add(rightLeg);
    legs.push(rightLeg);
  }

  // Remove boxes so their spawn/movement bounds match the new belt dimensions.
  const wasRunning = userRunning;
  removeAllBoxes();
  userRunning = wasRunning;
}

function init() {
  scene = new THREE.Scene();
  legs = []; // clear any previous belt legs (in case init() is called again)
  // Slightly grey ambient to feel more like an indoor factory
  scene.background = new THREE.Color(0x555555);
  // Responsive sizing
  const container = document.getElementById('scene-container');
  container.style.width = '100vw';
  container.style.height = '80vh';
  const width = container.offsetWidth || window.innerWidth;
  const height = container.offsetHeight || window.innerHeight * 0.8;
  camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 100);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  // Conveyor belt (longer)
  const beltGeometry = new THREE.BoxGeometry(beltLength, 0.5, 2);

  // Create a striped material so the belt looks like it moves
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 32;
  const stripeCtx = stripeCanvas.getContext('2d');

  // Draw alternating dark/light stripes along the X direction
  stripeCtx.fillStyle = '#333333';
  stripeCtx.fillRect(0, 0, stripeCanvas.width, stripeCanvas.height);
  stripeCtx.fillStyle = '#555555';
  const stripeWidth = 16;
  for (let x = 0; x < stripeCanvas.width; x += stripeWidth * 2) {
    stripeCtx.fillRect(x, 0, stripeWidth, stripeCanvas.height);
  }

  beltTexture = new THREE.CanvasTexture(stripeCanvas);
  beltTexture.wrapS = THREE.RepeatWrapping;
  beltTexture.wrapT = THREE.RepeatWrapping;
  beltTexture.repeat.set(10, 1);

  const beltMaterial = new THREE.MeshPhongMaterial({ map: beltTexture });
  conveyor = new THREE.Mesh(beltGeometry, beltMaterial);
  conveyor.position.y = -1;
  scene.add(conveyor);

  // Conveyor machine structure: side rails and support legs
  const sideRailHeight = 0.6;
  const sideRailThickness = 0.1;
  const railOffsetZ = 1.1;

  const railGeometry = new THREE.BoxGeometry(beltLength, sideRailHeight, sideRailThickness);
  const railMaterial = new THREE.MeshPhongMaterial({ color: 0x777777 });

  leftRail = new THREE.Mesh(railGeometry, railMaterial);
  leftRail.position.set(0, -0.5 + sideRailHeight / 2, -railOffsetZ);
  scene.add(leftRail);

  rightRail = new THREE.Mesh(railGeometry, railMaterial);
  rightRail.position.set(0, -0.5 + sideRailHeight / 2, railOffsetZ);
  scene.add(rightRail);

  // Support legs along the length
  const legGeometry = new THREE.BoxGeometry(0.4, 1.2, 0.4);
  const legMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });
  const legSpacing = 8;
  for (let x = -beltLength / 2 + 2; x <= beltLength / 2 - 2; x += legSpacing) {
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(x, -1.6, -railOffsetZ);
    scene.add(leftLeg);
    legs.push(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(x, -1.6, railOffsetZ);
    scene.add(rightLeg);
    legs.push(rightLeg);
  }

  // Simple factory framing above the belt
  const frameBeamGeometry = new THREE.BoxGeometry(beltLength + 2, 0.2, 0.3);
  frameBeam = new THREE.Mesh(frameBeamGeometry, legMaterial);
  frameBeam.position.set(0, 2, 0);
  scene.add(frameBeam);

  // Airport-style scanning box around the belt
  const tunnelLength = 10;
  const tunnelHeight = 3;
  const tunnelWidth = 3;
  const tunnelThickness = 0.2;
  const tunnelMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });

  // Top of tunnel
  const tunnelTopGeom = new THREE.BoxGeometry(tunnelLength, tunnelThickness, tunnelWidth);
  tunnelTop = new THREE.Mesh(tunnelTopGeom, tunnelMaterial);
  tunnelTop.position.set(-beltLength / 4, 1.0, 0);
  scene.add(tunnelTop);

  // Two side walls
  const tunnelSideGeom = new THREE.BoxGeometry(tunnelThickness, tunnelHeight, tunnelWidth);
  leftWall = new THREE.Mesh(tunnelSideGeom, tunnelMaterial);
  leftWall.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2, 0.0, -tunnelWidth / 2);
  scene.add(leftWall);

  rightWall = new THREE.Mesh(tunnelSideGeom, tunnelMaterial);
  rightWall.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2, 0.0, tunnelWidth / 2);
  scene.add(rightWall);

  // Rear support post to visually close the box
  const rearPostGeom = new THREE.BoxGeometry(tunnelThickness, tunnelHeight, tunnelWidth);
  rearPost = new THREE.Mesh(rearPostGeom, tunnelMaterial);
  rearPost.position.set(-beltLength / 4 + tunnelLength / 2 - tunnelThickness / 2, 0.0, 0);
  scene.add(rearPost);

  // Curtain-like flaps at both ends (slightly transparent dark material)
  const curtainMaterial = new THREE.MeshPhongMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.6
  });
  const curtainWidth = 1.8;
  const curtainHeight = 2.2;
  const curtainThickness = 0.02;
  const curtainGeom = new THREE.BoxGeometry(curtainWidth, curtainHeight, curtainThickness);

  // Entry curtain
  entryCurtain = new THREE.Mesh(curtainGeom, curtainMaterial);
  entryCurtain.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness, 0.1, 0);
  scene.add(entryCurtain);

  // Exit curtain
  exitCurtain = new THREE.Mesh(curtainGeom, curtainMaterial);
  exitCurtain.position.set(-beltLength / 4 + tunnelLength / 2 - tunnelThickness, 0.1, 0);
  scene.add(exitCurtain);

  // Factory floor under the conveyor
  const floorSize = 80;
  const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const floorCtx = floorCanvas.getContext('2d');

  // Base concrete color
  floorCtx.fillStyle = '#2e2e2e';
  floorCtx.fillRect(0, 0, floorCanvas.width, floorCanvas.height);

  // Grid lines for tiles
  floorCtx.strokeStyle = '#3b3b3b';
  floorCtx.lineWidth = 2;
  const tile = 32;
  for (let x = 0; x <= floorCanvas.width; x += tile) {
    floorCtx.beginPath();
    floorCtx.moveTo(x, 0);
    floorCtx.lineTo(x, floorCanvas.height);
    floorCtx.stroke();
  }
  for (let y = 0; y <= floorCanvas.height; y += tile) {
    floorCtx.beginPath();
    floorCtx.moveTo(0, y);
    floorCtx.lineTo(floorCanvas.width, y);
    floorCtx.stroke();
  }

  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(4, 4);

  const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTexture });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.26;
  scene.add(floor);

  // Lighting
  const light = new THREE.PointLight(0xffffff, 1);
  light.position.set(0, 10, 10);
  scene.add(light);

  camera.position.set(0, 5, 15);
  camera.lookAt(0, 0, 0);

  animate();
}

function addBox() {
  const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
  const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
  const box = new THREE.Mesh(geometry, material);

  // Always spawn at the same starting point at the beginning of the belt
  // Box.position.x is the CENTER of the box. We want the box's leading edge
  // to start exactly at the belt start (so travel distance ~= beltLength).
  const startX = -beltLength / 2 - 0.5;
  box.position.set(startX, 0, 0);
  box.userData.travelStartMs = performance.now();
  box.userData.startX = startX; // meters in this simulator (same units as beltLength)
  scene.add(box);
  boxes.push(box);
  boxCount++;
  totalWeightKg = boxCount * boxWeightKg;
  updateSpeed();
  updateLabels();
}

function removeBox() {
  if (boxes.length > 0) {
    const box = boxes.pop();
    scene.remove(box);
    boxCount--;
    totalWeightKg = boxCount * boxWeightKg;
    updateSpeed();
    updateLabels();
  }
}

function updateSpeed() {
  // Slow down based on total kilograms on the belt (simple load vs motor model)
  const loadRatio = Math.min(totalWeightKg / maxLoadKg, 1.0);

  if (loadRatio >= 1.0) {
    // Overloaded: conveyor comes to a complete stop
    speed = 0.0;
    overloaded = true;
  } else {
    overloaded = false;
    // Physics-style: user-entered desired speed becomes the actual motor speed.
    // Load only affects the conveyor when it is fully overloaded (speed -> 0).
    speed = baseSpeed;
  }
}

function updateLabels() {
  document.getElementById('speed').textContent = `Speed: ${speed.toFixed(2)}`;
  document.getElementById('boxCount').textContent = `Boxes: ${boxCount}`;
  document.getElementById('weight').textContent = `Weight: ${totalWeightKg.toFixed(2)} kg`;
  const boxInfoEl = document.getElementById('boxInfo');
  if (boxInfoEl) boxInfoEl.textContent = `(Each box weight: ${boxWeightKg.toFixed(2)} kg)`;
}

function removeAllBoxes() {
  for (const box of boxes) {
    scene.remove(box);
  }
  boxes = [];
  boxCount = 0;
  totalWeightKg = 0.0;
  overloaded = false;
  userRunning = true;
  updateSpeed();
  updateLabels();
}

function restartSystem() {
  removeAllBoxes();
  // Reset base dynamic state
  speed = baseSpeed;
  userRunning = true;
  overloaded = false;
  updateLabels();
}

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const prevFrameMs = lastFrameTimeMs;
  const dtMs = (prevFrameMs === null) ? 0 : Math.max(0, (nowMs - prevFrameMs));
  const dtSec = (dtMs === 0) ? 0 : dtMs / 1000;
  lastFrameTimeMs = nowMs;

  if (userRunning) {
    let removedAny = false;
    const endX = beltLength / 2 - 0.5;

    // Move boxes forward and remove them when they reach the end
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      const prevX = box.position.x;
      // Physics units: x is in meters and speed is treated as m/s.
      const nextX = prevX + speed * dtSec;
      box.position.x = nextX;

      // Endpoint detection with linear interpolation so travel-time math stays accurate.
      // We consider the box reached when its center crosses `endX`.
      if (prevX <= endX && nextX > endX) {
        // Measure travel time from spawn -> endpoint.
        const startMs = box.userData.travelStartMs;
        const travelTimeSec = startMs ? ((prevFrameMs + dtMs * ((endX - prevX) / (nextX - prevX))) - startMs) / 1000 : 0;
        const startX = box.userData.startX ?? (-beltLength / 2 + 0.5);
        const traveledMeters = Math.max(0, beltLength - 0); // definition used by spawn/end geometry
        const boxSpeedMps = (travelTimeSec > 0) ? (traveledMeters / travelTimeSec) : 0;

        scene.remove(box);
        boxes.splice(i, 1);
        boxCount--;
        removedAny = true;

        // Show modal with the results for this box.
        showTravelModal({
          timeSec: travelTimeSec,
          boxSpeedMps,
          beltLengthM: beltLength
        });
      }
    }

    if (removedAny) {
      totalWeightKg = boxCount * boxWeightKg;
      updateSpeed();
      updateLabels();
    }

    // Animate conveyor texture so it looks like it is moving,
    // even when there are no boxes on it.
    if (conveyor.material && conveyor.material.map) {
      // Speed factor scaled down so visual movement looks reasonable
      conveyor.material.map.offset.x -= speed * dtSec * 0.12;
    }
  }

  renderer.render(scene, camera);
}

// Controls
window.onload = () => {
    // Handle window resize
    window.addEventListener('resize', () => {
      const container = document.getElementById('scene-container');
      const width = container.offsetWidth || window.innerWidth;
      const height = container.offsetHeight || window.innerHeight * 0.8;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
  init();
  lastFrameTimeMs = null;

  // Input factor selector (only one input is editable at a time)
  const baseSpeedInput = document.getElementById('baseSpeedInput');
  const beltLengthInput = document.getElementById('beltLengthInput');
  const travelTimeInput = document.getElementById('travelTimeInput');
  const boxWeightInput = document.getElementById('boxWeightInput');
  const computeSelect = document.getElementById('computeSelect');

  const speedInputRow = document.getElementById('speedInputRow');
  const lengthInputRow = document.getElementById('lengthInputRow');
  const timeInputRow = document.getElementById('timeInputRow');
  const weightInputRow = document.getElementById('weightInputRow');

  activeInputFactor = (document.querySelector('input[name="inputFactor"]:checked')?.value) || 'speed';

  function setInputFactor(factor) {
    activeInputFactor = factor;

    if (speedInputRow) speedInputRow.style.display = (factor === 'speed') ? 'flex' : 'none';
    if (lengthInputRow) lengthInputRow.style.display = (factor === 'length') ? 'flex' : 'none';
    if (timeInputRow) timeInputRow.style.display = (factor === 'time') ? 'flex' : 'none';
    if (weightInputRow) weightInputRow.style.display = (factor === 'weight') ? 'flex' : 'none';

    if (baseSpeedInput) baseSpeedInput.disabled = factor !== 'speed';
    if (beltLengthInput) beltLengthInput.disabled = factor !== 'length';
    if (travelTimeInput) travelTimeInput.disabled = factor !== 'time';
    if (boxWeightInput) boxWeightInput.disabled = factor !== 'weight';
  }

  setInputFactor(activeInputFactor);

  // Keep track of the last user-provided time input (even when not the active row).
  let desiredTravelTimeSec = Number.isFinite(parseFloat(String(travelTimeInput?.value ?? '').trim()))
    ? parseFloat(String(travelTimeInput?.value ?? '').trim())
    : NaN;
  let suppressTimeHandler = false;

  function applyComputedTarget() {
    // The target is selected by the dropdown.
    const target = computeSelectionKey;

    // If the user wants speed computed: v = d / t
    if (target === 'speed') {
      if (Number.isFinite(desiredTravelTimeSec) && desiredTravelTimeSec > 0) {
        baseSpeed = beltLength / desiredTravelTimeSec;
        if (baseSpeedInput) baseSpeedInput.value = baseSpeed.toFixed(2);
        updateSpeed();
        updateLabels();
      }
      return;
    }

    // If the user wants belt length computed: d = v * t
    if (target === 'length') {
      if (Number.isFinite(desiredTravelTimeSec) && desiredTravelTimeSec > 0 && Number.isFinite(baseSpeed) && baseSpeed >= 0) {
        const newLen = baseSpeed * desiredTravelTimeSec;
        if (beltLengthInput) beltLengthInput.value = String(newLen.toFixed(3));
        updateBeltLength(newLen);
      }
      return;
    }

    // If the user wants time computed: t = d / v
    if (target === 'time') {
      if (Number.isFinite(baseSpeed) && baseSpeed > 0) {
        const t = beltLength / baseSpeed;
        desiredTravelTimeSec = t;
        if (travelTimeInput) {
          suppressTimeHandler = true;
          travelTimeInput.value = t.toFixed(3);
          suppressTimeHandler = false;
        }
      }
      return;
    }

    // If the user wants box weight computed: not derivable from the other three in this simulator.
    // (We keep it here so the dropdown remains symmetric with the radio choices.)
    if (target === 'weight') return;
  }

  const radios = document.querySelectorAll('input[name="inputFactor"]');
  for (const radio of radios) {
    radio.addEventListener('change', () => setInputFactor(radio.value));
  }

  // Which extra quantity to show in the results modal
  if (computeSelect) {
    computeSelectionKey = computeSelect.value ?? 'speed';
    computeSelect.addEventListener('change', () => {
      computeSelectionKey = computeSelect.value ?? 'speed';
      applyComputedTarget();
    });
  }

  // Desired speed input (base motor speed)
  if (baseSpeedInput) {
    const setBaseSpeedFromInput = () => {
      if (activeInputFactor !== 'speed') return;

      const raw = String(baseSpeedInput.value).trim();
      if (raw === '') return;

      const requested = parseFloat(raw);
      if (!Number.isFinite(requested) || requested < 0) {
        baseSpeedInput.value = baseSpeed.toFixed(1);
        return;
      }

      baseSpeed = requested;
      updateSpeed();
      updateLabels();
      applyComputedTarget();
    };

    setBaseSpeedFromInput(); // initialize if speed is active
    baseSpeedInput.addEventListener('change', setBaseSpeedFromInput);
    baseSpeedInput.addEventListener('input', setBaseSpeedFromInput);
  }

  // Belt length input (rescales belt/rails/tunnel)
  if (beltLengthInput) {
    const setBeltLengthFromInput = () => {
      if (activeInputFactor !== 'length') return;

      const raw = String(beltLengthInput.value).trim();
      if (raw === '') return;

      const requested = parseFloat(raw);
      if (!Number.isFinite(requested) || requested <= 0) return;

      updateBeltLength(requested);
      applyComputedTarget();
    };

    setBeltLengthFromInput(); // initialize if length is active
    beltLengthInput.addEventListener('change', setBeltLengthFromInput);
    beltLengthInput.addEventListener('input', setBeltLengthFromInput);
  }

  // Travel time input: compute the required speed (m/s) = beltLength / time(s)
  if (travelTimeInput) {
    const setSpeedFromTravelTime = () => {
      if (activeInputFactor !== 'time') return;

      const raw = String(travelTimeInput.value).trim();
      if (raw === '') return;

      const requestedTimeSec = parseFloat(raw);
      if (suppressTimeHandler) return;
      if (!Number.isFinite(requestedTimeSec) || requestedTimeSec <= 0) return;
      desiredTravelTimeSec = requestedTimeSec;

      // If the user is directly editing the time row, keep existing behavior:
      // compute speed from length/time.
      baseSpeed = beltLength / requestedTimeSec;
      if (baseSpeedInput) baseSpeedInput.value = baseSpeed.toFixed(2);

      updateSpeed();
      updateLabels();
      applyComputedTarget();
    };

    setSpeedFromTravelTime(); // initialize if time is active
    travelTimeInput.addEventListener('change', setSpeedFromTravelTime);
    travelTimeInput.addEventListener('input', setSpeedFromTravelTime);
  }

  // Box weight input: affects load on the belt
  if (boxWeightInput) {
    const setBoxWeightFromInput = () => {
      if (activeInputFactor !== 'weight') return;

      const raw = String(boxWeightInput.value).trim();
      if (raw === '') return;

      const requestedWeightKg = parseFloat(raw);
      if (!Number.isFinite(requestedWeightKg) || requestedWeightKg <= 0) return;

      boxWeightKg = requestedWeightKg;
      totalWeightKg = boxCount * boxWeightKg;
      updateSpeed();
      updateLabels();
      applyComputedTarget();
    };

    setBoxWeightFromInput(); // initialize if weight is active
    boxWeightInput.addEventListener('change', setBoxWeightFromInput);
    boxWeightInput.addEventListener('input', setBoxWeightFromInput);
  }

  document.getElementById('addBox').onclick = addBox;
  document.getElementById('removeBox').onclick = removeBox;
  document.getElementById('start').onclick = () => { userRunning = true; };
  document.getElementById('stop').onclick = () => { userRunning = false; };
  document.getElementById('removeAll').onclick = removeAllBoxes;
  document.getElementById('restart').onclick = restartSystem;

  const closeBtn = document.getElementById('result-modal-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      const overlay = document.getElementById('result-modal-overlay');
      if (!overlay) return;
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    };
  }
  updateLabels();
};
