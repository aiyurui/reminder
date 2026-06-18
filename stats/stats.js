const REMINDER_NAMES = {
  water: '🍵',
  escape: '🚽',
  gaze: '👀',
  lunch: '🍜',
  offwork: '🏔️',
  salary: '💵'
};

document.addEventListener('DOMContentLoaded', async () => {
  await renderStats();
  await renderTrendChart();
  await renderReminderDetail();
  setupDetailToggle();
});

function getMonthKey(date) {
  return localDateKey(date).slice(0, 7);
}

async function renderStats() {
  const today = localDateKey();
  const thisMonth = getMonthKey(new Date());

  const daily = await getDailyWater();
  const waterHistory = await getWaterHistory();
  const monthCups = Object.entries(waterHistory)
    .filter(([d]) => d.startsWith(thisMonth))
    .reduce((s, [, v]) => s + (v.count || 0), 0);
  const monthDays = new Set(Object.keys(waterHistory).filter((d) => d.startsWith(thisMonth))).size;
  const waterAvg = monthDays > 0 ? (monthCups / monthDays).toFixed(1) : 0;

  document.getElementById('water-today').textContent = daily.count;
  document.getElementById('water-month').textContent = monthCups;
  document.getElementById('water-avg').textContent = waterAvg;

  const escapeHistory = await getEscapeHistory();
  const todayEscape = escapeHistory[today] || 0;
  const monthEscape = Object.entries(escapeHistory)
    .filter(([d]) => d.startsWith(thisMonth))
    .reduce((s, [, c]) => s + c, 0);
  const escapeAvg = monthDays > 0 ? (monthEscape / monthDays).toFixed(1) : 0;

  document.getElementById('escape-today').textContent = todayEscape;
  document.getElementById('escape-month').textContent = monthEscape;
  document.getElementById('escape-avg').textContent = escapeAvg;

  const gazeHistory = await getGazeHistory();
  const todayGaze = gazeHistory[today] || 0;
  const monthGaze = Object.entries(gazeHistory)
    .filter(([d]) => d.startsWith(thisMonth))
    .reduce((s, [, c]) => s + c, 0);
  const gazeAvg = monthDays > 0 ? (monthGaze / monthDays).toFixed(1) : 0;

  document.getElementById('gaze-today').textContent = todayGaze;
  document.getElementById('gaze-month').textContent = monthGaze;
  document.getElementById('gaze-avg').textContent = gazeAvg;
}

function setupDetailToggle() {
  const toggle = document.getElementById('detail-toggle');
  const list = document.getElementById('detail-list');

  toggle.addEventListener('click', () => {
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'block' : 'none';
    toggle.textContent = `近7日提醒详情 ${isHidden ? '▲' : '▼'}`;
  });

  list.style.display = 'none';
}

async function renderReminderDetail() {
  const logs = await getReminderLogs(7);
  const list = document.getElementById('detail-list');

  if (Object.keys(logs).length === 0) {
    list.innerHTML = '<div class="empty-msg">近7天无提醒记录</div>';
    return;
  }

  const groups = {};
  for (const [date, entries] of Object.entries(logs)) {
    for (const entry of entries) {
      const timeMs = typeof entry.time === 'number' ? entry.time : parseInt(entry.time, 10);
      const time = new Date(timeMs);
      const hh = String(time.getHours()).padStart(2, '0');
      const mm = String(time.getMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;
      const key = `${date} ${timeStr}`;

      if (!groups[key]) {
        groups[key] = { emojis: [], date, timeStr, sortDate: date, sortTime: timeStr };
      }
      const emoji = REMINDER_NAMES[entry.id] || '📝';
      if (!groups[key].emojis.includes(emoji)) {
        groups[key].emojis.push(emoji);
      }
    }
  }

  const sortedGroups = Object.entries(groups)
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => {
      if (b.sortDate !== a.sortDate) {
        return b.sortDate.localeCompare(a.sortDate);
      }
      return b.sortTime.localeCompare(a.sortTime);
    });

  let html = '';
  for (const group of sortedGroups) {
    html += `
      <div class="reminder-item">
        <span class="reminder-date">${group.date}</span>
        <span class="reminder-time">${group.timeStr}</span>
        <span class="reminder-emoji">${group.emojis.join(' ')}</span>
      </div>
    `;
  }

  list.innerHTML = html;
}

async function renderTrendChart() {
  const data = await getTrendData(30);
  if (data.length < 2) return;

  const chart = document.getElementById('line-chart');
  chart.innerHTML = '';

  const maxVal = Math.max(...data.map((d) => Math.max(d.water, d.escape, d.gaze)), 5);

  const width = chart.offsetWidth || 340;
  const height = 160;
  const padding = { top: 15, right: 30, bottom: 28, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + (chartHeight / yTicks) * i;
    const val = Math.round(maxVal - (maxVal / yTicks) * i);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padding.left);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width - padding.right);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#E5E7EB');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', padding.left - 5);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', '#6B7280');
    text.textContent = val;
    svg.appendChild(text);
  }

  const drawLine = (key, color) => {
    const values = data.map((d) => d[key]);
    if (values.every((v) => v === 0)) return null;

    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - (d[key] / maxVal) * chartHeight;
      return `${x},${y}`;
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    path.setAttribute('points', points.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    return path;
  };

  const drawDots = (key, color) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    data.forEach((d, i) => {
      if (d[key] === 0) return;
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - (d[key] / maxVal) * chartHeight;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', color);
      g.appendChild(circle);
    });
    return g;
  };

  const labelCount = Math.min(6, data.length);
  const labelStep = Math.max(1, Math.floor(data.length / labelCount));
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', height - 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', '#6B7280');
    text.textContent = d.label;
    svg.appendChild(text);
  });

  const waterLine = drawLine('water', '#5B7BA3');
  const escapeLine = drawLine('escape', '#E8A838');
  const gazeLine = drawLine('gaze', '#10B981');
  if (waterLine) svg.appendChild(waterLine);
  if (escapeLine) svg.appendChild(escapeLine);
  if (gazeLine) svg.appendChild(gazeLine);
  svg.appendChild(drawDots('water', '#5B7BA3'));
  svg.appendChild(drawDots('escape', '#E8A838'));
  svg.appendChild(drawDots('gaze', '#10B981'));

  chart.appendChild(svg);
}

document.getElementById('btn-back').addEventListener('click', () => {
  window.close();
});
