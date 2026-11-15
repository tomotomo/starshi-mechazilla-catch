/**
 * Procedural Web Audio synthesizer for Raptor engine rumble, ignition,
 * Mechazilla clamp confirmation, and RUD explosion feedback.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private muted = false;
  private initialized = false;
  private currentEngineLevel = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (mute) {
      this.setEngineThrust(0);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public ensureInit(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    if (typeof window === 'undefined') return;
    if (
      typeof navigator !== 'undefined' &&
      'userActivation' in navigator &&
      !navigator.userActivation.hasBeenActive
    ) {
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Create continuous noise buffer for Raptor methane roar
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.06 * white) / 1.06;
        data[i] = lastOut * 2.8;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();

      // Low-frequency mechanical rumble oscillator
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sawtooth';
      subOsc.frequency.value = 42;

      const subFilter = ctx.createBiquadFilter();
      subFilter.type = 'lowpass';
      subFilter.frequency.value = 95;

      const subGain = ctx.createGain();
      subGain.gain.value = 0;

      subOsc.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start();

      this.engineFilter = filter;
      this.engineGain = gain;
      this.subOsc = subOsc;
      this.subGain = subGain;
      this.initialized = true;
    } catch {
      // AudioContext unavailable in headless/restricted environment
    }
  }

  public setEngineThrust(activeEngines: number): void {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.subGain || !this.subOsc) {
      return;
    }
    const targetLevel = this.muted ? 0 : activeEngines;
    if (targetLevel === this.currentEngineLevel) return;
    this.currentEngineLevel = targetLevel;

    const now = this.ctx.currentTime;
    if (targetLevel <= 0) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.04);
      this.subGain.gain.setTargetAtTime(0, now, 0.04);
    } else {
      const norm = Math.min(1, targetLevel / 6);
      const noiseGain = 0.08 + norm * 0.2;
      const cutoff = 220 + norm * 620;
      const subLevel = 0.03 + norm * 0.09;
      this.engineGain.gain.setTargetAtTime(noiseGain, now, 0.03);
      this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
      this.subGain.gain.setTargetAtTime(subLevel, now, 0.03);
      this.subOsc.frequency.setTargetAtTime(38 + norm * 24, now, 0.05);
    }
  }

  public playUiTick(pitchHz = 520): void {
    if (this.muted) return;
    this.ensureInit();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playCatchSuccess(): void {
    this.setEngineThrust(0);
    if (this.muted) return;
    this.ensureInit();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Heavy hydraulic clamp thud
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(110, now);
    thud.frequency.exponentialRampToValueAtTime(36, now + 0.25);
    thudGain.gain.setValueAtTime(0.24, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    thud.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thud.start(now);
    thud.stop(now + 0.3);

    // Ascending confirmation triad
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = now + 0.08 + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    });
  }

  public playExplosion(): void {
    this.setEngineThrust(0);
    if (this.muted) return;
    this.ensureInit();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 1.1;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (this.ctx.sampleRate * 0.28));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + 0.9);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  public dispose(): void {
    this.setEngineThrust(0);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
