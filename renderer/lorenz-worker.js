// Lorenz Attractor Physics Worker (RK4 Integration & Simple Mappings)

let state = { x: 0.1, y: 0.0, z: 0.0 }; // Initial seed

let sigma = 10.0;
let rho = 28.0;
let beta = 8/3;
let dt = 0.008;
let stepsPerFrame = 6;

let isRunning = false;
let timerId = null;

// Scale definitions (MIDI values)
const SCALES = {
  minorPentatonic: [
    36, 39, 41, 43, 46,  // Octave 1
    48, 51, 53, 55, 58,  // Octave 2
    60, 63, 65, 67, 70,  // Octave 3
    72, 75, 77, 79, 82,  // Octave 4
    84, 87, 89, 91, 94   // Octave 5
  ],
  majorPentatonic: [
    36, 38, 40, 43, 45,
    48, 50, 52, 55, 57,
    60, 62, 64, 67, 69,
    72, 74, 76, 79, 81,
    84, 86, 88, 91, 93
  ],
  dorian: [
    38, 40, 41, 43, 45, 47, 48,
    50, 52, 53, 55, 57, 59, 60,
    62, 64, 65, 67, 69, 71, 72,
    74, 76, 77, 79, 81, 83, 84
  ],
  phrygian: [
    40, 41, 43, 45, 47, 48, 50,
    52, 53, 55, 57, 59, 60, 62,
    64, 65, 67, 69, 71, 72, 74,
    76, 77, 79, 81, 83, 84, 86
  ],
  chromatic: [
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
    48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
    60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
    72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83
  ],
  overtone: [
    36, 48, 55, 60, 64, 67, 70, 72, 74, 76, 78, 80, 82, 84
  ]
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midiNumber) {
  const noteIndex = midiNumber % 12;
  const octave = Math.floor(midiNumber / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function midiToFreq(midiNumber) {
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

// RK4 integration step
function rk4StepExact(s, stepSize) {
  const f = (stateVal) => ({
    dx: sigma * (stateVal.y - stateVal.x),
    dy: stateVal.x * (rho - stateVal.z) - stateVal.y,
    dz: stateVal.x * stateVal.y - beta * stateVal.z
  });
  const k1 = f(s);
  const k2 = f({ x: s.x + stepSize/2*k1.dx, y: s.y + stepSize/2*k1.dy, z: s.z + stepSize/2*k1.dz });
  const k3 = f({ x: s.x + stepSize/2*k2.dx, y: s.y + stepSize/2*k2.dy, z: s.z + stepSize/2*k2.dz });
  const k4 = f({ x: s.x + stepSize*k3.dx,   y: s.y + stepSize*k3.dy,   z: s.z + stepSize*k3.dz });
  return {
    x: s.x + stepSize/6*(k1.dx + 2*k2.dx + 2*k3.dx + k4.dx),
    y: s.y + stepSize/6*(k1.dy + 2*k2.dy + 2*k3.dy + k4.dy),
    z: s.z + stepSize/6*(k1.dz + 2*k2.dz + 2*k3.dz + k4.dz)
  };
}

let batchStartTime = 0;
const batchDuration = 0.5; // 500ms data chunks
const frameRate = 60;
const framesPerBatch = Math.round(batchDuration * frameRate);

let currentScale = 'minorPentatonic';
let rateIndex = 1; // Default 8n

function getFramesPerNote() {
  switch (rateIndex) {
    case 0: return 7.5; // 16n
    case 2: return 30;  // 4n
    case 3: return 60;  // 2n
    case 1:
    default:
      return 15;        // 8n
  }
}

let frameCounter = 0;

function generateBatch() {
  const states = [];
  const notes = [];
  const framesPerNote = getFramesPerNote();

  for (let i = 0; i < framesPerBatch; i++) {
    // Advance physics state by stepsPerFrame
    for (let s = 0; s < stepsPerFrame; s++) {
      state = rk4StepExact(state, dt);
    }
    
    // Prevent numerical blowout
    if (isNaN(state.x) || isNaN(state.y) || isNaN(state.z) || 
        Math.abs(state.x) > 500 || Math.abs(state.y) > 500 || Math.abs(state.z) > 500) {
      state = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: Math.random() * 20 + 10 };
    }

    states.push({ x: state.x, y: state.y, z: state.z });

    // Check note triggers
    const nextFrameIndex = frameCounter + i;
    const currentNoteIndex = Math.floor(nextFrameIndex / framesPerNote);
    const prevNoteIndex = Math.floor((nextFrameIndex - 1) / framesPerNote);

    if (currentNoteIndex > prevNoteIndex) {
      const timeOffset = i / frameRate;
      const absoluteTime = batchStartTime + timeOffset;

      // Calculate speed
      const dx = sigma * (state.y - state.x);
      const dy = state.x * (rho - state.z) - state.y;
      const dz = state.x * state.y - beta * state.z;
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Pan: x: [-20, 20] -> [-1, 1]
      let pan = state.x / 20;
      pan = Math.max(-1, Math.min(1, pan));

      // Reverted to linear velocity
      let velocity = 0.3 + (speed / 150) * 0.7;
      velocity = Math.max(0.3, Math.min(1.0, velocity));

      // Pitch Mapping: z -> scale degree
      const scaleArr = SCALES[currentScale] || SCALES.minorPentatonic;
      let normZ = state.z / 50;
      normZ = Math.max(0, Math.min(1, normZ));
      const noteIdx = Math.floor(normZ * (scaleArr.length - 1));
      const midiNote = scaleArr[noteIdx];
      const freq = midiToFreq(midiNote);
      const noteName = midiToNoteName(midiNote);

      notes.push({
        time: absoluteTime,
        freq: freq,
        velocity: velocity,
        pan: pan,
        noteName: noteName,
        state: { x: state.x, y: state.y, z: state.z }
      });
    }
  }

  // Push batch data
  postMessage({
    type: 'batch',
    states: states,
    notes: notes,
    batchStartTime: batchStartTime
  });

  // Increment counters
  batchStartTime += batchDuration;
  frameCounter += framesPerBatch;
}

function start() {
  if (isRunning) return;
  isRunning = true;
  timerId = setInterval(() => {
    if (isRunning) generateBatch();
  }, batchDuration * 1000 - 50);
}

function pause() {
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

onmessage = function(e) {
  const data = e.data;
  switch (data.type) {
    case 'start':
      batchStartTime = data.nowTime + 0.1;
      start();
      break;
      
    case 'pause':
      pause();
      break;
      
    case 'reset':
      state = { x: 0.1, y: 0.0, z: 0.0 };
      frameCounter = 0;
      break;
      
    case 'updateParams':
      if (data.sigma !== undefined) sigma = parseFloat(data.sigma);
      if (data.rho !== undefined) rho = parseFloat(data.rho);
      if (data.beta !== undefined) beta = parseFloat(data.beta);
      if (data.dt !== undefined) dt = parseFloat(data.dt);
      if (data.scale !== undefined) currentScale = data.scale;
      if (data.rate !== undefined) rateIndex = parseInt(data.rate);
      break;
      
    case 'syncTime':
      if (Math.abs(batchStartTime - data.nowTime) > 1.0) {
        batchStartTime = data.nowTime + 0.1;
      }
      break;
  }
};
