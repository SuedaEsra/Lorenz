// Renderer main application coordinator

// 1. Initialize Workers
const lorenzWorker = new Worker('lorenz-worker.js');
const canvasWorker = new Worker('canvas-worker.js');

// 2. Setup Canvases
const trailCanvas = document.getElementById('trailCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctxOverlay = overlayCanvas.getContext('2d');

let width = 800;
let height = 600;
let rotationAngle = 0;
const rotationSpeed = 0.0015;

// Theme State ('scientificInk' or 'deepSpace')
let currentTheme = 'scientificInk';

// Transfer trail canvas control to worker
const offscreen = trailCanvas.transferControlToOffscreen();
canvasWorker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);

// Resize handler
function resizeCanvases() {
  const container = document.getElementById('canvasContainer');
  width = container.clientWidth;
  height = container.clientHeight;
  
  // Update overlay canvas sizing
  overlayCanvas.width = width;
  overlayCanvas.height = height;

  // Send resize to canvas worker
  canvasWorker.postMessage({ type: 'resize', width, height });
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases(); // Initial sizing

// 3. Audio & Part setup
let part = null;
let isPlaying = false;
let latestState = { x: 0.1, y: 0.0, z: 0.0 };

function initAudioPart() {
  if (part) {
    part.dispose();
  }
  
  // Tone.Part to handle scheduled notes and visual cue updates
  part = new Tone.Part((time, event) => {
    // 1. Trigger Synth Sound if not a rest step
    if (!event.isRest) {
      AudioEngine.triggerNote(
        event.freq, 
        event.velocity, 
        event.pan, 
        AudioEngine.harmonicsLimit, 
        time
      );
    }

    // 2. Schedule visual synchronization with requestAnimationFrame (via Tone.Draw)
    Tone.Draw.schedule(() => {
      if (event.isRest) {
        document.getElementById('activeNote').innerText = '(rest)';
        document.getElementById('activeFreq').innerText = '—';
      } else {
        document.getElementById('activeNote').innerText = event.noteName;
        document.getElementById('activeFreq').innerText = `${event.freq.toFixed(1)} Hz`;
      }
      
      // Update telemetry numerical displays
      document.getElementById('valX').innerText = event.state.x.toFixed(4);
      document.getElementById('valY').innerText = event.state.y.toFixed(4);
      document.getElementById('valZ').innerText = event.state.z.toFixed(4);
      
      // Calculate speed
      const dx = parseFloat(document.getElementById('paramSigma').value) * (event.state.y - event.state.x);
      const dy = event.state.x * (parseFloat(document.getElementById('paramRho').value) - event.state.z) - event.state.y;
      const dz = event.state.x * event.state.y - parseFloat(document.getElementById('paramBeta').value) * event.state.z;
      const speed = Math.sqrt(dx*dx + dy*dy + dz*dz);
      document.getElementById('valSpeed').innerText = speed.toFixed(4);
      
    }, time);
  }, []);

  part.start(0);
}

// Coordinate projection on main thread (must match canvas-worker projection)
function project(x, y, z) {
  const cosY = Math.cos(rotationAngle);
  const sinY = Math.sin(rotationAngle);
  const rotX = x * cosY - z * sinY;
  const scale = Math.min(width, height) / 75;
  const screenX = width / 2 + rotX * scale;
  const screenY = height / 2 - (y - 25) * scale;
  return { x: screenX, y: screenY };
}

// 4. Visual overlay render loop (rAF)
function drawOverlay() {
  if (!ctxOverlay) return;

  // Clear previous frame
  ctxOverlay.clearRect(0, 0, width, height);

  // Sync rotation angle with the canvas worker
  rotationAngle += rotationSpeed;

  if (isPlaying && latestState) {
    const screenPos = project(latestState.x, latestState.y, latestState.z);

    // Draw Plotter Pen (Technical Crosshair style)
    if (currentTheme === 'scientificInk') {
      ctxOverlay.strokeStyle = '#1B2A44'; // Navy Ink
    } else {
      ctxOverlay.strokeStyle = '#8FA8D9'; // Pale Blue Space Ink
    }
    ctxOverlay.lineWidth = 1;
    
    // Crosshair lines
    ctxOverlay.beginPath();
    ctxOverlay.moveTo(screenPos.x - 15, screenPos.y);
    ctxOverlay.lineTo(screenPos.x + 15, screenPos.y);
    ctxOverlay.moveTo(screenPos.x, screenPos.y - 15);
    ctxOverlay.lineTo(screenPos.x, screenPos.y + 15);
    ctxOverlay.stroke();

    // Inner Pen Dot (Solid Amber)
    ctxOverlay.beginPath();
    ctxOverlay.arc(screenPos.x, screenPos.y, 4, 0, Math.PI * 2);
    ctxOverlay.fillStyle = '#C0763B';
    ctxOverlay.fill();

    // Outer boundary ring
    ctxOverlay.beginPath();
    ctxOverlay.arc(screenPos.x, screenPos.y, 10, 0, Math.PI * 2);
    ctxOverlay.stroke();

    // Scientific text tag following the cursor
    if (currentTheme === 'scientificInk') {
      ctxOverlay.fillStyle = 'rgba(27, 42, 68, 0.7)';
    } else {
      ctxOverlay.fillStyle = 'rgba(143, 168, 217, 0.7)';
    }
    ctxOverlay.font = '9px "JetBrains Mono", monospace';
    ctxOverlay.fillText(
      `[${latestState.x.toFixed(1)}, ${latestState.y.toFixed(1)}, ${latestState.z.toFixed(1)}]`, 
      screenPos.x + 12, 
      screenPos.y - 6
    );
  }

  requestAnimationFrame(drawOverlay);
}
requestAnimationFrame(drawOverlay);

// Receive coordinate batches from Physics Worker
lorenzWorker.onmessage = function(e) {
  if (e.data.type === 'batch') {
    const states = e.data.states;
    const notes = e.data.notes;

    // Send points to trail renderer worker
    canvasWorker.postMessage({ type: 'points', points: states });

    // Store the last state for pen overlay mapping
    if (states.length > 0) {
      latestState = states[states.length - 1];
    }

    // Schedule notes in Tone.Part
    notes.forEach(note => {
      part.add(note.time, note);
      
      // Auto-cleanup event from Tone.Part after playing to avoid memory growth
      Tone.Transport.schedule(() => {
        part.remove(note.time);
      }, note.time + 1.0);
    });
  }
};

// 5. Setup UI Bindings
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');

const paramSigma = document.getElementById('paramSigma');
const paramRho = document.getElementById('paramRho');
const paramBeta = document.getElementById('paramBeta');
const paramDt = document.getElementById('paramDt');

const scaleSelect = document.getElementById('scaleSelect');
const paramHarmonics = document.getElementById('paramHarmonics');
const paramRate = document.getElementById('paramRate');

const paramAttack = document.getElementById('paramAttack');
const paramDecay = document.getElementById('paramDecay');
const paramSustain = document.getElementById('paramSustain');
const paramRelease = document.getElementById('paramRelease');
const paramVolume = document.getElementById('paramVolume');
const paramGuard = document.getElementById('paramGuard');
const paramDrone = document.getElementById('paramDrone');
const exportWavBtn = document.getElementById('exportWavBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const visCtx = visualizerCanvas.getContext('2d');

// Helper to update text labels matching values
function updateLabels() {
  document.getElementById('lblSigma').innerText = parseFloat(paramSigma.value).toFixed(1);
  document.getElementById('lblRho').innerText = parseFloat(paramRho.value).toFixed(1);
  document.getElementById('lblBeta').innerText = parseFloat(paramBeta.value).toFixed(2);
  document.getElementById('lblDt').innerText = parseFloat(paramDt.value).toFixed(3);
  document.getElementById('lblHarmonics').innerText = paramHarmonics.value;
  
  const rateLabels = ['16n', '8n', '4n', '2n'];
  document.getElementById('lblRate').innerText = rateLabels[parseInt(paramRate.value)];
  
  document.getElementById('lblAttack').innerText = `${parseFloat(paramAttack.value).toFixed(2)}s`;
  document.getElementById('lblDecay').innerText = `${parseFloat(paramDecay.value).toFixed(2)}s`;
  document.getElementById('lblSustain').innerText = parseFloat(paramSustain.value).toFixed(1);
  document.getElementById('lblRelease').innerText = `${parseFloat(paramRelease.value).toFixed(2)}s`;
  document.getElementById('lblVolume').innerText = `${paramVolume.value} dB`;
}

// Push parameters from inputs down to workers & audio engines
function pushParameters() {
  const currentParams = {
    type: 'updateParams',
    sigma: paramSigma.value,
    rho: paramRho.value,
    beta: paramBeta.value,
    dt: paramDt.value,
    scale: scaleSelect.value,
    rate: paramRate.value
  };

  lorenzWorker.postMessage(currentParams);
  
  // Update Audio Engine values
  AudioEngine.harmonicsLimit = parseInt(paramHarmonics.value);
  AudioEngine.envelopeParams = {
    attack: parseFloat(paramAttack.value),
    decay: parseFloat(paramDecay.value),
    sustain: parseFloat(paramSustain.value),
    release: parseFloat(paramRelease.value)
  };
  AudioEngine.setVolume(parseFloat(paramVolume.value));
  AudioEngine.perfGuardEnabled = paramGuard.checked;
  AudioEngine.setDroneEnabled(paramDrone.checked);

  updateLabels();
  debouncedSaveSettings();
}

// Trigger change events on any input adjustments
const inputs = [
  paramSigma, paramRho, paramBeta, paramDt,
  scaleSelect, paramHarmonics, paramRate,
  paramAttack, paramDecay, paramSustain, paramRelease,
  paramVolume, paramGuard, paramDrone
];
inputs.forEach(input => input.addEventListener('input', pushParameters));

// Play / Pause toggle
playPauseBtn.addEventListener('click', async () => {
  if (!isPlaying) {
    // Unlock web audio context
    await Tone.start();
    initAudioPart();
    
    Tone.Transport.start();
    AudioEngine.startDrone();
    lorenzWorker.postMessage({ type: 'start', nowTime: Tone.Transport.seconds });
    
    isPlaying = true;
    playPauseBtn.innerText = 'Pause Sonification';
    playPauseBtn.classList.add('playing');
  } else {
    Tone.Transport.pause();
    AudioEngine.stopDrone();
    lorenzWorker.postMessage({ type: 'pause' });
    
    isPlaying = false;
    playPauseBtn.innerText = 'Start Sonification';
    playPauseBtn.classList.remove('playing');
  }
});

// Reset simulation
resetBtn.addEventListener('click', () => {
  lorenzWorker.postMessage({ type: 'reset' });
  canvasWorker.postMessage({ type: 'clear' });
  AudioEngine.stopDrone();
  
  // Sync worker start time if playing
  if (isPlaying) {
    lorenzWorker.postMessage({ type: 'syncTime', nowTime: Tone.Transport.seconds });
  }

  // Clear data telemetry views
  document.getElementById('activeNote').innerText = '—';
  document.getElementById('activeFreq').innerText = '0.0 Hz';
  document.getElementById('activeTrigger').innerText = '—';
});

// 6. Settings Storage
let saveTimeout = null;
function debouncedSaveSettings() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const settings = {
      sigma: paramSigma.value,
      rho: paramRho.value,
      beta: paramBeta.value,
      dt: paramDt.value,
      scale: scaleSelect.value,
      harmonics: paramHarmonics.value,
      rate: paramRate.value,
      attack: paramAttack.value,
      decay: paramDecay.value,
      sustain: paramSustain.value,
      release: paramRelease.value,
      volume: paramVolume.value,
      guard: paramGuard.checked,
      drone: paramDrone.checked,
      theme: currentTheme
    };
    await window.lorenzAPI?.saveSettings(settings);
  }, 1000);
}

async function loadSavedSettings() {
  const result = await window.lorenzAPI?.loadSettings();
  if (result?.success && result.settings) {
    const s = result.settings;
    if (s.sigma !== undefined) paramSigma.value = s.sigma;
    if (s.rho !== undefined) paramRho.value = s.rho;
    if (s.beta !== undefined) paramBeta.value = s.beta;
    if (s.dt !== undefined) paramDt.value = s.dt;
    if (s.scale !== undefined) scaleSelect.value = s.scale;
    if (s.harmonics !== undefined) paramHarmonics.value = s.harmonics;
    if (s.rate !== undefined) paramRate.value = s.rate;
    if (s.attack !== undefined) paramAttack.value = s.attack;
    if (s.decay !== undefined) paramDecay.value = s.decay;
    if (s.sustain !== undefined) paramSustain.value = s.sustain;
    if (s.release !== undefined) paramRelease.value = s.release;
    if (s.volume !== undefined) paramVolume.value = s.volume;
    if (s.guard !== undefined) paramGuard.checked = s.guard;
    if (s.drone !== undefined) paramDrone.checked = s.drone;
    
    // Apply loaded theme
    if (s.theme !== undefined) {
      applyTheme(s.theme);
    }
  }
  pushParameters();
}

// 7. Theme Switching Mechanism
function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'deepSpace') {
    document.body.classList.add('theme-space');
    themeToggleBtn.innerText = '🌙 Space';
  } else {
    document.body.classList.remove('theme-space');
    themeToggleBtn.innerText = '☀ Ink';
  }
  
  // Notify Canvas Worker
  canvasWorker.postMessage({ type: 'theme', theme: theme });
}

themeToggleBtn.addEventListener('click', () => {
  const targetTheme = currentTheme === 'scientificInk' ? 'deepSpace' : 'scientificInk';
  applyTheme(targetTheme);
  debouncedSaveSettings();
});

// 8. Waveform Oscilloscope Drawing Loop
function drawWaveform() {
  requestAnimationFrame(drawWaveform);
  
  const visWidth = visualizerCanvas.clientWidth;
  const visHeight = visualizerCanvas.clientHeight;
  
  // Handle dynamically changing canvas dimensions
  if (visualizerCanvas.width !== visWidth || visualizerCanvas.height !== visHeight) {
    visualizerCanvas.width = visWidth;
    visualizerCanvas.height = visHeight;
  }
  
  visCtx.clearRect(0, 0, visWidth, visHeight);
  
  if (!AudioEngine.analyser) return;
  const values = AudioEngine.analyser.getValue();
  
  visCtx.lineWidth = 1.5;
  visCtx.lineCap = 'round';
  visCtx.lineJoin = 'round';
  
  if (currentTheme === 'scientificInk') {
    visCtx.strokeStyle = '#1B2A44'; // Navy Ink
    visCtx.shadowBlur = 0;
  } else {
    visCtx.strokeStyle = '#C0763B'; // Glowing Amber in Deep Space
    visCtx.shadowColor = '#C0763B';
    visCtx.shadowBlur = 6;
  }
  
  visCtx.beginPath();
  const sliceWidth = visWidth / values.length;
  let x = 0;
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const y = (v + 1) * visHeight / 2;
    
    if (i === 0) {
      visCtx.moveTo(x, y);
    } else {
      visCtx.lineTo(x, y);
    }
    
    x += sliceWidth;
  }
  
  visCtx.stroke();
  visCtx.shadowBlur = 0; // Reset
}
requestAnimationFrame(drawWaveform);

// 9. WAV Session Export
exportWavBtn.addEventListener('click', async () => {
  exportWavBtn.disabled = true;
  exportWavBtn.innerText = 'Rendering Audio...';
  
  const progressBar = document.getElementById('exportProgress');
  const progressFill = progressBar.querySelector('.progress-fill');
  progressBar.classList.remove('hidden');
  progressFill.style.width = '20%';

  try {
    const params = {
      sigma: paramSigma.value,
      rho: paramRho.value,
      beta: paramBeta.value,
      dt: paramDt.value,
      scale: scaleSelect.value,
      harmonics: paramHarmonics.value,
      rate: paramRate.value,
      envelope: {
        attack: parseFloat(paramAttack.value),
        decay: parseFloat(paramDecay.value),
        sustain: parseFloat(paramSustain.value),
        release: parseFloat(paramRelease.value)
      }
    };

    // Render 15 seconds offline
    progressFill.style.width = '50%';
    const wavBytes = await AudioEngine.exportWav(15.0, params);
    
    progressFill.style.width = '80%';
    const result = await window.lorenzAPI?.exportSessionAsWav(wavBytes);
    
    if (result?.success) {
      progressFill.style.width = '100%';
      setTimeout(() => {
        alert(`Session exported successfully to:\n${result.filePath}`);
      }, 100);
    }
  } catch (error) {
    console.error(error);
    alert('Export failed: ' + error.message);
  } finally {
    exportWavBtn.disabled = false;
    exportWavBtn.innerText = 'Render & Export as WAV';
    setTimeout(() => {
      progressBar.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 2000);
  }
});

// 10. Custom native menu callback listeners
window.lorenzAPI?.onMenuAction((action) => {
  switch (action) {
    case 'new-session':
      resetBtn.click();
      break;
    
    case 'reset-defaults':
      paramSigma.value = 10.0;
      paramRho.value = 28.0;
      paramBeta.value = 2.67;
      paramDt.value = 0.008;
      scaleSelect.value = 'minorPentatonic';
      paramHarmonics.value = 6;
      paramRate.value = 1;
      paramAttack.value = 0.05;
      paramDecay.value = 0.15;
      paramSustain.value = 0.6;
      paramRelease.value = 0.8;
      paramVolume.value = -12;
      paramGuard.checked = true;
      paramDrone.checked = true;
      pushParameters();
      break;
      
    case 'randomize-params':
      // Randomize Lorenz variables to discover unique chaos shapes
      paramSigma.value = (Math.random() * 20 + 5).toFixed(1);
      paramRho.value = (Math.random() * 40 + 10).toFixed(1);
      paramBeta.value = (Math.random() * 3.5 + 0.5).toFixed(2);
      pushParameters();
      break;
      
    case 'export-audio-trigger':
      exportWavBtn.click();
      break;
  }
});

// 11. Auto-Updater listener interface
const updateNotification = document.getElementById('updateNotification');
const restartBtn = document.getElementById('restartBtn');

window.lorenzAPI?.onUpdateStatus((status) => {
  switch (status.state) {
    case 'available':
      updateNotification.classList.remove('hidden');
      updateNotification.querySelector('.toast-message').innerText = `Update Available: v${status.version}`;
      break;
      
    case 'downloading':
      updateNotification.querySelector('.toast-message').innerText = `Downloading Update: ${Math.round(status.percent)}%`;
      break;
      
    case 'downloaded':
      updateNotification.classList.remove('hidden');
      updateNotification.querySelector('.toast-message').innerText = 'New Update Ready!';
      restartBtn.classList.remove('hidden');
      break;
      
    case 'error':
      console.warn('Auto updater encountered an error:', status.message);
      break;
  }
});

restartBtn.addEventListener('click', () => {
  window.lorenzAPI?.restartAndUpdate();
});

// 12. Audio Engine CPU throttled listener
document.addEventListener('lorenz:cpu-throttled', (e) => {
  const warningPanel = document.getElementById('perfGuardWarning');
  if (e.detail.throttled) {
    warningPanel.classList.remove('hidden');
  } else {
    warningPanel.classList.add('hidden');
  }
});

// Debug statistics UI reporting
document.addEventListener('lorenz:debug-stats', (e) => {
  document.getElementById('statVoices').innerText = `${e.detail.activeVoices} / 8`;
  document.getElementById('statOscillators').innerText = `${e.detail.totalOscs} / 64`;
  document.getElementById('statTick').innerText = `${e.detail.tickOverhead.toFixed(2)}ms`;
});

// Start initialization
AudioEngine.init();
loadSavedSettings();
if (window.lorenzAPI) {
  window.lorenzAPI.getAppVersion().then(v => {
    document.getElementById('appVersion').innerText = `v${v}`;
  });
}
