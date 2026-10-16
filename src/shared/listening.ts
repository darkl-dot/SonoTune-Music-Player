/** A session counts once after 30 seconds, or half of a shorter recording. */
export class ListeningSession {
  started = false;
  private counted = false;
  private listened = 0;
  private remaining: number | null;
  private threshold: number;
  private updated: number;
  constructor(duration: number, now = performance.now()) {
    this.remaining = Number.isFinite(duration) && duration > 0 ? duration : null;
    this.threshold = Math.min(30, this.remaining === null ? 30 : this.remaining / 2);
    this.updated = now;
  }
  tick(playing: boolean, now = performance.now()): boolean {
    const elapsed = Math.max(0, (now - this.updated) / 1000);
    this.updated = now;
    if (!playing || !this.started) return false;
    const credit = this.remaining === null ? elapsed : Math.min(elapsed, this.remaining);
    this.listened += credit;
    if (this.remaining !== null) this.remaining = Math.max(0, this.remaining - credit);
    if (!this.counted && this.listened >= this.threshold) {
      this.counted = true;
      return true;
    }
    return false;
  }
  seek(seconds: number, duration: number, now = performance.now()) {
    this.updated = now;
    this.remaining =
      Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - seconds) : null;
  }
}
