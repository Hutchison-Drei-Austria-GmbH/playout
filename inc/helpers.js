export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function now() {
  return (new Date()).getTime()
}

export function mod(num, base) {
  let res = num % base;
  return res < 0 ? base + res : res;
}