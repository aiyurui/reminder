//

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02',
  '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-17', '2026-09-18', '2026-09-19',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'
];

const MAKEUP_DAYS_2026 = [
  '2026-01-03', '2026-02-14', '2026-04-11', '2026-05-07',
  '2026-06-22', '2026-09-26', '2026-10-10'
];

function localDateKey(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const DEFAULT_SETTINGS = {
  workHours: { start: '09:00', end: '18:00' },
  lunchBreak: { enabled: true, start: '11:30', end: '13:00' },
  workDayMode: 'weekday',
  workDays: [1, 2, 3, 4, 5],
  waterGoal: 8,
  reminders: [
    { id: 'water',   enabled: true, emoji: '🍵', title: '喝水提醒', type: 'interval', interval: 60, unit: 'minute' },
    { id: 'escape',  enabled: true, emoji: '🦘', title: '尿遁提醒', type: 'interval', interval: 120, unit: 'minute' },
    { id: 'gaze',    enabled: true, emoji: '👀', title: '远眺提醒', type: 'interval', interval: 20, unit: 'minute' },
    { id: 'lunch',   enabled: true, emoji: '🍜', title: '午饭提醒', type: 'fixed',   time: '12:00' },
    { id: 'offwork', enabled: true, emoji: '🏠', title: '下班提醒', type: 'fixed',   time: '18:00' },
    { id: 'salary',  enabled: true, emoji: '💰', title: '发薪提醒', type: 'monthly', day: 15,     time: '10:00' }
  ]
};

async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return result.settings || DEFAULT_SETTINGS;
  } catch (e) { console.error('获取设置失败:', e); return DEFAULT_SETTINGS; }
}

async function saveSettings(settings) {
  try { await chrome.storage.local.set({ settings }); }
  catch (e) { console.error('保存设置失败:', e); }
}

//
let waterQueue = Promise.resolve();

async function getDailyWater() {
  try {
    const result = await chrome.storage.local.get('dailyWater');
    const today = localDateKey();
    if (result.dailyWater && result.dailyWater.date === today) return result.dailyWater;
    return { date: today, count: 0 };
  } catch (e) { return { date: localDateKey(), count: 0 }; }
}

async function addWaterCup() {
  waterQueue = waterQueue.then(async () => {
    try {
      const daily = await getDailyWater();
      daily.count++;
      await chrome.storage.local.set({ dailyWater: daily });
      await addWaterRecord(daily.date, daily.count);
      await updateWellnessFlag(daily.date);
      return daily;
    } catch (e) { return { date: localDateKey(), count: 0 }; }
  });
  return waterQueue;
}

//
async function getWaterHistory() {
  try { const r = await chrome.storage.local.get('waterHistory'); return r.waterHistory || {}; }
  catch (e) { return {}; }
}

async function addWaterRecord(date, count) {
  try {
    const history = await getWaterHistory();
    const goal = (await getSettings()).waterGoal || 8;
    history[date] = { count: count, goalMet: count >= goal };
    const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
    Object.keys(history).forEach(d => { if (d < cutoff) delete history[d]; });
    await chrome.storage.local.set({ waterHistory: history });
  } catch (e) { /* */ }
}

//
async function getAchievements() {
  try { const r = await chrome.storage.local.get('achievements'); return r.achievements || {}; }
  catch (e) { return {}; }
}

async function saveAchievements(data) {
  try { await chrome.storage.local.set({ achievements: data }); }
  catch (e) { /* */ }
}

async function getTotalWaterCount() {
  const h = await getWaterHistory();
  return Object.values(h).reduce((s, d) => s + (d.count || 0), 0);
}

function shiftDateKey(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

async function getConsecutiveDays() {
  const h = await getWaterHistory();
  const goal = (await getSettings()).waterGoal || 8;
  let streak = 0;
  let cursor = localDateKey();

  for (let guard = 0; guard < 370; guard++) {
    const waterOk = h[cursor] && h[cursor].count >= goal;
    if (!waterOk) break;
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

async function getWeeklyActiveDays() {
  const waterHistory = await getWaterHistory();
  const gazeHistory = await getGazeHistory();
  const escapeHistory = await getEscapeHistory();
  const goal = (await getSettings()).waterGoal || 8;
  const settings = await getSettings();

  //
  const toLocalDate = (d) =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  //
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const mondayOff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOff);
  monday.setHours(0, 0, 0, 0);
  const weekStart = toLocalDate(monday);

  //
  let totalWorking = 0;
  let activeDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toLocalDate(d);

    const isWorking =
      settings.workDayMode === 'daily' ||
      (settings.workDayMode === 'weekday' && d.getDay() >= 1 && d.getDay() <= 5) ||
      (settings.workDayMode === 'workday2026' && isWorkingDay2026(d)) ||
      (settings.workDayMode === 'custom' && settings.workDays.includes(d.getDay()));

    if (isWorking) {
      totalWorking++;
      //
      const waterOk = waterHistory[dateStr] && waterHistory[dateStr].count >= 1;
      const gazeOk = gazeHistory[dateStr] && gazeHistory[dateStr] >= 1;
      const escapeOk = escapeHistory[dateStr] && escapeHistory[dateStr] >= 1;
      if (waterOk && gazeOk && escapeOk) {
        activeDays++;
      }
    }
  }

  return { active: activeDays, total: totalWorking };
}

async function getTotalRemindersReceived() {
  try {
    const r = await chrome.storage.local.get(['totalReminderResponsesCount', 'totalRemindersCount']);
    if (typeof r.totalReminderResponsesCount === 'number') return r.totalReminderResponsesCount;
    // 兼容历史版本：历史上按“提醒触发次数”累计
    return r.totalRemindersCount || 0;
  }
  catch (e) { return 0; }
}

let responseQueue = Promise.resolve();

async function recordReminderResponse(reminderId) {
  responseQueue = responseQueue.then(async () => {
    try {
      const r = await chrome.storage.local.get(['totalReminderResponsesCount', 'totalRemindersCount']);
      const base = typeof r.totalReminderResponsesCount === 'number'
        ? r.totalReminderResponsesCount
        : (r.totalRemindersCount || 0);
      await chrome.storage.local.set({ totalReminderResponsesCount: base + 1 });

      const logData = await chrome.storage.local.get('reminderResponseLog');
      const log = logData.reminderResponseLog || {};
      const today = localDateKey();
      if (!log[today]) log[today] = [];
      log[today].push({ id: reminderId, time: Date.now() });
      const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
      Object.keys(log).forEach(d => { if (d < cutoff) delete log[d]; });
      await chrome.storage.local.set({ reminderResponseLog: log });
    } catch (e) { /* */ }
  });
  return responseQueue;
}

//

//
async function isWorkingDay(dateStr) {
  //
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  const settings = await getSettings();
  const dow = d.getDay();

  if (settings.workDayMode === 'daily') return true;
  if (settings.workDayMode === 'weekday') return dow >= 1 && dow <= 5;
  if (settings.workDayMode === 'workday2026') return isWorkingDay2026(d);
  if (settings.workDayMode === 'custom') return settings.workDays.includes(dow);
  return false;
}

//
async function getGazeStreakMin(min = 1) {
  const h = await getGazeHistory();
  let streak = 0;

  let cursor = localDateKey();
  for (let guard = 0; guard < 370; guard++) {
    const isWork = await isWorkingDay(cursor);
    if (isWork) {
      if ((h[cursor] || 0) >= min) {
        streak++;
      } else {
        break;
      }
    }
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

//
async function getGazeStreakMinWeek(min = 1) {
  const h = await getGazeHistory();
  const dates = Object.keys(h).sort().reverse();
  let streak = 0;
  for (const d of dates) {
    const isWork = await isWorkingDay(d);
    if (!isWork) continue;
    if (h[d] >= min) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

//
async function getEscapeStreakMin(min = 1) {
  const h = await getEscapeHistory();
  let streak = 0;

  let cursor = localDateKey();
  for (let guard = 0; guard < 370; guard++) {
    const isWork = await isWorkingDay(cursor);
    if (isWork) {
      if ((h[cursor] || 0) >= min) {
        streak++;
      } else {
        break;
      }
    }
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

//
async function getAllRemindersStreak(minDays = 30) {
  const water = await getWaterHistory();
  const gaze = await getGazeHistory();
  const escape = await getEscapeHistory();
  const goal = (await getSettings()).waterGoal || 8;
  let streak = 0;

  let cursor = localDateKey();
  for (let guard = 0; guard < 370; guard++) {
    if (await isWorkingDay(cursor)) {
      const waterOk = water[cursor] && water[cursor].count >= goal;
      const gazeOk = gaze[cursor] && gaze[cursor] >= 1;
      const escapeOk = escape[cursor] && escape[cursor] >= 1;
      if (waterOk && gazeOk && escapeOk) {
        streak++;
      } else {
        break;
      }
    }
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

async function getAllOnDays() {
  const s = await getSettings();
  if (!s.reminders.every(r => r.enabled)) return 0;

  const h = await getWaterHistory();
  const gaze = await getGazeHistory();
  const goal = s.waterGoal || 8;

  const dates = [...new Set([...Object.keys(h), ...Object.keys(gaze)])].sort();
  let n = 0;
  for (const d of dates) {
    const waterOk = h[d] && h[d].count >= goal;
    const gazeOk = gaze[d] && gaze[d] > 0;
    if (waterOk && gazeOk) n++;
  }
  return n;
}

//
async function getFirstGazeResponded() {
  try {
    const r = await chrome.storage.local.get('activityResponded');
    return r.activityResponded ? 1 : 0;
  } catch (e) { return 0; }
}

async function markFirstGazeResponded() {
  try { await chrome.storage.local.set({ activityResponded: true }); }
  catch (e) { /* */ }
}

async function getGazeWeeklyCount() {
  try {
    const r = await chrome.storage.local.get('activityResponses');
    const data = r.activityResponses || { count: 0, streak: 0, lastDate: '' };
    const today = localDateKey();
    const weekAgo = localDateKey(new Date(Date.now() - 7 * 86400000));
    if (data.lastDate < weekAgo) return 0;
    const h = await getWaterHistory();
    return Object.keys(h).filter(d => d >= weekAgo && h[d].count > 0).length;
  } catch (e) { return 0; }
}

async function getGazeStreak() {
  try {
    const r = await getGazeResponses();
    return (r || { streak: 0 }).streak;
  } catch (e) { return 0; }
}

async function getGazeTotalCount() {
  try {
    const r = await getGazeResponses();
    return (r || { count: 0 }).count;
  } catch (e) { return 0; }
}

//
//
let gazeQueue = Promise.resolve();

async function getGazeHistory() {
  try { const r = await chrome.storage.local.get('gazeHistory'); return r.gazeHistory || {}; }
  catch (e) { return {}; }
}

async function recordGazeResponse() {
  gazeQueue = gazeQueue.then(async () => {
    try {
      const history = await getGazeHistory();
      const today = localDateKey();
      history[today] = (history[today] || 0) + 1;

      const r = await chrome.storage.local.get('activityResponses');
      const data = r.activityResponses || { count: 0, streak: 0, lastDate: '' };
      data.count++;
      if (data.lastDate !== today) {
        const yesterday = localDateKey(new Date(Date.now() - 86400000));
        data.streak = data.lastDate === yesterday ? data.streak + 1 : 1;
        data.lastDate = today;
      }
      await chrome.storage.local.set({ activityResponses: data });

      //
      const respondedData = await chrome.storage.local.get('activityResponded');
      if (!respondedData.activityResponded) {
        await chrome.storage.local.set({ activityResponded: true });
      }

      //
      const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
      Object.keys(history).forEach(d => { if (d < cutoff) delete history[d]; });
      await chrome.storage.local.set({ gazeHistory: history });

      return history[today];
    } catch (e) { return 0; }
  });
  return gazeQueue;
}

async function getGazeResponses() {
  try { const r = await chrome.storage.local.get('activityResponses'); return r.activityResponses || { count: 0, streak: 0, lastDate: '' }; }
  catch (e) { return { count: 0, streak: 0, lastDate: '' }; }
}

//
async function getGazeWeekendDays() {
  const h = await getGazeHistory();
  let count = 0;
  for (const d of Object.keys(h)) {
    const [y, m, day] = d.split('-').map(Number);
    const date = new Date(y, m - 1, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) {
      count++;
    }
  }
  return count;
}

//
async function getTodayWaterCount() {
  const daily = await getDailyWater();
  return daily.count;
}

//
async function getTodayGazeCount() {
  const h = await getGazeHistory();
  const today = localDateKey();
  return h[today] || 0;
}

//
async function getTodayEscapeCount() {
  const h = await getEscapeHistory();
  const today = localDateKey();
  return h[today] || 0;
}

//
async function getAllTodayCompleteCount() {
  const water = await getTodayWaterCount();
  const gaze = await getTodayGazeCount();
  const escape = await getTodayEscapeCount();
  if (water >= 1 && gaze >= 1 && escape >= 1) {
    return 1;
  }
  return 0;
}

//
async function getMonthRestDaysCount() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  //
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  //
  const restDays = new Set();
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      const dateStr = localDateKey(d);
      restDays.add(dateStr);
    }
  }

  // 新逻辑：优先按“提醒响应日志”统计（覆盖喝水/远眺/尿遁/午饭/下班/发薪）
  try {
    const responseData = await chrome.storage.local.get('reminderResponseLog');
    const responseLog = responseData.reminderResponseLog || {};
    let count = 0;
    for (const dateStr of restDays) {
      if (Array.isArray(responseLog[dateStr]) && responseLog[dateStr].length > 0) {
        count++;
      }
    }
    // 有响应日志则直接返回，避免和旧统计口径重复叠加
    if (Object.keys(responseLog).length > 0) return count;
  } catch (e) { /* 兜底走旧逻辑 */ }

  // 兼容旧数据：历史版本只记录喝水/远眺/尿遁
  const waterHist = await getWaterHistory();
  const gazeHist = await getGazeHistory();
  const escapeHist = await getEscapeHistory();
  let legacyCount = 0;
  for (const dateStr of restDays) {
    if (waterHist[dateStr] || gazeHist[dateStr] || escapeHist[dateStr]) {
      legacyCount++;
    }
  }
  return legacyCount;
}

async function updateWellnessFlag(date) {
  try {
    const history = await getWaterHistory();
    const goal = (await getSettings()).waterGoal || 8;
    const entry = history[date];
    if (!entry) return;
    const waterMet = (entry.count || 0) >= goal;
    //
    const gazeHist = await getGazeHistory();
    const activityMet = !!gazeHist[date];
    const wellnessMet = waterMet && activityMet;
    if (entry.goalMet !== wellnessMet) {
      entry.goalMet = wellnessMet;
      await chrome.storage.local.set({ waterHistory: history });
    }
  } catch (e) { /* */ }
}

async function getMonthTotal() {
  const h = await getWaterHistory();
  const ago = localDateKey(new Date(Date.now() - 30 * 86400000));
  return Object.entries(h).filter(([d]) => d >= ago).reduce((s, [, v]) => s + (v.count || 0), 0);
}

async function getMaxSingleDay() {
  const h = await getWaterHistory();
  return Math.max(0, ...Object.values(h).map(d => d.count || 0));
}

//
//
let escapeQueue = Promise.resolve();

async function getEscapeHistory() {
  try { const r = await chrome.storage.local.get('escapeHistory'); return r.escapeHistory || {}; }
  catch (e) { return {}; }
}

async function recordEscapeResponse() {
  escapeQueue = escapeQueue.then(async () => {
    try {
      const history = await getEscapeHistory();
      const today = localDateKey();
      history[today] = (history[today] || 0) + 1;
      const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
      Object.keys(history).forEach(d => { if (d < cutoff) delete history[d]; });
      await chrome.storage.local.set({ escapeHistory: history });
      return { date: today, count: history[today] };
    } catch (e) { return { date: localDateKey(), count: 0 }; }
  });
  return escapeQueue;
}

async function getTotalEscapeCount() {
  const h = await getEscapeHistory();
  return Object.values(h).reduce((s, c) => s + c, 0);
}

async function getEscapeDates() {
  return Object.keys(await getEscapeHistory()).length;
}

//
async function getTrendData(days = 30) {
  const settings = await getSettings();
  const waterHistory = await getWaterHistory();
  const escapeHistory = await getEscapeHistory();
  const gazeHistory = await getGazeHistory();

  const isWorkingDay = (d) => {
    if (settings.workDayMode === 'daily') return true;
    if (settings.workDayMode === 'weekday') return d.getDay() >= 1 && d.getDay() <= 5;
    if (settings.workDayMode === 'workday2026') return isWorkingDay2026(d);
    if (settings.workDayMode === 'custom') return settings.workDays.includes(d.getDay());
    return false;
  };

  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    const dateStr = localDateKey(date);
    if (!isWorkingDay(date)) continue;

    data.push({
      date: dateStr,
      label: date.getMonth() + 1 + '/' + date.getDate(),
      water: waterHistory[dateStr]?.count || 0,
      escape: escapeHistory[dateStr] || 0,
      gaze: gazeHistory[dateStr] || 0
    });
  }
  return data;
}

//
//
let logQueue = Promise.resolve();

async function logReminderTrigger(reminderId) {
  logQueue = logQueue.then(async () => {
    try {
      const r = await chrome.storage.local.get('reminderLog');
      const log = r.reminderLog || {};
      const today = localDateKey();
      if (!log[today]) log[today] = [];
      log[today].push({ id: reminderId, time: Date.now() });
      const cutoff = localDateKey(new Date(Date.now() - 30 * 86400000));
      Object.keys(log).forEach(d => { if (d < cutoff) delete log[d]; });
      await chrome.storage.local.set({ reminderLog: log });

      //
      const countData = await chrome.storage.local.get('totalRemindersCount');
      await chrome.storage.local.set({ totalRemindersCount: (countData.totalRemindersCount || 0) + 1 });
    } catch (e) { /* */ }
  });
  return logQueue;
}

async function getReminderLogs(days = 7) {
  try {
    const r = await chrome.storage.local.get('reminderLog');
    const log = r.reminderLog || {};
    const cutoff = localDateKey(new Date(Date.now() - days * 86400000));
    const result = {};
    Object.keys(log).filter(d => d >= cutoff).sort().reverse().forEach(d => {
      result[d] = log[d];
    });
    return result;
  } catch (e) { return {}; }
}

function isWorkingDay2026(date) {
  const ds = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  if (MAKEUP_DAYS_2026.includes(ds)) return true;
  if (HOLIDAYS_2026.includes(ds)) return false;
  return date.getDay() >= 1 && date.getDay() <= 5;
}

function isWorkingTime(date, startTime, endTime, workDayMode, customWorkDays) {
  let ok = false;
  if (workDayMode === 'daily') ok = true;
  else if (workDayMode === 'weekday') ok = date.getDay() >= 1 && date.getDay() <= 5;
  else if (workDayMode === 'workday2026') ok = isWorkingDay2026(date);
  else if (workDayMode === 'custom') ok = customWorkDays.includes(date.getDay());
  if (!ok) return false;
  return date.toTimeString().slice(0, 5) >= startTime && date.toTimeString().slice(0, 5) <= endTime;
}

function isInLunchBreak(settings) {
  const lunch = settings && settings.lunchBreak;
  if (!lunch || !lunch.enabled) return false;
  const now = new Date();
  const nowStr = now.toTimeString().slice(0, 5);
  return nowStr >= lunch.start && nowStr <= lunch.end;
}

function formatCountdown(nextTime) {
  const diff = nextTime - Date.now();
  if (diff <= 0) return '立即';
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function formatNextTime(nextTime) {
  const d = new Date(nextTime), now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  const hh = d.getHours().toString().padStart(2, '0'), mm = d.getMinutes().toString().padStart(2, '0');
  if (isToday) return '今天 ' + hh + ':' + mm;
  if (isTomorrow) return '明天 ' + hh + ':' + mm;
  return (d.getMonth() + 1).toString().padStart(2, '0') + '月' + d.getDate().toString().padStart(2, '0') + '日 ' + hh + ':' + mm;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    //
    isWorkingTime, formatCountdown, formatNextTime, DEFAULT_SETTINGS,
    generateId, getSettings, saveSettings,

    //
    getDailyWater, addWaterCup, getWaterHistory, addWaterRecord,
    getTotalWaterCount, getConsecutiveDays, getMaxSingleDay,
    getTodayWaterCount,

    //
    getGazeHistory, recordGazeResponse, getGazeResponses, getGazeWeekendDays,
    getGazeStreak, getGazeTotalCount, getFirstGazeResponded,
    getTodayGazeCount,

    //
    getEscapeHistory, recordEscapeResponse, getTotalEscapeCount, getEscapeDates,
    getTodayEscapeCount,

    //
    getAllTodayCompleteCount, getMonthRestDaysCount,

    //
    getAchievements, saveAchievements, getTotalRemindersReceived,
    recordReminderResponse,
    isWorkingDay, getGazeStreakMin, getGazeStreakMinWeek,
    getEscapeStreakMin, getAllRemindersStreak,

    //
    logReminderTrigger, getReminderLogs, getTrendData
  };
}





