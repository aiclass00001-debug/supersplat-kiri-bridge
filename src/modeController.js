export class ModeController {
  constructor({ frame, particleSystem, onChange = () => {} }) {
    this.frame = frame;
    this.particleSystem = particleSystem;
    this.mode = 'reality';
    this.onChange = onChange;
  }
  setMode(mode) {
    if (mode === 'particle' && !this.particleSystem?.renderer) return false;
    this.mode = mode === 'particle' ? 'particle' : 'reality';
    this.frame.style.visibility = this.mode === 'reality' ? 'visible' : 'hidden';
    this.particleSystem?.setVisible(this.mode === 'particle');
    this.onChange(this.mode);
    return true;
  }
  toggle() {
    return this.setMode(this.mode === 'reality' ? 'particle' : 'reality');
  }
}
