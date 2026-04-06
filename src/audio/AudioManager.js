/**
 * AudioManager — Sons procedurais sem arquivos externos
 */
export class AudioManager {
  constructor() {
    this._ctx   = null
    this._muted = false
  }

  async init() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)()
      document.addEventListener('pointerdown', () => {
        if (this._ctx?.state === 'suspended') this._ctx.resume()
      }, { once: true })
    } catch (e) { console.warn('Áudio indisponível') }
  }

  playSnap()   { this._click(1200, 0.12, 0.15); setTimeout(() => this._click(1600, 0.08, 0.10), 80) }
  playHover()  { this._click(800, 0.04, 0.06) }
  playError()  { this._buzz(200, 120, 0.10, 0.18) }
  playSelect() { this._click(900, 0.06, 0.08) }
  playComplete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.15, 0.20), i * 120))
  }
  playReset()  { this._buzz(300, 200, 0.06, 0.12) }

  _click(freq, gain, dur) {
    if (!this._ctx || this._muted) return
    const o = this._ctx.createOscillator()
    const g = this._ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(freq, this._ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(freq * 0.3, this._ctx.currentTime + dur)
    g.gain.setValueAtTime(gain, this._ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur)
    o.connect(g); g.connect(this._ctx.destination)
    o.start(); o.stop(this._ctx.currentTime + dur)
  }

  _buzz(f1, f2, gain, dur) {
    if (!this._ctx || this._muted) return
    const o = this._ctx.createOscillator()
    const g = this._ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f1, this._ctx.currentTime)
    o.frequency.linearRampToValueAtTime(f2, this._ctx.currentTime + dur)
    g.gain.setValueAtTime(gain, this._ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur)
    o.connect(g); g.connect(this._ctx.destination)
    o.start(); o.stop(this._ctx.currentTime + dur)
  }

  _tone(freq, gain, dur) {
    if (!this._ctx || this._muted) return
    const o = this._ctx.createOscillator()
    const g = this._ctx.createGain()
    o.type = 'sine'; o.frequency.value = freq
    g.gain.setValueAtTime(gain, this._ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur)
    o.connect(g); g.connect(this._ctx.destination)
    o.start(); o.stop(this._ctx.currentTime + dur)
  }

  toggleMute() { this._muted = !this._muted; return this._muted }
}
