// main.js
let scene, camera, renderer, conveyor, boxes = [], boxCount = 0;
let speed = 10.0, baseSpeed = 10.0;
let userRunning = true; // controlled by Start/Stop
let overloaded = false; // true when load hits/exceeds maxLoadKg
const boxWidth = 1, boxHeight = 1, boxDepth = 1;
const boxWeightKg = 0.5;
let totalWeightKg = 0.0;
const maxLoadKg = 20.0;
let beltLength = 40; // Make belt much longer

function init() {
  scene = new THREE.Scene();
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

  const beltTexture = new THREE.CanvasTexture(stripeCanvas);
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

  const leftRail = new THREE.Mesh(railGeometry, railMaterial);
  leftRail.position.set(0, -0.5 + sideRailHeight / 2, -railOffsetZ);
  scene.add(leftRail);

  const rightRail = new THREE.Mesh(railGeometry, railMaterial);
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

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(x, -1.6, railOffsetZ);
    scene.add(rightLeg);
  }

  // Simple factory framing above the belt
  const frameBeamGeometry = new THREE.BoxGeometry(beltLength + 2, 0.2, 0.3);
  const frameBeam = new THREE.Mesh(frameBeamGeometry, legMaterial);
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
  const tunnelTop = new THREE.Mesh(tunnelTopGeom, tunnelMaterial);
  tunnelTop.position.set(-beltLength / 4, 1.0, 0);
  scene.add(tunnelTop);

  // Two side walls
  const tunnelSideGeom = new THREE.BoxGeometry(tunnelThickness, tunnelHeight, tunnelWidth);
  const leftWall = new THREE.Mesh(tunnelSideGeom, tunnelMaterial);
  leftWall.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2, 0.0, -tunnelWidth / 2);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(tunnelSideGeom, tunnelMaterial);
  rightWall.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness / 2, 0.0, tunnelWidth / 2);
  scene.add(rightWall);

  // Rear support post to visually close the box
  const rearPostGeom = new THREE.BoxGeometry(tunnelThickness, tunnelHeight, tunnelWidth);
  const rearPost = new THREE.Mesh(rearPostGeom, tunnelMaterial);
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
  const entryCurtain = new THREE.Mesh(curtainGeom, curtainMaterial);
  entryCurtain.position.set(-beltLength / 4 - tunnelLength / 2 + tunnelThickness, 0.1, 0);
  scene.add(entryCurtain);

  // Exit curtain
  const exitCurtain = new THREE.Mesh(curtainGeom, curtainMaterial);
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
  const startX = -beltLength / 2 + 0.5;
  box.position.set(startX, 0, 0);
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
    // Linearly reduce speed with load
    const unloadedSpeed = baseSpeed;
    const effectiveSpeed = unloadedSpeed * (1.0 - loadRatio);

    // Quantize low-end speeds so we pass through 0.75, 0.50, 0.25 before 0
    if (effectiveSpeed <= 0.25) {
      speed = 0.25;
    } else if (effectiveSpeed <= 0.5) {
      speed = 0.5;
    } else if (effectiveSpeed <= 0.75) {
      speed = 0.75;
    } else if (effectiveSpeed <= 1.0) {
      speed = 1.0;
    } else {
      speed = effectiveSpeed;
    }
  }
}

function updateLabels() {
  document.getElementById('speed').textContent = `Speed: ${speed.toFixed(2)}`;
  document.getElementById('boxCount').textContent = `Boxes: ${boxCount}`;
  document.getElementById('weight').textContent = `Weight: ${totalWeightKg.toFixed(2)} kg`;
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
  if (userRunning) {
    let removedAny = false;
    const endX = beltLength / 2 - 0.5;

    // Move boxes forward and remove them when they reach the end
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      box.position.x += speed * 0.01;

      if (box.position.x > endX) {
        scene.remove(box);
        boxes.splice(i, 1);
        boxCount--;
        removedAny = true;
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
      conveyor.material.map.offset.x -= speed * 0.002;
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
  document.getElementById('addBox').onclick = addBox;
  document.getElementById('removeBox').onclick = removeBox;
  document.getElementById('start').onclick = () => { userRunning = true; };
  document.getElementById('stop').onclick = () => { userRunning = false; };
  document.getElementById('removeAll').onclick = removeAllBoxes;
  document.getElementById('restart').onclick = restartSystem;
  updateLabels();
};
