/** Demo parameter: points below the threshold before a "passing" state is released. */
export const HYSTERESIS_BAND = 2;

/**
 * Hysteresis latch for "value ≥ threshold": enters at ≥ threshold, leaves below threshold - band.
 * Used for both the status text and time accumulation so the words on screen match the logic.
 */
export class ThresholdLatch {
  private on = false;
  private band: number;

  constructor(band = HYSTERESIS_BAND) {
    this.band = band;
  }

  update(value: number | null, threshold: number): boolean {
    if (value === null) {
      this.on = false;
      return false;
    }
    if (this.on) {
      if (value < threshold - this.band) this.on = false;
    } else if (value >= threshold) {
      this.on = true;
    }
    return this.on;
  }

  reset(): void {
    this.on = false;
  }
}
