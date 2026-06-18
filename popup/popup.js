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

  setInterval(updateCurrentTime, 60000);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settings-updated') { loadQuickStats(); }
    if (message.type === 'water-updated') { updateWaterProgress(); loadQuickStats(); }
  });

  // 监听存储变化，自动刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      renderReminders();
      updateWaterProgress();
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
  const now = new Date();
  const type = inferType(reminder);

  if (type === 'interval') {
    const minutes = reminder.unit === 'hour' ? reminder.interval * 60 : reminder.interval;
    const intervalMs = minutes * 60000;

    const wStart = (settings.workHours && settings.workHours.start) || '09:00';
    const wEnd = (settings.workHours && settings.workHours.end) || '18:00';
    const [sH, sM] = wStart.split(':').map(Number);
    const [eH, eM] = wEnd.split(':').map(Number);

    const dayStart = new Date(now);
    dayStart.setHours(sH, sM, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(eH, eM, 0, 0);

    const elapsed = now.getTime() - dayStart.getTime();
    const inWork = now.getTime() >= dayStart.getTime() && now.getTime() < dayEnd.getTime();
    const nextDayStart = new Date(dayStart.getTime() + 86400000);
    const anchor = dayStart.getTime();

    let next;
    if (elapsed < 0) {
      next = anchor;
    } else if (!inWork) {
      next = nextDayStart.getTime() + intervalMs;
    } else {
      next = anchor + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
    }
    return next;
  }

  if (type === 'fixed') {
    const [h, m] = reminder.time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  if (type === 'monthly') {
    const nowDate = new Date();
    const target = new Date(nowDate.getFullYear(), nowDate.getMonth(), reminder.day);
    const [h, m] = (reminder.time || '10:00').split(':').map(Number);
    target.setHours(h, m, 0, 0);
    if (target <= nowDate) {
      target.setMonth(target.getMonth() + 1);
    }
    return target.getTime();
  }

  return now.getTime() + 3600000;
}