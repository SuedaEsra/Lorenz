// OffscreenCanvas Trail Worker (High Performance Rendering)

let canvas = null;
let ctx = null;

// Ring buffer arrays for 2400 points
const MAX_POINTS = 2400;
const trailX = new Float32Array(MAX_POINTS);
const trailY = new Float32Array(MAX_POINTS);
const trailZ = new Float32Array(MAX_POINTS);
let head = 0;
let count = 0;

// Render options
let width = 800;
let height = 600;
let rotationAngle = 0;
const rotationSpeed = 0.0015; // Slow elegant spin in 3D

// Theme State ('scientificInk' or 'deepSpace')
let currentTheme = 'scientificInk';

// Add points to circular buffer
function addPoints(points) {
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    trailX[head] = pt.x;
    trailY[head] = pt.y;
    trailZ[head] = pt.z;
    head = (head + 1) % MAX_POINTS;
    count = Math.min(count + 1, MAX_POINTS);
  }
}

// 3D rotation and orthographic projection mapping
// Maps 3D points to 2D screen coordinates
function project(x, y, z) {
  // Rotate around Y-axis
  const cosY = Math.cos(rotationAngle);
  const sinY = Math.sin(rotationAngle);
  const rotX = x * cosY - z * sinY;
  const scale = Math.min(width, height) / 75;
  const screenX = width / 2 + rotX * scale;
  const screenY = height / 2 - (y - 25) * scale; // Y is height, Z is depth

  return { x: screenX, y: screenY };
}

// Draw the grid background on canvas
function drawGrid() {
  if (currentTheme === 'scientificInk') {
    ctx.strokeStyle = 'rgba(27, 42, 68, 0.05)'; // Cream Grid
  } else {
    ctx.strokeStyle = 'rgba(143, 168, 217, 0.06)'; // Deep space grid
  }
  
  ctx.lineWidth = 1;
  const gridSize = 40;
  
  ctx.beginPath();
  for (let x = 0; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

// Visual drawing loop
function render() {
  if (!canvas || !ctx) return;

  // Slow rotation increment
  rotationAngle += rotationSpeed;

  // Clear background matching theme
  if (currentTheme === 'scientificInk') {
    ctx.fillStyle = '#F1EEE3'; // Cream Paper
  } else {
    ctx.fillStyle = '#0B0F1A'; // Deep Space Black
  }
  ctx.fillRect(0, 0, width, height);

  // Draw engineering background grid
  drawGrid();

  if (count < 2) {
    requestAnimationFrame(render);
    return;
  }

  let startIdx = count === MAX_POINTS ? head : 0;

  if (currentTheme === 'scientificInk') {
    // 1. Scientific Ink Draw (Plain pen-plotter line, no glow)
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    let p = project(trailX[startIdx], trailY[startIdx], trailZ[startIdx]);
    ctx.moveTo(p.x, p.y);

    for (let i = 1; i < count; i++) {
      const idx = (startIdx + i) % MAX_POINTS;
      p = project(trailX[idx], trailY[idx], trailZ[idx]);
      ctx.lineTo(p.x, p.y);
    }

    // Gradient from Navy body to Amber lead
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1B2A44');    // Deep Navy
    gradient.addColorStop(0.85, '#1B2A44'); // Muted Navy body
    gradient.addColorStop(1, '#C0763B');    // Amber head

    ctx.strokeStyle = gradient;
    ctx.stroke();
  } else {
    // 2. Deep Space Draw (85% flat tail, 15% glowing head for peak performance)
    const tailCount = Math.floor(count * 0.85);
    const headCount = count - tailCount;

    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw Tail (Flat, fading)
    if (tailCount > 1) {
      ctx.beginPath();
      let p = project(trailX[startIdx], trailY[startIdx], trailZ[startIdx]);
      ctx.moveTo(p.x, p.y);

      for (let i = 1; i < tailCount; i++) {
        const idx = (startIdx + i) % MAX_POINTS;
        p = project(trailX[idx], trailY[idx], trailZ[idx]);
        ctx.lineTo(p.x, p.y);
      }
      
      ctx.strokeStyle = 'rgba(143, 168, 217, 0.4)';
      ctx.stroke();
    }

    // Draw Head (Glowing, lighter composite)
    if (headCount > 1) {
      const headStartIdx = (startIdx + tailCount - 1) % MAX_POINTS;
      
      ctx.beginPath();
      let p = project(trailX[headStartIdx], trailY[headStartIdx], trailZ[headStartIdx]);
      ctx.moveTo(p.x, p.y);

      for (let i = 0; i < headCount; i++) {
        const idx = (headStartIdx + i) % MAX_POINTS;
        p = project(trailX[idx], trailY[idx], trailZ[idx]);
        ctx.lineTo(p.x, p.y);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      // Glow settings
      ctx.shadowColor = '#8FA8D9';
      ctx.shadowBlur = 8;
      
      // Gradient: space blue to amber at the head
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#8FA8D9');
      gradient.addColorStop(0.7, '#8FA8D9');
      gradient.addColorStop(1, '#C0763B'); // Amber
      
      ctx.strokeStyle = gradient;
      ctx.stroke();
      ctx.restore();
    }
  }

  requestAnimationFrame(render);
}

onmessage = function(e) {
  const data = e.data;
  switch (data.type) {
    case 'init':
      canvas = data.canvas;
      ctx = canvas.getContext('2d');
      width = canvas.width;
      height = canvas.height;
      requestAnimationFrame(render);
      break;

    case 'resize':
      if (canvas) {
        canvas.width = data.width;
        canvas.height = data.height;
        width = data.width;
        height = data.height;
      }
      break;

    case 'points':
      addPoints(data.points);
      break;

    case 'clear':
      count = 0;
      head = 0;
      break;

    case 'theme':
      currentTheme = data.theme;
      break;
  }
};
