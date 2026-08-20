
import assert from 'node:assert/strict';
import {
  extractSuperSplatSceneId,
  __decodeCoreForTest
} from './src/sogDataLoader.js';

assert.equal(
  extractSuperSplatSceneId('https://superspl.at/scene/826659f3'),
  '826659f3'
);
assert.equal(
  extractSuperSplatSceneId('https://superspl.at/s?id=11d081f5'),
  '11d081f5'
);
assert.equal(extractSuperSplatSceneId('826659F3'), '826659f3');
assert.equal(extractSuperSplatSceneId('bad'), null);

const meta = {
  count: 2,
  means: {
    mins: [0,0,0],
    maxs: [1,1,1],
    files: ['means_l.webp','means_u.webp']
  },
  sh0: {
    codebook: Array.from({length:256},(_,i)=>(i-128)/64),
    files: ['sh0.webp']
  }
};

// two RGBA pixels. Position 0 = 0, Position 1 ~= max.
const meansLo = new Uint8ClampedArray([
  0,0,0,255,
  255,255,255,255
]);
const meansHi = new Uint8ClampedArray([
  0,0,0,255,
  255,255,255,255
]);
const sh0 = new Uint8ClampedArray([
  128,128,128,255,
  192,64,128,255
]);

const data = __decodeCoreForTest(meta, meansLo, meansHi, sh0);
assert.equal(data.count, 2);
assert.equal(data.positions.length, 6);
assert.equal(data.colors.length, 6);
assert.ok(Number.isFinite(data.positions[0]));
assert.ok(data.positions[3] > data.positions[0]);
for (const c of data.colors) {
  assert.ok(c >= 0 && c <= 1);
}

console.log('unit tests PASS');
