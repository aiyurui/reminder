const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBackground(overrides = {}) {
  const createCalls = [];
  let onAlarmListener = null;

  const context = {
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval,
    importScripts: () => {},
    getRandomWaterMessage: () => 'water',
    getRandomEscapeMessage: () => 'escape',
    getRandomActivityMessage: () => 'gaze',
    getRandomTip: () => 'tip',
    logReminderTrigger: () => {},
    localDateKey: () => '2026-06-25',
    isWorkingDay2026: () => true,
    isWorkingTime: () => true,
    getSettings: async () => ({ reminders: [], workHours: { start: '09:00', end: '18:00' } }),
    getAchievements: async () => ({}),
    saveAchievements: async () => {},
    getConsecutiveDays: async () => 0,
    getTotalWaterCount: async () => 0,
    getMaxSingleDay: async () => 0,
    getTodayWaterCount: async () => 0,
    getTotalRemindersReceived: async () => 0,
    getGazeTotalCount: async () => 0,
    getGazeStreakMin: async () => 0,
    getTodayGazeCount: async () => 0,
    getTotalEscapeCount: async () => 0,
    getEscapeStreakMin: async () => 0,
    getTodayEscapeCount: async () => 0,
    getAllTodayCompleteCount: async () => 0,
    getAllRemindersStreak: async () => 0,
    getMonthRestDaysCount: async () => 0,
    chrome: {
      alarms: {
        getAll: async () => [],
        clear: async () => true,
        create: async (name, options) => {
          createCalls.push({ name, options });
        },
        onAlarm: {
          addListener: (fn) => {
            onAlarmListener = fn;
          }
        }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {}
        }
      },
      runtime: {
        getURL: (assetPath) => assetPath,
        lastError: null,
        onMessage: {
          addListener: () => {}
        }
      },
      notifications: {
        create: (id, _options, callback) => {
          callback(id);
        },
        onClicked: { addListener: () => {} },
        onButtonClicked: { addListener: () => {} },
        clear: () => {}
      }
    }
  };

  Object.assign(context, overrides);
  context.globalThis = context;

  const filePath = path.join(__dirname, '..', 'core', 'background.js');
  const source = fs.readFileSync(filePath, 'utf8').replace(
    /init\(\);\s*checkAchievements\(\);\s*\/\/\s*setInterval\(keepAlive,\s*60000\);/m,
    ''
  );

  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });

  return {
    context,
    createCalls,
    getOnAlarmListener: () => onAlarmListener
  };
}

test('getNextIntervalTrigger skips lunch break for non-lunch reminders', () => {
  const { context } = loadBackground();

  const reminder = { id: 'water', type: 'interval', unit: 'minute', interval: 60 };
  const settings = {
    workDayMode: 'daily',
    workHours: { start: '09:00', end: '18:00' },
    lunchBreak: { enabled: true, start: '12:00', end: '13:00' }
  };

  const fromTs = new Date('2026-06-25T11:30:00+08:00').getTime();
  const expected = new Date('2026-06-25T13:00:00+08:00').getTime();

  const when = context.getNextIntervalTrigger(reminder, settings, fromTs);
  assert.equal(when, expected);
});

test('getNextFixedTrigger shifts reminder from lunch window to lunch end', () => {
  const { context } = loadBackground();

  const reminder = { id: 'water', type: 'fixed', time: '12:30' };
  const settings = {
    workDayMode: 'daily',
    workHours: { start: '09:00', end: '18:00' },
    lunchBreak: { enabled: true, start: '12:00', end: '13:00' }
  };

  const fromTs = new Date('2026-06-25T09:00:00+08:00').getTime();
  const expected = new Date('2026-06-25T13:00:00+08:00').getTime();

  const when = context.getNextFixedTrigger(reminder, settings, fromTs);
  assert.equal(when, expected);
});

test('getNextMonthlyTrigger clamps day to month end', () => {
  const { context } = loadBackground();

  const reminder = { id: 'salary', type: 'monthly', day: 31, time: '10:00' };
  const fromTs = new Date('2026-04-01T09:00:00+08:00').getTime();
  const expected = new Date('2026-04-30T10:00:00+08:00').getTime();

  const when = context.getNextMonthlyTrigger(reminder, fromTs);
  assert.equal(when, expected);
});

test('getNextMonthlyTrigger rolls into next month when current month target passed', () => {
  const { context } = loadBackground();

  const reminder = { id: 'salary', type: 'monthly', day: 15, time: '10:00' };
  const fromTs = new Date('2026-06-16T09:00:00+08:00').getTime();
  const expected = new Date('2026-07-15T10:00:00+08:00').getTime();

  const when = context.getNextMonthlyTrigger(reminder, fromTs);
  assert.equal(when, expected);
});

test('interval snooze alarm re-schedules regular alarm name after firing', async () => {
  const { context, createCalls, getOnAlarmListener } = loadBackground({
    getSettings: async () => ({
      reminders: [{ id: 'water', type: 'interval', unit: 'minute', interval: 60, enabled: true }],
      workHours: { start: '09:00', end: '18:00' },
      workDayMode: 'daily',
      workDays: []
    }),
    isWorkingTime: () => true,
    showNotification: () => {}
  });

  context.getNextIntervalTrigger = () => 123456789;

  const onAlarm = getOnAlarmListener();
  assert.equal(typeof onAlarm, 'function');

  onAlarm({ name: 'moyu-snooze-water-1710000000000' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const lastCall = createCalls.at(-1);
  assert.equal(lastCall.name, 'moyu-reminder-water');
  assert.equal(lastCall.options.when, 123456789);
});

test('checkAchievements persists when achievement keys are initialized', async () => {
  let saveCallCount = 0;
  let lastSaved = null;

  const { context } = loadBackground({
    getAchievements: async () => ({}),
    saveAchievements: async (data) => {
      saveCallCount += 1;
      lastSaved = data;
    }
  });

  await context.checkAchievements();

  assert.equal(saveCallCount, 1);
  assert.ok(lastSaved);
  assert.ok(lastSaved.water_today);
});
