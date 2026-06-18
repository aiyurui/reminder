// src/popup/popup.js
document.addEventListener('DOMContentLoaded', async () => {
  // 每个独立初始化，任何单步失败不阻断其余步骤
  try { await updateCurrentTime(); } catch (e) { console.error('updateCurrentTime error:', e); }
  try { await renderReminders(); } catch (e) { console.error('renderReminders error:', e); }
  try { await updateWaterProgress(); } catch (e) { console.error('updateWaterProgress error:', e); }
  try { await updateWorkStatus(); } catch (e) { console.error('updateWorkStatus error:', e); }
  try { await loadQuickStats(); } catch (e) { console.error('loadQuickStats error:', e); }

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-stats').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') });
  });

  const achBtn = document.getElementById('btn-achievements');
  if (achBtn) { achBtn.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('achievements/achievements.html') })); }

  const achRow = document.getElementById('btn-achievements-row');
  if (achRow) { achRow.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('achievements/achievements.html') })); }

  document.getElementById('btn-weekly-stats').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') });
  });

  setInterval(() => {
    updateCurrentTime();
    updateWorkStatus();
  }, 60000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settings-updated') { loadQuickStats(); }
    if (message.type === 'water-updated') { updateWaterProgress(); loadQuickStats(); }
  });

  // 监听存储变化，自动刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      renderReminders();
      updateWaterProgress();
      updateWorkStatus();
      loadQuickStats();
    }
  });
});

function updateCurrentTime() {
  const now = new Date();
  document.getElementById('current-time').textContent =
    now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function updateWorkStatus() {
  try {
    const settings = await getSettings();
    const now = new Date();
    const isWorking = isWorkingTime(
      now,
      settings.workHours.start,
      settings.workHours.end,
      settings.workDayMode,
      settings.workDays
    );
    const inLunch = isInLunchBreak(settings);
    const statusEl = document.getElementById('work-status');
    if (statusEl) {
      if (inLunch) {
        statusEl.textContent = '午休中';
        statusEl.style.background = 'rgba(76, 175, 80, 0.4)';
      } else {
        statusEl.textContent = isWorking ? '工作中' : '休息中';
        statusEl.style.background = isWorking ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)';
      }
    }
  } catch (e) {
    console.error('updateWorkStatus error:', e);
  }
}

async function renderReminders() {
  try {
    const settings = await getSettings();
    const list = document.getElementById('reminders-list');
    if (!list) return;

    list.innerHTML = '';

    if (!settings.reminders || settings.reminders.length === 0) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无提醒事项</div>';
      return;
    }

    for (const reminder of settings.reminders) {
      if (!reminder.enabled) continue;

      const item = document.createElement('div');
      item.className = 'reminder-item';

      let nextTimeStr = '';
      try {
        const nextTime = calculateNextTime(reminder, settings);
        nextTimeStr = formatNextTime(nextTime);
      } catch (e) {
        nextTimeStr = '待触发';
      }

      item.innerHTML = `
        <span class="reminder-emoji">${reminder.emoji}</span>
        <div class="reminder-info">
          <div class="reminder-name">${reminder.title}</div>
          <div class="reminder-countdown">${nextTimeStr}</div>
        </div>
        <span class="reminder-badge">待触发</span>
      `;

      list.appendChild(item);
    }
  } catch (e) {
    console.error('renderReminders error:', e);
    const list = document.getElementById('reminders-list');
    if (list) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">加载出错，请刷新</div>';
    }
  }
}

async function updateWaterProgress() {
  try {
    const settings = await getSettings();
    const daily = await getDailyWater();
    const count = daily.count;
    const goal = settings.waterGoal || 8;
    const percentage = Math.min((count / goal) * 100, 100);

    const countEl = document.getElementById('water-count');
    const fillEl = document.getElementById('water-fill');

    if (countEl) countEl.textContent = count + '/' + goal + ' 杯';
    if (fillEl) fillEl.style.width = percentage + '%';

    if (count >= goal && countEl) {
      countEl.textContent += ' 🏅';
    }
  } catch (e) {
    console.error('updateWaterProgress error:', e);
  }
}

async function loadQuickStats() {
  try {
    const weekly = await getWeeklyActiveDays();
    const weeklyEl = document.getElementById('weekly-stat-text');
    if (weeklyEl) weeklyEl.textContent = `本周 ${weekly.active}/${weekly.total} 天达标`;

    const achievements = await getAchievements();
    const totalAchievements = 24;  // 喝水6 + 尿遁5 + 远眺4 + 综合3 + 周末3 + 响应3
    const unlocked = Object.values(achievements).filter(a => a.unlocked).length;
    const achEl = document.getElementById('achievement-stat-text');
    if (achEl) achEl.textContent = '已解锁 ' + unlocked + '/' + totalAchievements + ' 成就';
  } catch (e) {
    console.error('loadQuickStats error:', e);
  }
}

function inferType(reminder) {
  if (reminder.type) return reminder.type;
  if (reminder.interval) return 'interval';
  if (reminder.time) return 'fixed';
  if (reminder.day) return 'monthly';
  return 'interval';
}

function calculateNextTime(reminder, settings) {
  const nowTs = Date.now();
  const type = inferType(reminder);

  if (type === 'interval') {
    return getNextIntervalTriggerForDisplay(reminder, settings, nowTs);
  }

  if (type === 'fixed') {
    return getNextFixedTriggerForDisplay(reminder, settings, nowTs);
  }

  if (type === 'monthly') {
    return getNextMonthlyTriggerForDisplay(reminder, nowTs);
  }

  return nowTs + 3600000;
}

function isWorkdayForDateDisplay(date, settings) {
  const mode = settings.workDayMode || 'weekday';
  if (mode === 'daily') return true;
  if (mode === 'weekday') return date.getDay() >= 1 && date.getDay() <= 5;
  if (mode === 'workday2026') return isWorkingDay2026(date);
  if (mode === 'custom') return (settings.workDays || []).includes(date.getDay());
  return false;
}

function getNextIntervalTriggerForDisplay(reminder, settings, fromTs = Date.now()) {
  const intervalMs = (reminder.unit === 'hour' ? reminder.interval * 60 : reminder.interval) * 60000;
  const [sH, sM] = ((settings.workHours && settings.workHours.start) || '09:00').split(':').map(Number);
  const [eH, eM] = ((settings.workHours && settings.workHours.end) || '18:00').split(':').map(Number);
  const lunch = settings.lunchBreak || { enabled: false };

  let cursor = new Date(fromTs + 1000);
  for (let guard = 0; guard < 370; guard++) {
    if (!isWorkdayForDateDisplay(cursor, settings)) {
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
      const lunchStart = new Date(dayStart);
      lunchStart.setHours(lS, lM, 0, 0);
      const lunchEnd = new Date(dayStart);
      lunchEnd.setHours(lE, lE2, 0, 0);
      if (when >= lunchStart.getTime() && when < lunchEnd.getTime()) {
        when = lunchEnd.getTime();
      }
    }

    if (when > fromTs) return when;
    cursor = new Date(when + intervalMs);
  }

  return fromTs + 3600000;
}

function getNextFixedTriggerForDisplay(reminder, settings, fromTs = Date.now()) {
  if (!reminder || !reminder.time) return fromTs + 3600000;

  const [hour, minute] = reminder.time.split(':').map(Number);
  const lunch = settings.lunchBreak || { enabled: false };
  let cursor = new Date(fromTs + 1000);

  for (let guard = 0; guard < 370; guard++) {
    if (!isWorkdayForDateDisplay(cursor, settings)) {
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

  return fromTs + 3600000;
}

function getNextMonthlyTriggerForDisplay(reminder, fromTs = Date.now()) {
  const now = new Date(fromTs);
  const targetDay = reminder.day || 15;
  const [hour, minute] = (reminder.time || '10:00').split(':').map(Number);

  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
  let target = new Date(year, month, Math.min(targetDay, lastDayThisMonth), hour, minute, 0, 0);

  if (target.getTime() <= fromTs) {
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    const nextMonthIndex = nextMonth > 11 ? 0 : nextMonth;
    const lastDayNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate();
    target = new Date(nextYear, nextMonthIndex, Math.min(targetDay, lastDayNextMonth), hour, minute, 0, 0);
  }

  return target.getTime();
}
