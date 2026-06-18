const ACHIEVEMENTS_DEF = {
  water_today: { emoji: '🥤', title: '今天总算喝水了', desc: '当天喝水至少 1 杯', target: 1, type: 'water_today' },
  hydration_master: { emoji: '🙂', title: '活得挺认真', desc: '连续 7 天喝水达标', target: 7, type: 'consecutive' },
  water_consecutive_14: { emoji: '💦', title: '够水的', desc: '连续 14 天喝水达标', target: 14, type: 'consecutive' },
  water_single_day: { emoji: '⛲', title: '工位小喷泉', desc: '单日喝水达到 16 杯', target: 16, type: 'water_single' },
  water_500: { emoji: '🫗', title: '饮水机合伙人', desc: '累计喝水 500 杯', target: 500, type: 'water_total' },
  water_1000: { emoji: '🌊', title: '水费重点客户', desc: '累计喝水 1000 杯', target: 1000, type: 'water_total' },

  escape_today: { emoji: '🏃', title: '今日已开溜', desc: '当天尿遁至少 1 次', target: 1, type: 'escape_today' },
  escape_5: { emoji: '💨', title: '高频离岗选手', desc: '当天尿遁达到 5 次', target: 5, type: 'escape_today5' },
  escape_streak_5: { emoji: '🥷', title: '遁术稳定发挥', desc: '连续 5 天每天尿遁 >= 3 次', target: 5, type: 'escape_streak_min' },
  escape_500: { emoji: '🚽', title: '洗手间常住人口', desc: '累计尿遁 500 次', target: 500, type: 'escape_total' },
  escape_30: { emoji: '🕵️', title: '遁法圆满', desc: '连续 30 天每天尿遁 >= 3 次', target: 30, type: 'escape_streak_min' },

  gaze_today: { emoji: '👀', title: '眼睛续命一次', desc: '当天远眺至少 1 次', target: 1, type: 'gaze_today' },
  gaze_streak: { emoji: '👓', title: '护眼大师', desc: '连续 5 天每天远眺 >= 5 次', target: 5, type: 'gaze_streak_min' },
  gaze_500: { emoji: '🪟', title: '窗外关系户', desc: '累计远眺 500 次', target: 500, type: 'activity_total' },
  gaze_1000: { emoji: '🛰️', title: '千里眼', desc: '累计远眺 1000 次', target: 1000, type: 'activity_total' },

  all_today: { emoji: '✅', title: '三件套打卡', desc: '当天喝水+尿遁+远眺都完成', target: 1, type: 'all_today' },
  perfect_week: { emoji: '🛌', title: '已躺平', desc: '连续 5 天全项目完成', target: 5, type: 'all_reminders_streak5' },
  no_skip: { emoji: '🫠', title: '连续摆烂一个月', desc: '连续 30 天全项目完成', target: 30, type: 'all_reminders_streak' },

  rest_1: { emoji: '🐂', title: '纯牛马', desc: '当月休息日有 1 天响应', target: 1, type: 'rest_days_1' },
  rest_4: { emoji: '💼', title: '公司股东', desc: '当月休息日有 4 天响应', target: 4, type: 'rest_days_4' },
  rest_8: { emoji: '🏠', title: '公司是我家', desc: '当月休息日有 8 天响应', target: 8, type: 'rest_days_8' },

  fishing_888: { emoji: '🐟', title: '摸鱼大师', desc: '累计响应提醒 888 次', target: 888, type: 'reminders' },
  fishing_2888: { emoji: '🧑‍🔬', title: '摸鱼专家', desc: '累计响应提醒 2888 次', target: 2888, type: 'reminders' },
  fishing_legend: { emoji: '👑', title: '摸鱼传说', desc: '累计响应提醒 6666 次', target: 6666, type: 'reminders' }
};

document.addEventListener('DOMContentLoaded', async () => {
  await renderAchievements();
  await renderAvatar();
  await renderBadges();
});

function getAvatarState(unlockedCount) {
  if (unlockedCount === 0) return { emoji: '🎣', text: '摸鱼中...' };
  if (unlockedCount <= 4) return { emoji: '😎', text: '摸鱼新手' };
  if (unlockedCount <= 8) return { emoji: '🎣', text: '摸鱼达人' };
  if (unlockedCount <= 12) return { emoji: '🏆', text: '摸鱼大师' };
  return { emoji: '👑', text: '摸鱼王者' };
}

async function renderAvatar() {
  const achievements = await getAchievements();
  const unlockedCount = Object.values(achievements).filter((a) => a.unlocked).length;
  const state = getAvatarState(unlockedCount);
  const avatar = document.getElementById('avatar');
  const bubble = document.getElementById('avatar-bubble');
  if (avatar) avatar.textContent = state.emoji;
  if (bubble) bubble.textContent = state.text;
}

async function renderBadges() {
  const achievements = await getAchievements();
  const row = document.getElementById('badges-row');
  if (!row) return;
  row.innerHTML = '';

  const categoryOrder = [
    ['water_today', 'hydration_master', 'water_consecutive_14', 'water_single_day', 'water_500', 'water_1000'],
    ['escape_today', 'escape_5', 'escape_streak_5', 'escape_500', 'escape_30'],
    ['gaze_today', 'gaze_streak', 'gaze_500', 'gaze_1000'],
    ['all_today', 'perfect_week', 'no_skip'],
    ['rest_1', 'rest_4', 'rest_8', 'fishing_888', 'fishing_2888', 'fishing_legend']
  ];
  const flatOrder = categoryOrder.flat();

  const unlockedKeys = [];
  const lockedKeys = [];
  for (const key of flatOrder) {
    const def = ACHIEVEMENTS_DEF[key];
    if (!def) continue;
    const data = achievements[key];
    if (data && data.unlocked) {
      unlockedKeys.push(key);
    } else {
      lockedKeys.push(key);
    }
  }

  const orderedKeys = unlockedKeys.length > 0
    ? [...unlockedKeys, ...lockedKeys]
    : flatOrder.filter((k) => ACHIEVEMENTS_DEF[k]);

  orderedKeys.forEach((key) => {
    const def = ACHIEVEMENTS_DEF[key];
    if (!def) return;
    const span = document.createElement('span');
    span.className = 'badge-item';
    span.textContent = def.emoji;
    span.title = def.title;
    const isUnlocked = unlockedKeys.includes(key);
    if (isUnlocked) span.classList.add('unlocked');
    row.appendChild(span);
  });
}

async function renderAchievements() {
  const achievements = await getAchievements();
  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = '';

  const categoryOrder = [
    ['water_today', 'hydration_master', 'water_consecutive_14', 'water_single_day', 'water_500', 'water_1000'],
    ['escape_today', 'escape_5', 'escape_streak_5', 'escape_500', 'escape_30'],
    ['gaze_today', 'gaze_streak', 'gaze_500', 'gaze_1000'],
    ['all_today', 'perfect_week', 'no_skip'],
    ['rest_1', 'rest_4', 'rest_8', 'fishing_888', 'fishing_2888', 'fishing_legend']
  ];
  const flatOrder = categoryOrder.flat();

  const unlockedKeys = [];
  const lockedKeys = [];
  for (const key of flatOrder) {
    const def = ACHIEVEMENTS_DEF[key];
    if (!def) continue;
    const data = achievements[key] || { progress: 0, target: def.target, unlocked: false };
    if (data.unlocked) unlockedKeys.push(key);
    else lockedKeys.push(key);
  }

  const sortedKeys = unlockedKeys.length > 0 ? [...unlockedKeys, ...lockedKeys] : flatOrder.filter((k) => ACHIEVEMENTS_DEF[k]);

  let unlockedCount = 0;
  const total = sortedKeys.length;

  for (const key of sortedKeys) {
    const def = ACHIEVEMENTS_DEF[key];
    const data = achievements[key] || { progress: 0, target: def.target, unlocked: false };

    const card = document.createElement('div');
    card.className = `ach-card ${data.unlocked ? 'unlocked' : 'locked'}`;

    const pct = Math.min((data.progress / def.target) * 100, 100);

    card.innerHTML = `
      ${data.unlocked ? '<span class="ach-badge">已解锁</span>' : ''}
      <div class="ach-emoji">${def.emoji}</div>
      <div class="ach-title">${def.title}</div>
      <div class="ach-desc">${def.desc}</div>
      <div class="ach-progress-bar">
        <div class="ach-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="ach-progress-text">${data.progress} / ${def.target}</div>
    `;

    grid.appendChild(card);
    if (data.unlocked) unlockedCount++;
  }

  const fill = document.getElementById('overall-fill');
  const text = document.getElementById('overall-text');
  const overallPct = total > 0 ? (unlockedCount / total) * 100 : 0;
  fill.style.width = `${overallPct}%`;
  text.textContent = `${unlockedCount}/${total}`;
}

document.getElementById('btn-back').addEventListener('click', () => {
  window.close();
});













