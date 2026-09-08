'use strict';

/* =====================================================
 *  Сбор палетов — логика приложения
 *  Настройки (Telegram, SSCC) лежат в config.js
 * ===================================================== */

/* ---------- Состояние ---------- */
let rows = [];            // [{ code: string }]
let selectedIndex = -1;   // выбранная строка (для удаления)
let lastFile = null;      // { blob, fileName } последнего сформированного файла

const STORAGE_KEY = 'pallet-draft';

/* ---------- Элементы ---------- */
const $ = (id) => document.getElementById(id);
const screenHome = $('screen-home');
const screenCollect = $('screen-collect');
const screenDone = $('screen-done');
const codeInput = $('code-input');
const rowsBox = $('rows');
const counter = $('counter');
const btnDelete = $('btn-delete');
const btnFinish = $('btn-finish');
const modal = $('modal');
const modalCount = $('modal-count');
const nameInput = $('pallet-name');
const btnSend = $('btn-send');
const toast = $('toast');

/* ---------- Переключение экранов ---------- */
function showScreen(name) {
  screenHome.classList.toggle('hidden', name !== 'home');
  screenCollect.classList.toggle('hidden', name !== 'collect');
  screenDone.classList.toggle('hidden', name !== 'done');
  if (name === 'collect') setTimeout(() => codeInput.focus(), 50);
}

/* ---------- Черновик (защита от потери при перезагрузке) ---------- */
function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.map(r => r.code))); } catch (e) {}
}
function loadDraft() {
  try {
    rows = (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(c => ({ code: c }));
  } catch (e) { rows = []; }
}
function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

/* ---------- Уведомление (само исчезает через ~2 сек) ---------- */
let toastTimer = null;
function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.classList.toggle('toast-error', isError);
  toast.classList.remove('hide');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.classList.remove('show', 'hide'), 300);
  }, 1700);
}

/* ---------- Неприятный звук ошибки (генерируем, файл не нужен) ---------- */
let audioCtx = null;
function playErrorSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.setValueAtTime(150, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  } catch (e) { /* звук не критичен */ }
}

/* ---------- Склонение слов ---------- */
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ---------- Рендер списка кодов ---------- */
function renderRows(scroll = true) {
  rowsBox.innerHTML = '';
  rows.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'row' + (i === selectedIndex ? ' selected' : '');
    const num = document.createElement('span');
    num.className = 'row-num';
    num.textContent = i + 1;
    const code = document.createElement('span');
    code.className = 'row-code';
    code.textContent = r.code;
    div.append(num, code);
    div.addEventListener('click', () => selectRow(i));
    rowsBox.appendChild(div);
  });
  if (scroll) rowsBox.scrollTop = rowsBox.scrollHeight;
  updateBar();
}

function updateBar() {
  const n = rows.length;
  counter.textContent = `${n} ${plural(n, 'код', 'кода', 'кодов')}`;
  btnDelete.disabled = selectedIndex < 0;
  btnFinish.disabled = n === 0;
}

function selectRow(i) {
  selectedIndex = (selectedIndex === i) ? -1 : i;
  renderRows(false);
}

/* ---------- Добавление кода ---------- */
function addCode(raw) {
  const code = raw.trim();
  if (!code) return;
  if (rows.some(r => r.code === code)) {
    showToast('Такой код уже есть в списке', true);
    playErrorSound();
    return;
  }
  rows.push({ code });
  selectedIndex = -1;
  renderRows();
  saveDraft();
}

/* ---------- Удаление выбранной строки ---------- */
function deleteSelected() {
  if (selectedIndex < 0) return;
  rows.splice(selectedIndex, 1);
  selectedIndex = -1;
  renderRows(); // порядковые номера пересчитаются сами
  saveDraft();
  codeInput.focus();
}

/* ---------- Модалка с названием палета ---------- */
function openNameModal() {
  if (!rows.length) return;
  modalCount.textContent = `Кодов в палете: ${rows.length}`;
  nameInput.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
}

function closeNameModal() {
  modal.classList.add('hidden');
}

/* ---------- SSCC: контрольная цифра GS1 (mod 10) ---------- */
function ssccCheckDigit(body17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const w = (i % 2 === 0) ? 3 : 1; // позиции слева 1,3,5… → вес 3
    sum += Number(body17[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

/* SSCC-18: [случайная 1..9] + [префикс компании] + [6 случайных] + [контрольная].
   Генерируется ОДИН на весь палет и повторяется в каждой строке Excel. */
function generateSSCC() {
  const ext = String(1 + Math.floor(Math.random() * 9));
  let serial = '';
  for (let i = 0; i < 6; i++) serial += Math.floor(Math.random() * 10);
  const body17 = ext + SSCC_PREFIX + serial;
  return body17 + ssccCheckDigit(body17);
}

/* ---------- Excel: 1-я колонка — коды, 2-я — SSCC ---------- */
function buildExcelFile() {
  if (typeof XLSX === 'undefined') {
    throw new Error('Библиотека Excel не загрузилась. При первом открытии нужен интернет');
  }
  const sscc = generateSSCC(); // один SSCC на весь палет
  const data = rows.map((r) => [r.code, sscc]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 24 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Палет');
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ---------- Отправка в Telegram ---------- */
async function sendToTelegram(blob, fileName, caption) {
  const form = new FormData();
  form.append('chat_id', TELEGRAM_CHAT_ID);
  form.append('document', blob, fileName);
  form.append('caption', caption);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // не висеть вечно
  try {
    const resp = await fetch(
      'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendDocument',
      { method: 'POST', body: form, signal: controller.signal }
    );
    if (!resp.ok) throw new Error('Сеть: HTTP ' + resp.status);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.description || 'Ошибка Telegram');
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Отправка на почту (EmailJS) ---------- */
function loadEmailJS() {
  return new Promise((resolve, reject) => {
    if (typeof emailjs !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js';
    const timer = setTimeout(() =>
      reject(new Error('Библиотека EmailJS не загрузилась за 15 сек (сеть режет cdn.jsdelivr.net?)')), 15000);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('Не удалось загрузить библиотеку EmailJS')); };
    document.head.appendChild(s);
  });
}

/* Ограничитель: любой запрос не может висеть вечно */
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл для почты'));
    reader.readAsDataURL(blob);
  });
}

async function sendByEmail(blob, fileName, caption) {
  await loadEmailJS();
  if (EMAILJS_PUBLIC_KEY) emailjs.init(EMAILJS_PUBLIC_KEY);
  const content = await blobToBase64(blob);
  const resp = await withTimeout(
    emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        caption: caption,
        message: `Палет «${caption}», кодов: ${rows.length}`,
        attachments: [{ name: fileName, content: content, encoding: 'base64' }],
      }
    ),
    30000,
    'Почта не ответила за 30 секунд — сеть режет api.emailjs.com?'
  );
  if (resp.status !== 200) throw new Error('EmailJS: HTTP ' + resp.status);
}

/* ---------- Диагностика: что именно не работает ---------- */
async function runDiagnostics() {
  const parts = [];
  parts.push(navigator.onLine
    ? '📶 Интернет на устройстве: есть'
    : '📵 Интернет на устройстве: НЕТ — проверьте Wi-Fi');

  const d = new Date();
  if (d.getFullYear() < 2020) {
    parts.push('🕐 ВНИМАНИЕ: дата на устройстве (' + d.toLocaleDateString() +
               ') сбита — из-за этого ломается защищённое соединение. Поставьте правильную дату/время!');
  }

  // Пробуем почтовый API (EmailJS)
  if (EMAILJS_PUBLIC_KEY) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      await fetch('https://api.emailjs.com', { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      parts.push('📧 api.emailjs.com: доступен');
    } catch (err) {
      parts.push('🚫 api.emailjs.com: НЕДОСТУПЕН с устройства — ' + err.message);
    }
  }

  // Пробуем Telegram API
  if (!TELEGRAM_BOT_TOKEN) {
    parts.push('✈️ Telegram: не настроен (токен пуст)');
    return parts;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(
      'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/getMe',
      { signal: controller.signal, cache: 'no-store' }
    );
    clearTimeout(timer);
    if (!resp.ok) {
      parts.push('✈️ Telegram API: ответил HTTP ' + resp.status);
      return parts;
    }
    const json = await resp.json();
    parts.push(json.ok
      ? '✈️ Telegram API: доступен, бот «' + json.result.username + '» отвечает'
      : '✈️ Telegram API: отвечает, но бот вернул ошибку — ' + (json.description || 'неизвестно'));
  } catch (err) {
    parts.push('🚫 Telegram API: НЕДОСТУПЕН с устройства — ' + err.message +
               ' (сеть режет адрес api.telegram.org?)');
  }
  return parts;
}

/* ---------- Скачивание файла (запасной путь) ---------- */
function downloadBlob(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- Вспомогательное ---------- */
function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pallet';
}
function timestamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------- Экран результата ---------- */
function showDoneScreen(mode, title, sub) {
  $('done-icon').textContent = mode === 'success' ? '✅' : (mode === 'local' ? '💾' : '⚠️');
  $('done-title').textContent = title;
  $('done-sub').textContent = sub;
  showScreen('done');
}

/* ---------- Главный поток: сформировать и отправить ---------- */
async function sendPallet() {
  if (btnSend.disabled) return;
  const rawName = nameInput.value.trim();
  const baseName = rawName || ('pallet_' + timestamp());
  const fileName = sanitizeFileName(baseName) + '.xlsx';

  btnSend.disabled = true;
  btnSend.textContent = 'Отправка…';
  try {
    const blob = buildExcelFile();
    lastFile = { blob, fileName };

    const mode = (typeof SEND_MODE === 'string') ? SEND_MODE : 'email';
    const emailReady = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
    const tgReady = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
    const wantEmail = emailReady && (mode === 'email' || mode === 'both');
    const wantTg = tgReady && (mode === 'telegram' || mode === 'both');

    if (!wantEmail && !wantTg) {
      // Каналы не настроены — просто скачиваем файл
      downloadBlob(blob, fileName);
      modal.classList.add('hidden');
      showDoneScreen('local', 'Файл сохранён',
        `Файл «${fileName}» скачан на устройство.\nЗаполните config.js — и файлы будут отправляться сами.`);
      return;
    }

    // Каналы работают параллельно: медленный Telegram не задерживает почту
    const tasks = [];
    if (wantEmail) tasks.push(sendByEmail(blob, fileName, baseName));
    if (wantTg) tasks.push(sendToTelegram(blob, fileName, baseName));
    const results = await withTimeout(
      Promise.allSettled(tasks),
      60000,
      'Отправка заняла больше минуты — что-то зависло, прерываю'
    );

    const reason = (r) =>
      (r.reason && (r.reason.message || r.reason.text)) || String(r.reason || '');
    let i = 0;
    const delivered = [], problems = [];
    if (wantEmail) {
      const r = results[i++];
      (r.status === 'fulfilled' ? delivered : problems).push('📧 почта' + (r.status === 'rejected' ? ': ' + reason(r) : ''));
    }
    if (wantTg) {
      const r = results[i++];
      (r.status === 'fulfilled' ? delivered : problems).push('✈️ Telegram' + (r.status === 'rejected' ? ': ' + reason(r) : ''));
    }

    if (delivered.length) {
      clearDraft();
      modal.classList.add('hidden');
      const problemsTxt = problems.length ? '\nНе сработало: ' + problems.join('; ') : '';
      showDoneScreen('success', `Палет «${baseName}» отправлен`,
        `Файл ${fileName}\nДоставлено: ${delivered.join(' + ')}.${problemsTxt}`);
      return;
    }

    // Всё упало — отдаём файл на устройство и показываем диагноз
    const diag = await runDiagnostics();
    downloadBlob(lastFile.blob, lastFile.fileName);
    modal.classList.add('hidden');
    showDoneScreen('error', 'Не удалось отправить',
      problems.join('\n') + '\n\n' + diag.join('\n') +
      `\n\nФайл скачан на устройство: «${fileName}».`);
  } catch (err) {
    console.error(err);
    // Ошибка ещё на этапе формирования файла
    const diag = await runDiagnostics();
    if (lastFile) downloadBlob(lastFile.blob, lastFile.fileName);
    modal.classList.add('hidden');
    showDoneScreen('error', 'Ошибка',
      err.message + '\n\n' + diag.join('\n'));
  } finally {
    btnSend.disabled = false;
    btnSend.textContent = 'Отправить';
  }
}

/* ---------- Новый палет ---------- */
function startNewPallet() {
  rows = [];
  selectedIndex = -1;
  clearDraft();
  renderRows();
  showScreen('collect');
}

/* ---------- События ---------- */
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCode(codeInput.value);
    codeInput.value = '';
  }
});

$('btn-add').addEventListener('click', () => {
  addCode(codeInput.value);
  codeInput.value = '';
  codeInput.focus();
});

// ТСД-сканеру нужно, чтобы поле всегда было в фокусе
codeInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!screenCollect.classList.contains('hidden') && modal.classList.contains('hidden')) {
      codeInput.focus();
    }
  }, 100);
});

btnDelete.addEventListener('click', deleteSelected);
btnFinish.addEventListener('click', openNameModal);
$('btn-cancel').addEventListener('click', closeNameModal);
btnSend.addEventListener('click', sendPallet);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendPallet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeNameModal();
});
$('btn-new-pallet').addEventListener('click', startNewPallet);
$('btn-again').addEventListener('click', startNewPallet);

/* ---------- Офлайн: регистрация service worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const ok = location.protocol === 'https:' ||
             location.hostname === 'localhost' ||
             location.hostname === '127.0.0.1';
  if (!ok) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Старт ---------- */
loadDraft();
renderRows();
showScreen('home');
registerSW();
