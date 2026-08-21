export class PlacementReconciler {
  constructor({ cache, place, onChange }) {
    this.cache = cache;
    this.place = place;
    this.onChange = onChange ?? (() => {});
  }

  async submit({ row, column, color }) {
    const mutation = this.cache.applyPixel(row, column, color);
    this.onChange({ state: "pending", row, column, color });
    try {
      const result = await this.place({
        row,
        column,
        color,
        idempotencyKey: createIdempotencyKey(),
      });
      const pixel = result.pixel;
      if (pixel) this.cache.applyPixel(pixel.row, pixel.column, pixel.color);
      this.onChange({ state: "accepted", result });
      return result;
    } catch (error) {
      this.cache.restorePixel(row, column, mutation.previous.color, mutation.version);
      this.onChange({ state: "rejected", error });
      throw error;
    }
  }
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
