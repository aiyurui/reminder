const REMINDER_NAMES = {
  water: '🍵',
  escape: '🚽',
  gaze: '👀'
};

document.addEventListener('DOMContentLoaded', async () => {
  await renderReminderStats();
  setupToggleDetail();
});

function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return localDateKey(d);
}

function setupToggleDetail() {
  const btn = document.getElementById('btn-toggle-detail');
  const section = document.getElementById('detail-section');
  const arrow = btn.querySelector('.arrow');

  btn.addEventListener('click', async () => {
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▲' : '▼';

    if (isHidden && !section.innerHTML.includes('detail-row')) {
      await renderDetailList();
    }
  });
}

async function renderReminderStats() {
  const today = localDateKey();
  const weekStart = getWeekKey(new Date());
  const logs = await getReminderLogs(30);

  const stats = {
    water: { today: 0, week: 0, total: 0 },
    escape: { today: 0, week: 0, total: 0 },
    gaze: { today: 0, week: 0, total: 0 }
  };

  const totalDays = new Set(Object.keys(logs)).size || 1;

  for (const [date, entries] of Object.entries(logs)) {
    for (const entry of entries) {
      if (stats[entry.id]) {
        stats[entry.id].total++;
        if (date === today) stats[entry.id].today++;
        if (date >= weekStart) stats[entry.id].week++;
      }
    }
  }

  for (const [id, data] of Object.entries(stats)) {
    document.getElementById(`${id}-today`).textContent = data.today;
    document.getElementById(`${id}-week`).textContent = data.week;
    const avg = totalDays > 0 ? (data.total / totalDays).toFixed(1) : 0;
    document.getElementById(`${id}-avg`).textContent = avg;
  }
}

async function renderDetailList() {
  const logs = await getReminderLogs(7);
  const container = document.getElementById('detail-list');

  if (Object.keys(logs).length === 0) {
    container.innerHTML = '<div class="empty-msg">近7天无提醒记录</div>';
    return;
  }

  const dates = Object.keys(logs).sort().reverse();
  let html = '';

  for (const date of dates) {
    const entries = logs[date];
    const countByType = {};
    entries.forEach((e) => {
      countByType[e.id] = (countByType[e.id] || 0) + 1;
    });

    const parts = Object.entries(countByType)
      .map(([id, count]) => `${REMINDER_NAMES[id] || '📝'} ${count}次`)
      .join(' | ');

    html += `
      <div class="detail-row">
        <span class="detail-date">${date}</span>
        <span class="detail-count">${entries.length}次</span>
        <span class="detail-types">${parts}</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

document.getElementById('btn-back').addEventListener('click', () => {
  window.close();
});
