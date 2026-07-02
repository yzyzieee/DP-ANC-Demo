// Framework-agnostic Web Audio engine for the DP-ANC demo.
//
// Responsibilities (plan §5.2):
//   - Hold the decoded stems for ONE scene, keyed by "method:component".
//   - Play exactly one active stem at a time, looping, with a single master gain.
//   - Switch the active stem (method or component) WITHOUT restarting: the new stem
//     starts at the same timeline offset with a short equal-power-ish crossfade so
//     there are no clicks.
//   - Preserve level differences between methods: files already carry the scene's
//     shared gain, so the engine only applies a user volume — never per-stem
//     normalization.
//   - Never leak nodes: old sources are faded out then stopped and dropped.
//
// The engine keeps no React state; a hook polls getPosition() for the UI cursor.

export type StemKey = string; // `${MethodId}:${ComponentId}`

const CROSSFADE_S = 0.05; // 50 ms, within the plan's 30–80 ms window

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  key: StemKey;
}

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private buffers = new Map<StemKey, AudioBuffer>();
  private voice: ActiveVoice | null = null;

  private activeKey: StemKey | null = null;
  private duration = 0;

  // Timeline anchors. positionAt(now) = (now - anchorCtxTime + anchorOffset) % duration.
  private playing = false;
  private anchorCtxTime = 0;
  private anchorOffset = 0;
  private pausedOffset = 0;

  private volume = 1;

  constructor() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  /** Replace the current scene's stems. Stops any playback cleanly first. */
  setBuffers(buffers: Map<StemKey, AudioBuffer>, duration: number): void {
    this.stopInternal();
    this.buffers = buffers;
    this.duration = duration;
    this.pausedOffset = 0;
    this.playing = false;
    // Keep activeKey if it still exists in the new set, else clear it.
    if (this.activeKey && !buffers.has(this.activeKey)) this.activeKey = null;
  }

  /** Decode fetched file bytes into an AudioBuffer using this engine's context. */
  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // Safari historically only supported the callback form; wrap for safety.
    return new Promise((resolve, reject) => {
      this.ctx.decodeAudioData(data, resolve, reject);
    });
  }

  hasStem(key: StemKey): boolean {
    return this.buffers.has(key);
  }

  /** Rectified peak envelope (max |sample| per bin) of a stem, for waveform drawing. */
  getPeaks(key: StemKey, bins: number): number[] | null {
    const buf = this.buffers.get(key);
    if (!buf) return null;
    const data = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / bins));
    const peaks: number[] = new Array(bins).fill(0);
    for (let i = 0; i < bins; i++) {
      const start = i * block;
      const end = Math.min(data.length, start + block);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const a = Math.abs(data[j]);
        if (a > peak) peak = a;
      }
      peaks[i] = peak;
    }
    return peaks;
  }

  getDuration(): number {
    return this.duration;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getActiveKey(): StemKey | null {
    return this.activeKey;
  }

  /** Current playhead position in seconds, within [0, duration). */
  getPosition(): number {
    if (this.duration <= 0) return 0;
    if (!this.playing) return this.pausedOffset % this.duration;
    const raw =
      this.ctx.currentTime - this.anchorCtxTime + this.anchorOffset;
    return ((raw % this.duration) + this.duration) % this.duration;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    // Small ramp avoids zipper noise on the master gain.
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.volume, t, 0.02);
  }

  getVolume(): number {
    return this.volume;
  }

  /**
   * Select the active stem. If playing, crossfade to it at the current offset;
   * if paused, just remember it for the next play(). No-op if already active.
   */
  select(key: StemKey): void {
    if (!this.buffers.has(key)) return;
    if (key === this.activeKey && this.voice) return;
    this.activeKey = key;
    if (this.playing) {
      this.startVoice(key, this.getPosition(), /*crossfade=*/ true);
    }
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.activeKey) return;
    this.playing = true;
    this.startVoice(this.activeKey, this.pausedOffset, /*crossfade=*/ false);
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedOffset = this.getPosition();
    this.playing = false;
    this.fadeOutAndStop(this.voice);
    this.voice = null;
  }

  restart(): void {
    this.pausedOffset = 0;
    this.anchorOffset = 0;
    this.anchorCtxTime = this.ctx.currentTime;
    if (this.playing && this.activeKey) {
      this.startVoice(this.activeKey, 0, /*crossfade=*/ true);
    }
  }

  /** Fully release audio resources. */
  dispose(): void {
    this.stopInternal();
    this.master.disconnect();
    void this.ctx.close();
  }

  // ---- internals -------------------------------------------------------

  private startVoice(key: StemKey, offset: number, crossfade: boolean): void {
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.master);

    const startOffset = ((offset % this.duration) + this.duration) % this.duration;

    if (crossfade) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_S);
      // Fade the previous voice out over the same window, then stop it.
      this.fadeOutAndStop(this.voice);
    } else {
      gain.gain.setValueAtTime(1, now);
    }

    source.start(now, startOffset);

    this.voice = { source, gain, key };
    this.anchorCtxTime = now;
    this.anchorOffset = startOffset;
  }

  private fadeOutAndStop(voice: ActiveVoice | null): void {
    if (!voice) return;
    const now = this.ctx.currentTime;
    const { source, gain } = voice;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_S);
      source.stop(now + CROSSFADE_S + 0.01);
    } catch {
      /* already stopped */
    }
    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  private stopInternal(): void {
    if (this.voice) {
      const { source, gain } = this.voice;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
      this.voice = null;
    }
    this.playing = false;
  }
}
