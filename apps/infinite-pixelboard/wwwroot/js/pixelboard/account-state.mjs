export class AccountState {
  constructor({ onChange, now = () => Date.now() } = {}) {
    this.onChange = onChange ?? (() => {});
    this.now = now;
    this.account = null;
    this.nextPlacementAt = null;
    this.timer = null;
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
    clearTimeout(this.timer);
  }

  #schedule() {
    clearTimeout(this.timer);
    if (this.snapshot.remainingSeconds > 0) {
      this.timer = setTimeout(() => {
        this.#emit();
        this.#schedule();
      }, 250);
    }
  }

  #emit() {
    this.onChange(this.snapshot);
  }
}
