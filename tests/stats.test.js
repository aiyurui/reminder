const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStats(overrides = {}) {
  const elements = new Map();

  const document = {
    addEventListener: () => {},
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          textContent: '',
          innerHTML: '',
          style: {},
          addEventListener: () => {}
        });
      }
      return elements.get(id);
    },
    createElementNS: () => ({
      setAttribute: () => {},
      appendChild: () => {}
    })
  };

  const context = {
    console,
    Date,
    Promise,
    document,
    localDateKey: () => '2026-06-25',
    getDailyWater: async () => ({ count: 2 }),
    getWaterHistory: async () => ({}),
    getEscapeHistory: async () => ({}),
    getGazeHistory: async () => ({})
  };

  Object.assign(context, overrides);
  context.globalThis = context;

  const filePath = path.join(__dirname, '..', 'stats', 'stats.js');
  const source = fs.readFileSync(filePath, 'utf8');

  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });

  return { context, elements };
}

test('renderStats uses union of water/escape/gaze active days for monthly averages', async () => {
  const { context, elements } = loadStats({
    getWaterHistory: async () => ({
      '2026-06-01': { count: 4 },
      '2026-06-02': { count: 2 }
    }),
    getEscapeHistory: async () => ({
      '2026-06-03': 3
    }),
    getGazeHistory: async () => ({
      '2026-06-04': 4
    })
  });

  await context.renderStats();

  assert.equal(String(elements.get('water-month').textContent), '6');
  assert.equal(String(elements.get('water-avg').textContent), '1.5');
  assert.equal(String(elements.get('escape-avg').textContent), '0.8');
  assert.equal(String(elements.get('gaze-avg').textContent), '1.0');
});
