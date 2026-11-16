// 音效：全部用 WebAudio 即時合成，不需任何音檔（離線、零資源）。
import { rnd, max } from '../sim/util';

export const Snd = {
  ctx: null as AudioContext | null, out: null as GainNode | null, nb: null as AudioBuffer | null, vol: 0.7,
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
      const c: AudioContext = new AC(); this.ctx = c;
      this.out = c.createGain(); this.out.gain.value = this.vol;
      const cmp = c.createDynamicsCompressor(); this.out.connect(cmp); cmp.connect(c.destination);
      const n = c.sampleRate, b = c.createBuffer(1, n, n), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1; this.nb = b;
    } catch { this.ctx = null; }
  },
  suspend() { try { this.ctx?.suspend(); } catch { /* 無 */ } },
  resume() { try { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); } catch { /* 無 */ } },
  setVol(v: number) { this.vol = v; if (this.out) this.out.gain.value = v; },
  tone(f: number, d: number, type: OscillatorType = 'sine', v = 0.2, f2 = 0, delay = 0) {
    const c = this.ctx; if (!c || !this.out) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(max(20, f2), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d: number, v = 0.2, fq = 1200, q = 1, delay = 0, f2 = 0) {
    const c = this.ctx; if (!c || !this.out || !this.nb) return; const t = c.currentTime + delay, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.nb; s.loop = true; f.type = 'bandpass'; f.frequency.setValueAtTime(fq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + d); f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f); f.connect(g); g.connect(this.out); s.start(t, rnd()); s.stop(t + d + 0.02);
  },
  play(n: string) {
    if (!this.ctx || this.vol <= 0 || this.ctx.state !== 'running') return; const S = this;
    switch (n) {
      case 'swing': S.noise(.12, .2, 700, 1.1, 0, 3200); break;
      case 'heavy': S.noise(.25, .25, 500, 1, 0, 2200); S.tone(120, .2, 'sine', .2, 60); break;
      case 'shoot': S.noise(.09, .14, 2400, 2, 0, 900); S.tone(520, .08, 'triangle', .08, 260); break;
      case 'cast': S.tone(660, .18, 'sine', .12, 1100); S.noise(.15, .06, 3000, 3); break;
      case 'hit': S.noise(.07, .34, 1100, 0.9); S.noise(.05, .2, 3800, 2); S.tone(190, .1, 'square', .13, 60); S.tone(110, .13, 'sine', .34, 42); break;
      case 'hhit': S.noise(.16, .42, 520, 0.7, 0, 160); S.noise(.05, .22, 4200, 2); S.tone(140, .16, 'square', .16, 40); S.tone(84, .24, 'sine', .46, 30); break;
      case 'crit': S.noise(.12, .4, 1300, 0.9); S.tone(240, .12, 'square', .16, 60); S.tone(96, .2, 'sine', .42, 34); S.tone(1500, .2, 'sine', .1, 760); S.tone(2250, .16, 'sine', .05, 1500, .02); break;
      case 'kill': S.noise(.24, .3, 420, .7, 0, 90); S.tone(300, .2, 'triangle', .12, 70); S.tone(70, .28, 'sine', .36, 28); break;
      case 'hurt': S.tone(150, .22, 'sawtooth', .22, 55); S.noise(.16, .25, 350, .7); break;
      case 'dodge': S.noise(.2, .14, 500, .9, 0, 1800); break;
      case 'pdodge': S.tone(880, .5, 'sine', .14, 1760); S.tone(1320, .6, 'sine', .08, 2640, .05); S.noise(.4, .08, 4000, 2); break;
      case 'parry': S.tone(1250, .25, 'triangle', .22, 900); S.tone(2500, .3, 'sine', .12, 1900); S.noise(.07, .3, 5000, 3); break;
      case 'block': S.tone(320, .1, 'square', .12, 200); S.noise(.06, .2, 2500, 2); break;
      case 'coin': S.tone(1300, .07, 'square', .05); S.tone(1750, .1, 'square', .05, 0, .05); break;
      case 'pick': S.tone(520, .1, 'triangle', .14); S.tone(780, .1, 'triangle', .14, 0, .08); S.tone(1040, .2, 'triangle', .14, 0, .16); break;
      case 'heal': S.tone(440, .2, 'sine', .14, 660); S.tone(660, .3, 'sine', .12, 990, .12); break;
      case 'ui': S.tone(700, .05, 'triangle', .08, 900); break;
      case 'deny': S.tone(160, .12, 'square', .09, 110); break;
      case 'door': S.tone(90, .4, 'sine', .22, 45); S.noise(.3, .1, 300, .6); break;
      case 'clear': S.tone(392, .2, 'triangle', .1); S.tone(523, .2, 'triangle', .1, 0, .1); S.tone(659, .35, 'triangle', .1, 0, .2); break;
      case 'boom': S.noise(.4, .4, 200, .5, 0, 60); S.tone(90, .35, 'sine', .3, 35); break;
      case 'warn': S.tone(980, .08, 'square', .05); break;
      case 'boss': S.tone(70, 1.2, 'sawtooth', .25, 40); S.noise(1, .2, 200, .5, 0, 80); break;
      case 'stairs': S.tone(260, .5, 'sine', .12, 520); S.tone(390, .6, 'sine', .1, 780, .15); break;
      case 'die': S.tone(220, 1.2, 'sawtooth', .2, 40); S.noise(.9, .2, 300, .5, 0, 60); break;
      case 'charge': S.tone(300, .12, 'sine', .05, 600); break;
      case 'freeze': S.tone(1800, .2, 'triangle', .08, 2600); S.noise(.2, .08, 6000, 4); break;
      case 'spawn': S.tone(180, .25, 'sine', .08, 360); break;
    }
  },
};
