/**
 * Sound notification service for CafeFlow Admin & POS
 * Generates synthetic audio chimes using the Web Audio API without external audio file dependencies.
 */

let sharedAudioCtx: AudioContext | null = null;
let isUnlocked = false;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
};

/**
 * Attaches a one-time click/touch listener to unlock browser audio restrictions.
 */
export const initAudioUnlock = () => {
  if (typeof window === 'undefined' || isUnlocked) return;

  const unlockHandler = () => {
    const ctx = getAudioContext();
    if (ctx) {
      ctx.resume().then(() => {
        isUnlocked = true;
        window.removeEventListener('click', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
      }).catch(() => {});
    }
  };

  window.addEventListener('click', unlockHandler, { once: true, passive: true });
  window.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
  window.addEventListener('keydown', unlockHandler, { once: true, passive: true });
};

/**
 * Plays a pleasant, loud chime (D5 -> A5 -> D6) when a customer scans and places an order or appends items.
 */
export const playOrderChime = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);

    // Tone 3: 1174.66 Hz (D6)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1174.66, now + 0.24);
    gain3.gain.setValueAtTime(0.4, now + 0.24);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.24);
    osc3.stop(now + 0.65);
  } catch (err) {
    console.warn('[Audio Alert] Audio playback not permitted by browser yet:', err);
  }
};

/**
 * Plays a bell alert tone for bill or waiter requests.
 */
export const playBellAlert = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.15); // E6

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    console.warn('[Audio Alert] Bell playback not permitted yet:', err);
  }
};

/**
 * Plays a high-impact commercial kitchen buzzer alarm (triple sharp pulses) to alert cooks and staff of new orders.
 */
export const playKitchenBuzzer = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pulses = [
      { start: 0.00, end: 0.22, freq: 880 },
      { start: 0.32, end: 0.54, freq: 880 },
      { start: 0.64, end: 0.90, freq: 1046.50 }, // C6 high alert
    ];

    pulses.forEach(({ start, end, freq }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Rich buzzer texture (sawtooth + square harmonic)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.55, now + start);
      gain.gain.exponentialRampToValueAtTime(0.01, now + end);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + end);
    });
  } catch (err) {
    console.warn('[Kitchen Buzzer] Audio playback not permitted yet:', err);
  }
};
