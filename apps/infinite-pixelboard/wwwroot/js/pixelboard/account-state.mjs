export class AccountState {
  constructor({
    onChange,
    now = () => Date.now(),
    document: doc = globalThis.document,
    setTimeout: schedule = globalThis.setTimeout?.bind(globalThis),
    clearTimeout: clear = globalThis.clearTimeout?.bind(globalThis),
  } = {}) {
    this.onChange = onChange ?? (() => {});
    this.now = now;
    this.document = doc ?? null;
    this.setTimeout = schedule ?? ((callback) => callback());
    this.clearTimeout = clear ?? (() => {});
    this.account = null;
    this.nextPlacementAt = null;
    this.timer = null;
    this.handleVisibility = () => {
      if (this.document?.hidden) return;
      this.#emit();
      this.#schedule();
    };
    this.document?.addEventListener?.("visibilitychange", this.handleVisibility);
  }

  setAccount(account) {
    this.account = account;
    this.setCooldown(account?.cooldown);
  }

  setCooldown(cooldown) {
    this.nextPlacementAt = cooldown?.nextPlacementAt
      ? Date.parse(cooldown.nextPlacementAt)
      : null;
    this.#emit();
    this.#schedule();
  }

  get snapshot() {
    const remainingMilliseconds = this.nextPlacementAt
      ? Math.max(0, this.nextPlacementAt - this.now())
      : 0;
    return {
      authenticated: Boolean(this.account),
      tier: this.account?.tier ?? null,
      entitlementSource: this.account?.entitlementSource ?? null,
      canPlace: Boolean(this.account?.canPlace) && remainingMilliseconds === 0,
      communityStandardsAccepted: Boolean(this.account?.communityStandardsAccepted),
      remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
      referralCode: this.account?.referralCode ?? null,
      paintBoost: this.account?.paintBoost ?? null,
      allowedColors: this.account?.allowedColors ?? null,
      isBanned: Boolean(this.account?.isBanned),
    };
  }

  dispose() {
    this.clearTimeout(this.timer);
    this.timer = null;
    this.document?.removeEventListener?.("visibilitychange", this.handleVisibility);
  }

  #schedule() {
    this.clearTimeout(this.timer);
    this.timer = null;
    if (this.snapshot.remainingSeconds > 0) {
      this.timer = this.setTimeout(() => {
        this.#emit();
        this.#schedule();
      }, 250);
    }
  }

  #emit() {
    this.onChange(this.snapshot);
  }
}
