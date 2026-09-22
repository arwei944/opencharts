import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adaptiveLookahead,
  lookaheadFor,
  predictVelocity,
  pushSample,
  type PanSample,
} from "./predictor.ts";

const S = (t: number, from: number, to: number): PanSample => ({ t, from, to });

test("pushSample caps the window, newest last", () => {
  let samples: PanSample[] = [];
  for (let i = 0; i < 30; i++)
    samples = pushSample(samples, S(i, i, i + 100), 10);
  assert.equal(samples.length, 10);
  assert.equal(samples[0].t, 20);
  assert.equal(samples[9].t, 29);
});

test("predictVelocity: leftward pan yields negative bars/sec", () => {
  // from 10000 → 4000 over 1000ms, span constant 1000 → drift -6000 → -6000 bar/s
  const v = predictVelocity([S(0, 10000, 11000), S(1000, 4000, 5000)]);
  assert.equal(v, -6000);
});

test("predictVelocity: rightward pan is positive", () => {
  const v = predictVelocity([S(0, 1000, 2000), S(500, 1600, 2600)]);
  assert.equal(v, 1200);
});

test("predictVelocity: no motion → 0", () => {
  assert.equal(predictVelocity([S(0, 1000, 2000), S(1000, 1000, 2000)]), 0);
  assert.equal(predictVelocity([S(0, 1000, 2000)]), 0);
  assert.equal(predictVelocity([]), 0);
});

test("predictVelocity: zoom-in drift is not mistaken for pan", () => {
  // Left edge moves left but the span grew — no translation.
  const v = predictVelocity([S(0, 5000, 6000), S(1000, 4000, 7000)]);
  assert.equal(v, 0);
});

test("adaptiveLookahead: idle/rightward keeps the base", () => {
  assert.equal(adaptiveLookahead(0), 2000);
  assert.equal(adaptiveLookahead(1200), 2000);
});

test("adaptiveLookahead: fast leftward pan amplifies up to maxFactor", () => {
  assert.equal(adaptiveLookahead(-6000), 5000); // k=0.5 → 2000*(1+3*0.5)=5000
  assert.equal(adaptiveLookahead(-60000), 8000); // saturated → 2000*4
  assert.equal(adaptiveLookahead(-12000), 8000);
});

test("lookaheadFor folds a fresh sample in", () => {
  const samples = [S(0, 10000, 11000)];
  const out = lookaheadFor(samples, S(1000, 4000, 5000));
  assert.equal(out, 5000);
});
