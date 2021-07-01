import { equal, ok } from 'assert';

import {
  sleep,
  now,
  mod
} from '../inc/helpers.js'

describe('helpers', function () {
  it('should sleep 10ms', function () {
    let t1 = now();
    sleep(20);
    let t2 = now();

    let diff = t2 - t1;

    ok(diff > 18);
    ok(diff < 22);
  });

  it('should count correct positive mod', function () {
    let r = mod(150, 12);
    equal(r, 6);
  });

  it('should count correct negative mod', function () {
    let r = mod(-50, 12);
    equal(r, 10);
  });
});
