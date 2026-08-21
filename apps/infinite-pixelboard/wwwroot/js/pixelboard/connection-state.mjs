export class ConnectionState {
  constructor({ onChange, online = () => navigator.onLine } = {}) {
    this.onChange = onChange ?? (() => {});
    this.online = online;
    this.pending = 0;
    this.failed = false;
    this.realtimeStatus = "connecting";
    this.handleOnline = () => {
      this.failed = false;
      this.#emit();
    };
    this.handleOffline = () => this.#emit();
    globalThis.addEventListener?.("online", this.handleOnline);
    globalThis.addEventListener?.("offline", this.handleOffline);
    this.#emit();
  }

  request(event) {
    if (event === "start") this.pending += 1;
    if (event === "success") {
      this.pending = Math.max(0, this.pending - 1);
      this.failed = false;
    }
    if (event === "failure") {
      this.pending = Math.max(0, this.pending - 1);
      this.failed = true;
    }
    if (event === "abort") this.pending = Math.max(0, this.pending - 1);
    this.#emit();
  }

  realtime(state) {
    this.realtimeStatus = state;
    this.#emit();
  }

  dispose() {
    globalThis.removeEventListener?.("online", this.handleOnline);
    globalThis.removeEventListener?.("offline", this.handleOffline);
  }

  #emit() {
    const state = !this.online()
      ? "offline"
      : this.failed || this.realtimeStatus === "degraded"
        ? "degraded"
        : this.pending || this.realtimeStatus === "connecting"
          ? "connecting"
          : this.realtimeStatus;
    this.onChange(state);
  }
}
