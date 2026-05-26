// navigator.vibrate wrapper. Most iPadOS still doesn't expose Vibration API,
// so this is graceful no-op on unsupported devices.

const has = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export const haptics = {
  tap()       { if (has) navigator.vibrate(8); },
  eat()       { if (has) navigator.vibrate(10); },
  combo()     { if (has) navigator.vibrate([12, 20, 12]); },
  golden()    { if (has) navigator.vibrate([20, 30, 20, 30, 30]); },
  milestone() { if (has) navigator.vibrate([20, 40, 20, 40, 40]); },
  death()     { if (has) navigator.vibrate([60, 30, 120]); },
};
