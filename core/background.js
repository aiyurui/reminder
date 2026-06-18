//

importScripts('utils.js');
importScripts('tips.js');

const ALARM_PREFIX = 'moyu-reminder-';
const SNOOZE_ALARM_PREFIX = 'moyu-snooze-';
let isInitialized = false;

//
function keepAlive() {
  try {
    chrome.storage.local.set({ sw_last_active_time: Date.now() });
  } catch (e) { /* */ }
}

//
async function init() {
  if (isInitialized) return;
  try {
    const settings = await getSettings();
    //
    const migrated = await chrome.storage.local.get('migration_v1_toilet_escape');
    if (!migrated.migration_v1_toilet_escape) {
      let changed = false;
      for (const r of settings.reminders) {
        if (r.id === 'toilet') { r.id = 'escape'; r.unit = 'minute'; r.interval = 120; changed = true; }
      }
      if (changed) await saveSettings(settings);
      await chrome.storage.local.set({ migration_v1_toilet_escape: true });
    }
    await scheduleAlarms(settings);
    isInitialized = true;
    console.log('[带薪养生] 初始化完成，闹钟已注册');
  } catch (e) {
    console.error('[带薪养生] 初始化失败:', e);
    isInitialized = false;
  }
}

//
async function scheduleAlarms(settings) {
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  const now = new Date();

  for (const reminder of settings.reminders) {
    if (!reminder.enabled) continue;
    if (await isSkippedToday(reminder.id)) continue;

    const alarmName = ALARM_PREFIX + reminder.id;
    const type = reminder.type || inferType(reminder);

    //
    const lunch = settings.lunchBreak || { enabled: false };
    let lunchStartTime = null, lunchEndTime = null;
    if (lunch.enabled && lunch.start && lunch.end) {
      const [sH, sM] = (settings.workHours?.start || '09:00').split(':').map(Number);
      const [lS, lM] = lunch.start.split(':').map(Number);
      const [lE, lE2] = lunch.end.split(':').map(Number);
      const dayStart = new Date(now);
      dayStart.setHours(sH, sM, 0, 0);
      lunchStartTime = new Date(dayStart);
      lunchStartTime.setHours(lS, lM, 0, 0);
      lunchEndTime = new Date(dayStart);
      lunchEndTime.setHours(lE, lE2, 0, 0);
    }

    if (type === 'interval') {
      const when = getNextIntervalTrigger(reminder, settings, now.getTime());
      if (!when) continue;
      await chrome.alarms.create(alarmName, { when });
      console.log(`[带薪养生] 注册 interval 闹钟: ${alarmName}, 首次触发: ${new Date(when).toLocaleTimeString()}`);
    } else if (type === 'fixed') {
      const when = getNextFixedTrigger(reminder, settings, now.getTime());
      if (!when) continue;
      const target = new Date(when);
      await chrome.alarms.create(alarmName, { when });
      console.log(`[带薪养生] 注册 fixed 闹钟: ${alarmName}, 首次触发: ${target.toLocaleString()}`);
    } else if (type === 'monthly') {
      const targetDay = reminder.day || 15;
      const checkHour = reminder.time ? parseInt(reminder.time.split(':')[0], 10) : 10;
      const checkMinute = reminder.time ? parseInt(reminder.time.split(':')[1], 10) : 0;

      //
      const year = now.getFullYear();
      const month = now.getMonth();
      const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
      let target = new Date(
        year,
        month,
        Math.min(targetDay, lastDayThisMonth),
        checkHour,
        checkMinute,
        0,
        0
      );
      if (target.getTime() <= now.getTime()) {
        const nextMonth = month + 1;
        const nextYear = nextMonth > 11 ? year + 1 : year;
        const nextMonthIndex = nextMonth > 11 ? 0 : nextMonth;
        const lastDayNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate();
        target = new Date(
          nextYear,
          nextMonthIndex,
          Math.min(targetDay, lastDayNextMonth),
          checkHour,
          checkMinute,
          0,
          0
        );
      }
      await chrome.alarms.create(alarmName, {
        when: target.getTime()
      });
      console.log(`[带薪养生] 注册 monthly 闹钟: ${alarmName}, 首次触发: ${target.toLocaleString()}, 每月${targetDay}日`);
    }
  }

  //
  const resetName = 'moyu-daily-reset';
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  await chrome.alarms.create(resetName, {
    when: midnight.getTime(),
    periodInMinutes: 24 * 60
  });
}

function inferType(reminder) {
  if (reminder.type) return reminder.type;
  if (reminder.interval) return 'interval';
  if (reminder.time) return 'fixed';
  if (reminder.day) return 'monthly';
  return 'interval';
}

function isWorkdayForDate(date, settings) {
  const mode = settings.workDayMode || 'weekday';
  if (mode === 'daily') return true;
  if (mode === 'weekday') return date.getDay() >= 1 && date.getDay() <= 5;
  if (mode === 'workday2026') return isWorkingDay2026(date);
  if (mode === 'custom') return (settings.workDays || []).includes(date.getDay());
  return false;
}

function getNextIntervalTrigger(reminder, settings, fromTs = Date.now()) {
  const intervalMs = (reminder.unit === 'hour' ? reminder.interval * 60 : reminder.interval) * 60000;
  const [sH, sM] = ((settings.workHours && settings.workHours.start) || '09:00').split(':').map(Number);
  const [eH, eM] = ((settings.workHours && settings.workHours.end) || '18:00').split(':').map(Number);
  const lunch = settings.lunchBreak || { enabled: false };

  let cursor = new Date(fromTs + 1000);
  for (let guard = 0; guard < 370; guard++) {
    if (!isWorkdayForDate(cursor, settings)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(sH, sM, 0, 0);
      continue;
    }

    const dayStart = new Date(cursor);
    dayStart.setHours(sH, sM, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(eH, eM, 0, 0);

    if (cursor < dayStart) cursor = new Date(dayStart);
    if (cursor >= dayEnd) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(sH, sM, 0, 0);
      continue;
    }

    const elapsed = Math.max(0, cursor.getTime() - dayStart.getTime());
    let when = dayStart.getTime() + Math.ceil(elapsed / intervalMs) * intervalMs;
    if (when <= fromTs) when += intervalMs;
    if (when >= dayEnd.getTime()) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(sH, sM, 0, 0);
      continue;
    }

    if (lunch.enabled && lunch.start && lunch.end && reminder.id !== 'lunch') {
      const [lS, lM] = lunch.start.split(':').map(Number);
      const [lE, lE2] = lunch.end.split(':').map(Number);
      const lunchStart = new Date(dayStart); lunchStart.setHours(lS, lM, 0, 0);
      const lunchEnd = new Date(dayStart); lunchEnd.setHours(lE, lE2, 0, 0);
      if (when >= lunchStart.getTime() && when < lunchEnd.getTime()) {
        when = lunchEnd.getTime();
      }
    }

    if (when > fromTs) return when;
    cursor = new Date(when + intervalMs);
  }

  return null;
}

//
function isInLunchBreak(settings) {
  const lunch = settings.lunchBreak;
  if (!lunch || !lunch.enabled) return false;
  const now = new Date();
  const nowStr = now.toTimeString().slice(0, 5); // HH:mm
  return nowStr >= lunch.start && nowStr <= lunch.end;
}

//

//
const ACHIEVEMENTS_DEF = {
  water_today:          { emoji: '🥤', title: '今天总算喝水了',  desc: '当天喝水至少 1 杯',                     target: 1,    type: 'water_today' },
  hydration_master:     { emoji: '🙂', title: '活得挺认真',      desc: '连续 7 天喝水达标',                    target: 7,    type: 'consecutive' },
  water_consecutive_14: { emoji: '💦', title: '够水的',   desc: '连续 14 天喝水达标',                   target: 14,   type: 'consecutive' },
  water_single_day:     { emoji: '⛲', title: '工位小喷泉',      desc: '单日喝水达到 16 杯',                   target: 16,   type: 'water_single' },
  water_500:            { emoji: '🫗', title: '饮水机合伙人',    desc: '累计喝水 500 杯',                     target: 500,  type: 'water_total' },
  water_1000:           { emoji: '🌊', title: '水费重点客户',    desc: '累计喝水 1000 杯',                    target: 1000, type: 'water_total' },

  escape_today:         { emoji: '🏃', title: '今日已开溜',      desc: '当天尿遁至少 1 次',                    target: 1,    type: 'escape_today' },
  escape_5:             { emoji: '💨', title: '高频离岗选手',    desc: '当天尿遁达到 5 次',                    target: 5,    type: 'escape_today5' },
  escape_streak_5:      { emoji: '🥷', title: '遁术稳定发挥',    desc: '连续 5 天每天尿遁 >= 3 次',            target: 5,    type: 'escape_streak_min' },
  escape_500:           { emoji: '🚽', title: '洗手间常住人口', desc: '累计尿遁 500 次',                     target: 500,  type: 'escape_total' },
  escape_30:            { emoji: '🕵️', title: '遁法圆满',   desc: '连续 30 天每天尿遁 >= 3 次',           target: 30,   type: 'escape_streak_min' },

  gaze_today:           { emoji: '👀', title: '眼睛续命一次',    desc: '当天远眺至少 1 次',                    target: 1,    type: 'gaze_today' },
  gaze_streak:          { emoji: '👓', title: '护眼大师',    desc: '连续 5 天每天远眺 >= 5 次',            target: 5,    type: 'gaze_streak_min' },
  gaze_500:             { emoji: '🪟', title: '窗外关系户',      desc: '累计远眺 500 次',                     target: 500,  type: 'activity_total' },
  gaze_1000:            { emoji: '🛰️', title: '千里眼',    desc: '累计远眺 1000 次',                    target: 1000, type: 'activity_total' },

  all_today:            { emoji: '✅', title: '三件套打卡',      desc: '当天喝水+尿遁+远眺都完成',              target: 1,    type: 'all_today' },
  perfect_week:         { emoji: '🛌', title: '已躺平',  desc: '连续 5 天全项目完成',                  target: 5,    type: 'all_reminders_streak5' },
  no_skip:              { emoji: '🫠', title: '连续摆烂一个月',  desc: '连续 30 天全项目完成',                 target: 30,   type: 'all_reminders_streak' },

  rest_1:               { emoji: '🐂', title: '纯牛马',          desc: '当月休息日有 1 天响应',                 target: 1,    type: 'rest_days_1' },
  rest_4:               { emoji: '💼', title: '公司股东',        desc: '当月休息日有 4 天响应',                 target: 4,    type: 'rest_days_4' },
  rest_8:               { emoji: '🏠', title: '公司是我家',      desc: '当月休息日有 8 天响应',                 target: 8,    type: 'rest_days_8' },

  fishing_888:          { emoji: '🐟', title: '摸鱼大师',        desc: '累计响应提醒 888 次',                  target: 888,  type: 'reminders' },
  fishing_2888:         { emoji: '🧑‍🔬', title: '摸鱼专家',        desc: '累计响应提醒 2888 次',                 target: 2888, type: 'reminders' },
  fishing_legend:       { emoji: '👑', title: '摸鱼传说',        desc: '累计响应提醒 6666 次',                 target: 6666, type: 'reminders' }
};

//
async function checkAchievements() {
  const achievements = await getAchievements();
  let changed = false;

  for (const [key, def] of Object.entries(ACHIEVEMENTS_DEF)) {
    if (!achievements[key]) {
      achievements[key] = { progress: 0, target: def.target, unlocked: false };
    }
    if (achievements[key].unlocked) continue;

    switch (def.type) {
    //
    case 'consecutive':
      achievements[key].progress = await getConsecutiveDays();
      break;
    case 'water_total':
      achievements[key].progress = await getTotalWaterCount();
      break;
    case 'water_single':
      achievements[key].progress = await getMaxSingleDay();
      break;
    case 'water_today':
      achievements[key].progress = await getTodayWaterCount();
      break;

    //
    case 'reminders':
      achievements[key].progress = await getTotalRemindersReceived();
      break;

    //
    case 'activity_total':
      achievements[key].progress = await getGazeTotalCount();
      break;
    case 'gaze_streak':
      achievements[key].progress = await getGazeStreakMin(5);
      break;
    case 'gaze_today':
      achievements[key].progress = await getTodayGazeCount();
      break;

    //
    case 'escape_total':
      achievements[key].progress = await getTotalEscapeCount();
      break;
    case 'escape_streak_min':
      achievements[key].progress = await getEscapeStreakMin(3);
      break;
    case 'escape_today':
      achievements[key].progress = await getTodayEscapeCount();
      break;
    case 'escape_today5':
      achievements[key].progress = await getTodayEscapeCount();
      break;

    //
    case 'all_today':
      achievements[key].progress = await getAllTodayCompleteCount();
      break;
    case 'all_reminders_streak':
      achievements[key].progress = await getAllRemindersStreak(30);
      break;
    case 'all_reminders_streak5':
      achievements[key].progress = await getAllRemindersStreak(5);
      break;

    //
    case 'rest_days_1':
    case 'rest_days_4':
    case 'rest_days_8':
      achievements[key].progress = await getMonthRestDaysCount();
      break;
    }

    if (achievements[key].progress >= achievements[key].target) {
      achievements[key].unlocked = true;
      achievements[key].unlockedAt = new Date().toISOString();
    }
    changed = true;
  }

  if (changed) await saveAchievements(achievements);
}

//
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'show-notification') {
    showNotification(msg.data);
  }
  if (msg.type === 'check-achievements') {
    checkAchievements();
  }
  if (msg.type === 'water-drunk') {
    getSettings().then(s => scheduleAlarms(s));
  }
  if (msg.type === 'settings-updated') {
    getSettings().then(s => scheduleAlarms(s));
  }
});

async function showNotification(data, options = {}) {
  const { reminder, message } = data;
  const forceShow = Boolean(options.forceShow);

  //
  if (!forceShow && reminder.id !== 'lunch') {
    const settings = await getSettings();
    if (isInLunchBreak(settings)) {
      console.log(`[带薪养生] 午休中，跳过 ${reminder.id} 通知`);
      return;
    }
  }

  const opts = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
    title: `${reminder.emoji} ${reminder.title}`,
    message: message,
    priority: 2
  };

  if (reminder.id === 'water') {
    opts.buttons = [{ title: '💧 我喝了' }];
  } else if (reminder.id === 'gaze') {
    opts.buttons = [{ title: '👀 我看了' }];
  } else if (reminder.id === 'escape') {
    opts.buttons = [{ title: '🚻 我去了' }];
  } else {
    opts.buttons = [{ title: '✅ 收到' }];
  }

  //
  opts.buttons.push({ title: '⏰ 10分钟后' });
  opts.buttons.push({ title: '⏭ 跳过今天' });

  chrome.notifications.create(reminder.id + '-' + Date.now(), opts, (nid) => {
    if (chrome.runtime.lastError) {
      console.error('[带薪养生] 通知发送失败:', chrome.runtime.lastError.message, opts);
      return;
    }
    console.log(`[带薪养生] 通知已发送: ${nid}`);
    logReminderTrigger(reminder.id);
  });
}

function getNextFixedTrigger(reminder, settings, fromTs = Date.now()) {
  if (!reminder || !reminder.time) return null;

  const [hour, minute] = reminder.time.split(':').map(Number);
  const lunch = settings.lunchBreak || { enabled: false };
  let cursor = new Date(fromTs + 1000);

  for (let guard = 0; guard < 370; guard++) {
    if (!isWorkdayForDate(cursor, settings)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const target = new Date(cursor);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= fromTs) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (reminder.id !== 'lunch' && lunch.enabled && lunch.start && lunch.end) {
      const [lS, lM] = lunch.start.split(':').map(Number);
      const [lE, lE2] = lunch.end.split(':').map(Number);
      const lunchStart = new Date(target);
      lunchStart.setHours(lS, lM, 0, 0);
      const lunchEnd = new Date(target);
      lunchEnd.setHours(lE, lE2, 0, 0);
      if (target >= lunchStart && target < lunchEnd) {
        target.setHours(lE, lE2, 0, 0);
      }
    }

    if (target.getTime() > fromTs) return target.getTime();

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return null;
}

//
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
});

chrome.notifications.onButtonClicked.addListener((id, btnIdx) => {
  chrome.notifications.clear(id);
  if (id.includes('water')) {
    if (btnIdx === 0) {
      recordReminderResponse('water')
        .then(() => addWaterCup())
        .then(() => { getSettings().then(s => scheduleAlarms(s)); checkAchievements(); });
    }
    else if (btnIdx === 1) handleSnooze('water');
    else if (btnIdx === 2) handleSkipToday('water');
  } else if (id.includes('gaze')) {
    if (btnIdx === 0) {
      recordReminderResponse('gaze')
        .then(() => recordGazeResponse())
        .then(() => checkAchievements());
    }
    else if (btnIdx === 1) handleSnooze('gaze');
    else if (btnIdx === 2) handleSkipToday('gaze');
  } else if (id.includes('escape')) {
    if (btnIdx === 0) {
      recordReminderResponse('escape')
        .then(() => recordEscapeResponse())
        .then(() => checkAchievements());
    }
    else if (btnIdx === 1) handleSnooze('escape');
    else if (btnIdx === 2) handleSkipToday('escape');
  } else {
    const rid = reminderIdFromNotificationId(id);
    if (btnIdx === 0 && rid) {
      recordReminderResponse(rid).then(() => checkAchievements());
    } else if (btnIdx === 1) handleSnooze(rid);
    else if (btnIdx === 2) handleSkipToday(rid);
  }
});

function reminderIdFromNotificationId(nid) {
  if (!nid || typeof nid !== 'string') return '';

  //
  const legacy = nid.match(/^moyu-reminder-(.+)-\d+$/);
  if (legacy) return legacy[1];

  const idx = nid.lastIndexOf('-');
  if (idx <= 0) return '';
  const tail = nid.slice(idx + 1);
  if (!/^\d+$/.test(tail)) return '';
  return nid.slice(0, idx);
}

// ========== snooze / skip ==========
const SKIP_PREFIX = 'moyu-skip-';

async function handleSnooze(reminderId) {
  const triggerAt = Date.now() + 10 * 60000;
  try {
    const settings = await getSettings();
    const reminder = settings.reminders.find(r => r.id === reminderId);
    const type = reminder ? (reminder.type || inferType(reminder)) : 'interval';

    if (type === 'interval') {
      // interval 使用原闹钟名，10分钟后触发后会按 interval 逻辑续排
      const alarmName = ALARM_PREFIX + reminderId;
      await chrome.alarms.clear(alarmName);
      await chrome.alarms.create(alarmName, { when: triggerAt });
    } else {
      // fixed/monthly 使用独立 snooze 闹钟，避免破坏原有周期
      const snoozeName = `${SNOOZE_ALARM_PREFIX}${reminderId}-${Date.now()}`;
      await chrome.alarms.create(snoozeName, { when: triggerAt });
    }

    console.log(`[带薪养生] snooze ${reminderId}, 将在10分钟后提醒`);
  } catch (e) { console.error('[带薪养生] snooze 失败:', e); }
}

async function handleSkipToday(reminderId) {
  const today = localDateKey();
  const skipKey = SKIP_PREFIX + today;
  try {
    const r = await chrome.storage.local.get(skipKey);
    const skipped = r[skipKey] || [];
    if (!skipped.includes(reminderId)) {
      skipped.push(reminderId);
      await chrome.storage.local.set({ [skipKey]: skipped });
    }
    await chrome.alarms.clear(ALARM_PREFIX + reminderId);
    console.log(`[带薪养生] skip today ${reminderId}`);
  } catch (e) { console.error('[带薪养生] skip 失败:', e); }
}

async function isSkippedToday(reminderId) {
  const today = localDateKey();
  const skipKey = SKIP_PREFIX + today;
  try {
    const r = await chrome.storage.local.get(skipKey);
    return (r[skipKey] || []).includes(reminderId);
  } catch (e) { return false; }
}

//
chrome.alarms.onAlarm.addListener((alarm) => {
  const isRegularAlarm = alarm.name.startsWith(ALARM_PREFIX);
  const isSnoozeAlarm = alarm.name.startsWith(SNOOZE_ALARM_PREFIX);
  if (isRegularAlarm || isSnoozeAlarm) {
    const reminderId = isSnoozeAlarm
      ? reminderIdFromSnoozeAlarmName(alarm.name)
      : alarm.name.replace(ALARM_PREFIX, '');
    if (!reminderId) return;

    getSettings().then(settings => {
      const reminder = settings.reminders.find(r => r.id === reminderId);
      if (reminder && reminder.enabled) {
        const type = reminder.type || inferType(reminder);
        const now = new Date();
        const inWorkTime = isWorkingTime(
          now,
          (settings.workHours && settings.workHours.start) || '09:00',
          (settings.workHours && settings.workHours.end) || '18:00',
          settings.workDayMode || 'weekday',
          settings.workDays || []
        );

        if (!isSnoozeAlarm && type !== 'monthly' && !inWorkTime) {
          if (type === 'interval') {
            const nextWhen = getNextIntervalTrigger(reminder, settings, Date.now());
            if (nextWhen) chrome.alarms.create(alarm.name, { when: nextWhen });
          } else if (type === 'fixed') {
            const nextWhen = getNextFixedTrigger(reminder, settings, Date.now());
            if (nextWhen) chrome.alarms.create(alarm.name, { when: nextWhen });
          }
          return;
        }

        const messages = {
          water: getRandomWaterMessage(),
          escape: getRandomEscapeMessage(),
          gaze: getRandomActivityMessage(),
          lunch: '到午饭时间啦，记得吃饭🍱',
          offwork: '下班时间到！收拾东西准备回家🏠',
          salary: '发薪日快乐！💰'
        };
        showNotification({
          reminder: reminder,
          message: messages[reminderId] || getRandomTip()
        }, { forceShow: isSnoozeAlarm });

        if (!isSnoozeAlarm && type === 'interval') {
          const nextWhen = getNextIntervalTrigger(reminder, settings, Date.now());
          if (nextWhen) chrome.alarms.create(alarm.name, { when: nextWhen });
        } else if (!isSnoozeAlarm && type === 'fixed') {
          const nextWhen = getNextFixedTrigger(reminder, settings, Date.now());
          if (nextWhen) chrome.alarms.create(alarm.name, { when: nextWhen });
        }
      }
    });
  }
});

function reminderIdFromSnoozeAlarmName(alarmName) {
  if (!alarmName || typeof alarmName !== 'string') return '';
  if (!alarmName.startsWith(SNOOZE_ALARM_PREFIX)) return '';

  const body = alarmName.slice(SNOOZE_ALARM_PREFIX.length);
  const idx = body.lastIndexOf('-');
  if (idx <= 0) return '';
  const tail = body.slice(idx + 1);
  if (!/^\d+$/.test(tail)) return '';
  return body.slice(0, idx);
}

//
init();
checkAchievements();

//
setInterval(keepAlive, 60000);


















