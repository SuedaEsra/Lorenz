// Audio Engine (Emergency Reset to Reference Code)

let audioReady = false;
let masterVol, reverb, delay;

function buildAudioGraph() {
  masterVol = new Tone.Volume(-16).toDestination();
  reverb = new Tone.Reverb({ decay: 4.5, wet: 0.35 });
  delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.18 });
  delay.connect(masterVol);
  reverb.connect(delay);
  reverb.connect(masterVol);
  audioReady = true;
}

function playHarmonicNote(freq, velocity, pan, brightness, numHarmonics, now) {
  // Additive synthesis: stack true harmonic partials of the fundamental
  const partialGain = new Tone.Gain(1).connect(reverb);
  const panner = new Tone.Panner(pan).connect(partialGain);
  const dur = 0.9 + Math.random() * 0.6;

  for (let h = 1; h <= numHarmonics; h++) {
    const isOdd = h % 2 === 1;
    const mixWeight = isOdd ? brightness : (1 - brightness);
    const amp = (velocity / h) * (0.35 + 0.65 * mixWeight) * (h === 1 ? 1 : 0.6);
    if (amp < 0.008) continue;

    const osc = new Tone.Oscillator({ frequency: freq * h, type: 'sine' });
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.015 + h * 0.004,
      decay: dur * 0.4,
      sustain: 0.15,
      release: dur * 0.6
    }).connect(panner);

    osc.connect(env);
    osc.start(now);
    env.triggerAttackRelease(dur, now);

    const stopAt = now + dur + 1.2;
    osc.stop(stopAt);

    const g = new Tone.Gain(amp).connect(panner);
    env.disconnect();
    env.connect(g);
    g.connect(panner);

    Tone.Transport.scheduleOnce(() => {
      osc.dispose(); env.dispose(); g.dispose();
    }, stopAt + 0.1);
  }

  Tone.Transport.scheduleOnce(() => {
    panner.dispose(); partialGain.dispose();
  }, now + dur + 1.5);
}

const AudioEngine = {
  harmonicsLimit: 10,
  envelopeParams: {
    attack: 0.05,
    decay: 0.15,
    sustain: 0.6,
    release: 0.8
  },
  perfGuardEnabled: true,
  brightness: 0.5,

  init() {
    console.log("AudioEngine initialized.");
  },

  setVolume(db) {
    if (masterVol) {
      masterVol.volume.setValueAtTime(db, Tone.now());
    }
  },

  setDroneEnabled(enabled) {
    // Empty to satisfy app.js
  },

  startDrone() {
    // Empty to satisfy app.js
  },

  stopDrone() {
    // Empty to satisfy app.js
  },

  triggerNote(freq, velocity, pan, harmonicsCount, time) {
    if (!audioReady) {
      buildAudioGraph();
    }
    playHarmonicNote(freq, velocity, pan, this.brightness, harmonicsCount, time);
  },

  // Export session to raw WAV file bytes (offline renderer)
  async exportWav(duration, params) {
    const buffer = await Tone.Offline(async (context) => {
      let offlineState = { x: 0.1, y: 0.0, z: 0.0 };
      const sigma = parseFloat(params.sigma);
      const rho = parseFloat(params.rho);
      const beta = parseFloat(params.beta);
      const dt = parseFloat(params.dt);
      const scale = params.scale;
      const rateIndex = parseInt(params.rate);
      const harmonicsCount = parseInt(params.harmonics);

      let noteDuration = 0.25;
      if (rateIndex === 0) noteDuration = 0.125;
      if (rateIndex === 2) noteDuration = 0.5;
      if (rateIndex === 3) noteDuration = 1.0;

      const stepsPerNote = Math.round(360 * noteDuration);

      const SCALES = {
        minorPentatonic: [36, 39, 41, 43, 46, 48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72, 75, 77, 79, 82, 84, 87, 89, 91, 94],
        majorPentatonic: [36, 38, 40, 43, 45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93],
        dorian: [38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84],
        phrygian: [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86],
        chromatic: Array.from({length: 48}, (_, i) => i + 36),
        overtone: [36, 48, 55, 60, 64, 67, 70, 72, 74, 76, 78, 80, 82, 84]
      };

      const scaleArr = SCALES[scale] || SCALES.minorPentatonic;

      // Offline Audio Graph
      const offMasterVol = new Tone.Volume(-16).toDestination();
      const offReverb = new Tone.Reverb({ decay: 4.5, wet: 0.35 });
      const offDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.18 });
      
      // Connect offline graph
      offDelay.connect(offMasterVol);
      offReverb.connect(offDelay);
      offReverb.connect(offMasterVol);

      let time = 0;
      while (time < duration) {
        // Run RK4 steps
        for (let s = 0; s < stepsPerNote; s++) {
          const f = (val) => ({
            dx: sigma * (val.y - val.x),
            dy: val.x * (rho - val.z) - val.y,
            dz: val.x * val.y - beta * val.z
          });
          const k1 = f(offlineState);
          const k2 = f({ x: offlineState.x + dt/2*k1.dx, y: offlineState.y + dt/2*k1.dy, z: offlineState.z + dt/2*k1.dz });
          const k3 = f({ x: offlineState.x + dt/2*k2.dx, y: offlineState.y + dt/2*k2.dy, z: offlineState.z + dt/2*k2.dz });
          const k4 = f({ x: offlineState.x + dt*k3.dx,   y: offlineState.y + dt*k3.dy,   z: offlineState.z + dt*k3.dz });
          
          offlineState = {
            x: offlineState.x + dt/6*(k1.dx + 2*k2.dx + 2*k3.dx + k4.dx),
            y: offlineState.y + dt/6*(k1.dy + 2*k2.dy + 2*k3.dy + k4.dy),
            z: offlineState.z + dt/6*(k1.dz + 2*k2.dz + 2*k3.dz + k4.dz)
          };
        }

        let pan = Math.max(-1, Math.min(1, offlineState.x / 20));
        
        // Reverted to linear velocity
        const dx = sigma * (offlineState.y - offlineState.x);
        const dy = offlineState.x * (rho - offlineState.z) - offlineState.y;
        const dz = offlineState.x * offlineState.y - beta * offlineState.z;
        const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let velocity = Math.max(0.3, Math.min(1.0, 0.3 + (speed / 150) * 0.7));
        
        let normZ = Math.max(0, Math.min(1, offlineState.z / 50));
        const noteIdx = Math.floor(normZ * (scaleArr.length - 1));
        const midiNote = scaleArr[noteIdx];
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

        // Schedule offline note
        const partialGain = new Tone.Gain(1).connect(offReverb);
        const panner = new Tone.Panner(pan).connect(partialGain);
        const dur = 0.9 + Math.random() * 0.6;
        const brightness = 0.5;

        for (let h = 1; h <= harmonicsCount; h++) {
          const isOdd = h % 2 === 1;
          const mixWeight = isOdd ? brightness : (1 - brightness);
          const amp = (velocity / h) * (0.35 + 0.65 * mixWeight) * (h === 1 ? 1 : 0.6);
          if (amp < 0.008) continue;

          const osc = new Tone.Oscillator({ frequency: freq * h, type: 'sine' });
          const env = new Tone.AmplitudeEnvelope({
            attack: 0.015 + h * 0.004,
            decay: dur * 0.4,
            sustain: 0.15,
            release: dur * 0.6
          }).connect(panner);

          osc.connect(env);
          osc.start(time);
          env.triggerAttackRelease(dur, time);
          osc.stop(time + dur + 1.2);

          const g = new Tone.Gain(amp).connect(panner);
          env.disconnect();
          env.connect(g);
          g.connect(panner);
        }

        time += noteDuration;
      }
    }, duration);

    return bufferToWav(buffer);
  }
};

// Encode standard AudioBuffer into raw WAV bytes
function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(v, off, str) {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(off + i, str.charCodeAt(i));
    }
  }

  // Write RIFF header
  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;
  view.setUint16(pos, numOfChan, true); pos += 2;
  view.setUint32(pos, sampleRate, true); pos += 4;
  view.setUint32(pos, sampleRate * numOfChan * 2, true); pos += 4;
  view.setUint16(pos, numOfChan * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return bufferArr;
}
