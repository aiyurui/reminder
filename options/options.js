document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await renderReminderCards();

  document.querySelectorAll('input[name="workday-mode"]').forEach(radio => {
    radio.addEventListener('change', onWorkDayModeChange);
  });

  document.getElementById('btn-save').addEventListener('click', saveSettingsHandler);
  document.getElementById('btn-reset').addEventListener('click', resetSettingsHandler);
  document.getElementById('btn-add-reminder').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeAddModal);
  document.getElementById('modal-cancel').addEventListener('click', closeAddModal);
  document.getElementById('modal-confirm').addEventListener('click', confirmAddReminder);

  // 提醒类型切换
  document.getElementById('new-reminder-type').addEventListener('change', onReminderTypeChange);

  // 午休开关切换
  document.getElementById('lunch-enabled').addEventListener('change', (e) => {
    document.getElementById('lunch-time-config').style.display = e.target.checked ? 'flex' : 'none';
  });

  // emoji 选择
  document.querySelectorAll('.emoji-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
    });
  });
});

function onWorkDayModeChange(e) {
  const customSection = document.getElementById('custom-weekdays');
  const info2026 = document.getElementById('workday2026-info');

  customSection.hidden = e.target.value !== 'custom';
  info2026.hidden = e.target.value !== 'workday2026';
}

function onReminderTypeChange(e) {
  const type = e.target.value;
  document.getElementById('interval-config').hidden = type !== 'interval';
  document.getElementById('fixed-config').hidden = type !== 'fixed';
  document.getElementById('monthly-config').hidden = type !== 'monthly';
}

function openAddModal() {
  document.getElementById('add-modal').classList.add('modal-open');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('modal-open');
  document.getElementById('new-reminder-title').value = '';
  document.getElementById('new-reminder-type').value = 'interval';
  document.getElementById('new-reminder-interval').value = '30';
  document.getElementById('new-reminder-unit').value = 'minute';
  document.getElementById('new-reminder-time').value = '12:00';
  document.getElementById('new-reminder-day').value = '15';
  onReminderTypeChange({ target: { value: 'interval' } });
}

async function confirmAddReminder() {
  const title = document.getElementById('new-reminder-title').value.trim();
  if (!title) {
    alert('请输入提醒名称');
    return;
  }

  const selectedEmoji = document.querySelector('.emoji-option.active')?.textContent || '📝';
  const type = document.getElementById('new-reminder-type').value;

  const newReminder = {
    id: 'custom-' + Date.now(),
    enabled: true,
    emoji: selectedEmoji,
    title: title,
    type: type
  };

  if (type === 'interval') {
    newReminder.interval = parseInt(document.getElementById('new-reminder-interval').value) || 30;
    newReminder.unit = document.getElementById('new-reminder-unit').value;
  } else if (type === 'fixed') {
    newReminder.time = document.getElementById('new-reminder-time').value;
  } else if (type === 'monthly') {
    newReminder.day = parseInt(document.getElementById('new-reminder-day').value) || 15;
  }

  const settings = await getSettings();
  if (!settings.reminders) settings.reminders = [];
  settings.reminders.push(newReminder);
  await saveSettings(settings);

  await renderReminderCards();
  closeAddModal();
  showStatus('提醒已添加 ✅');
}

async function deleteReminder(reminderId) {
  if (!confirm('确定要删除这个提醒吗？')) return;

  const settings = await getSettings();
  settings.reminders = settings.reminders.filter(r => r.id !== reminderId);
  await saveSettings(settings);

  await renderReminderCards();
  showStatus('提醒已删除 🗑️');
}

async function loadSettings() {
  const settings = await getSettings();

  const mode = settings.workDayMode || 'weekday';
  const modeRadio = document.getElementById(`mode-${mode}`);
  if (modeRadio) modeRadio.checked = true;

  if (mode === 'custom') {
    document.getElementById('custom-weekdays').hidden = false;
  } else {
    document.getElementById('custom-weekdays').hidden = true;
  }
  if (mode === 'workday2026') {
    document.getElementById('workday2026-info').hidden = false;
  } else {
    document.getElementById('workday2026-info').hidden = true;
  }

  if (settings.workDays) {
    document.querySelectorAll('.weekday-selector input').forEach(cb => {
      cb.checked = settings.workDays.includes(parseInt(cb.value));
    });
  }

  document.getElementById('work-start').value = settings.workHours.start;
  document.getElementById('work-end').value = settings.workHours.end;

  const lunch = settings.lunchBreak || { enabled: true, start: '11:30', end: '13:00' };
  document.getElementById('lunch-enabled').checked = lunch.enabled;
  document.getElementById('lunch-start').value = lunch.start;
  document.getElementById('lunch-end').value = lunch.end;
  document.getElementById('lunch-time-config').style.display = lunch.enabled ? 'flex' : 'none';
}

async function renderReminderCards() {
  const settings = await getSettings();
  const container = document.getElementById('reminder-cards');
  container.innerHTML = '';

  for (const reminder of settings.reminders) {
    const card = document.createElement('div');
    card.className = 'reminder-card';

    let configHtml = '';

    if (reminder.type === 'interval' || (!reminder.type && (reminder.id === 'water' || reminder.id === 'escape'))) {
      configHtml = `
        <div class="config-row">
          <label>间隔</label>
          <input type="number" class="config-input" id="${reminder.id}-interval" value="${reminder.interval || 30}" min="1" max="999">
          <span class="unit-label">${reminder.unit === 'hour' ? '小时' : '分钟'}</span>
        </div>
      `;
    } else if (reminder.type === 'fixed' || (!reminder.type && reminder.time)) {
      configHtml = `
        <div class="config-row">
          <label>时间</label>
          <input type="time" class="config-input" id="${reminder.id}-time" value="${reminder.time || '12:00'}">
        </div>
      `;
    } else if (reminder.type === 'monthly' || (!reminder.type && reminder.day)) {
      configHtml = `
        <div class="config-row">
          <label>日期</label>
          <input type="number" class="config-input" id="${reminder.id}-day" value="${reminder.day || 15}" min="1" max="31">
          <span class="unit-label">日</span>
        </div>
        <div class="config-row">
          <label>时间</label>
          <input type="time" class="config-input" id="${reminder.id}-time" value="${reminder.time || '10:00'}">
        </div>
      `;
    }

    const canDelete = reminder.id.startsWith('custom-');
    const deleteBtn = canDelete ? `<button class="btn-delete" data-id="${reminder.id}" title="删除">&times;</button>` : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${reminder.emoji} ${reminder.title}</span>
        <div style="display: flex; align-items: center;">
          <label class="toggle">
            <input type="checkbox" id="${reminder.id}-enabled" ${reminder.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          ${deleteBtn}
        </div>
      </div>
      <div class="card-config">${configHtml}</div>
    `;

    container.appendChild(card);
  }

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      deleteReminder(e.target.dataset.id);
    });
  });
}

async function saveSettingsHandler() {
  const currentSettings = await getSettings();
  const settings = { ...currentSettings };

  const modeRadio = document.querySelector('input[name="workday-mode"]:checked');
  if (modeRadio) {
    settings.workDayMode = modeRadio.value;
  }

  if (settings.workDayMode === 'custom') {
    settings.workDays = [];
    document.querySelectorAll('.weekday-selector input:checked').forEach(cb => {
      settings.workDays.push(parseInt(cb.value));
    });
  }

  settings.workHours.start = document.getElementById('work-start').value;
  settings.workHours.end = document.getElementById('work-end').value;

  settings.lunchBreak = {
    enabled: document.getElementById('lunch-enabled').checked,
    start: document.getElementById('lunch-start').value,
    end: document.getElementById('lunch-end').value
  };

  for (const reminder of settings.reminders) {
    const enabledCheckbox = document.getElementById(`${reminder.id}-enabled`);
    if (enabledCheckbox) {
      reminder.enabled = enabledCheckbox.checked;
    }

    const reminderType = reminder.type || inferType(reminder);

    if (reminderType === 'interval') {
      const intervalInput = document.getElementById(`${reminder.id}-interval`);
      if (intervalInput) {
        const parsedInterval = parseInt(intervalInput.value, 10);
        reminder.interval = Number.isFinite(parsedInterval) && parsedInterval > 0
          ? parsedInterval
          : (reminder.interval || 30);
      }
    }

    if (reminderType === 'fixed') {
      const timeInput = document.getElementById(`${reminder.id}-time`);
      if (timeInput) {
        reminder.time = timeInput.value;
      }
    }

    if (reminderType === 'monthly') {
      const dayInput = document.getElementById(`${reminder.id}-day`);
      const timeInput = document.getElementById(`${reminder.id}-time`);
      if (dayInput) {
        const parsedDay = parseInt(dayInput.value, 10);
        if (Number.isFinite(parsedDay)) {
          reminder.day = Math.min(31, Math.max(1, parsedDay));
        } else {
          reminder.day = reminder.day || 15;
        }
      }
      if (timeInput) {
        reminder.time = timeInput.value;
      }
    }
  }

  await saveSettings(settings);
  chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => {});

  showStatus('设置已保存 ✅');
}

async function resetSettingsHandler() {
  if (!confirm('确定要恢复默认设置吗？所有自定义配置将重置。')) return;

  const defaultClone = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  await saveSettings(defaultClone);
  await loadSettings();
  await renderReminderCards();
  showStatus('已恢复默认设置 🔄');
}

function showStatus(msg) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function inferType(reminder) {
  if (reminder.type) return reminder.type;
  if (reminder.interval) return 'interval';
  if (reminder.time) return 'fixed';
  if (reminder.day) return 'monthly';
  return 'interval';
}
