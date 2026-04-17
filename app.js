(function () {
  const STORAGE_KEY = 'kana-practice';
  const TUTORIAL_KEY = 'kana-tutorial-seen';
  const SOUND_SETTINGS_KEY = 'kana-sound-settings';
  const TARGET_COUNT = 10;
  const QUIZ_SIZE = 10;
  const MIN_ACCURACY_TO_COUNT = 25;

  const modal = document.getElementById('practice-modal');
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const btnTutorialOk = document.getElementById('btn-tutorial-ok');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');
  const practiceCharEl = document.getElementById('practice-char');
  const practiceRomajiEl = document.getElementById('practice-romaji');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const charGuide = document.getElementById('char-guide');
  const writingStepsList = document.getElementById('writing-steps-list');
  const btnPlayCharSound = document.getElementById('btn-play-char-sound');
  const charSoundIcon = btnPlayCharSound.querySelector('.char-sound-icon');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const toggleSoundIcon = document.getElementById('toggle-sound-icon');
  const toggleSoundLabel = document.getElementById('toggle-sound-label');
  const voiceVolumeInput = document.getElementById('voice-volume');
  const sfxVolumeInput = document.getElementById('sfx-volume');
  const accuracyText = document.getElementById('accuracy-text');
  const accuracyNote = document.getElementById('accuracy-note');
  const btnClear = document.getElementById('btn-clear');
  const btnNext = document.getElementById('btn-next');
  const btnClose = document.getElementById('btn-close-modal');
  const backdrop = modal.querySelector('.modal-backdrop');
  const progressBar = document.getElementById('progress-bar');

  const quizModal = document.getElementById('quiz-modal');
  const quizScreen = document.getElementById('quiz-screen');
  const quizResultScreen = document.getElementById('quiz-result-screen');
  const quizTitleEl = document.getElementById('quiz-title');
  const quizProgressEl = document.getElementById('quiz-progress');
  const quizCharEl = document.getElementById('quiz-char');
  const quizOptionsEl = document.getElementById('quiz-options');
  const quizFeedbackEl = document.getElementById('quiz-feedback');
  const btnQuizNext = document.getElementById('btn-quiz-next');
  const undoToast = document.getElementById('undo-toast');
  const undoToastText = document.getElementById('undo-toast-text');
  const btnUndoReset = document.getElementById('btn-undo-reset');

  let currentItem = null;
  let currentType = 'hiragana';
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  let quizType = 'hiragana';
  let quizList = [];
  let quizQuestions = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizAnswered = false;

  let lastResetSnapshot = null;
  let undoExpireTimer = null;
  let undoCountdownTimer = null;

  let audioCtx = null;
  let soundEnabled = true;
  let voiceVolume = 1;
  let sfxVolume = 0.8;
  let activeSpeechToken = 0;

  function getTypeData(type) {
    return KANA_DATA[type];
  }

  function getAllKana(type) {
    const data = getTypeData(type);
    return data.basic.concat(data.modified);
  }

  function getProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function getCount(type, char) {
    return getProgress()[type + ':' + char] || 0;
  }

  function setCount(type, char, count) {
    const progress = getProgress();
    progress[type + ':' + char] = Math.min(TARGET_COUNT, Math.max(0, count));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function incrementCount(type, char) {
    const n = getCount(type, char) + 1;
    setCount(type, char, n);
    return n;
  }

  function getPoint(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const p = getPoint(e);
    lastX = p.x;
    lastY = p.y;
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }

  function endDraw(e) {
    e.preventDefault();
    isDrawing = false;
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    ctx.strokeStyle = '#2e3e63';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    clearCanvas();
  }

  function updateProgressUI(count) {
    const pct = (count / TARGET_COUNT) * 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = count + ' / ' + TARGET_COUNT;
    progressBar.setAttribute('aria-valuenow', count);
  }

  function hasSeenTutorial() {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  }

  function markTutorialSeen() {
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  function showTutorial() {
    tutorialOverlay.classList.add('is-visible');
    tutorialOverlay.setAttribute('aria-hidden', 'false');
  }

  function hideTutorial() {
    tutorialOverlay.classList.remove('is-visible');
    tutorialOverlay.setAttribute('aria-hidden', 'true');
    markTutorialSeen();
  }

  function getAudioContext() {
    if (!soundEnabled) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, durationSec, offsetSec, gainValue, type) {
    const context = getAudioContext();
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const finalGain = Math.max(0.0001, gainValue * sfxVolume);
    gain.gain.value = finalGain;
    osc.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + offsetSec;
    osc.start(start);
    gain.gain.setValueAtTime(finalGain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
    osc.stop(start + durationSec);
  }

  function playEffect(kind) {
    if (kind === 'progress') {
      playTone(740, 0.11, 0, 0.08, 'triangle');
      return;
    }
    if (kind === 'complete') {
      playTone(523.25, 0.16, 0.00, 0.08, 'sine');
      playTone(659.25, 0.16, 0.09, 0.07, 'sine');
      playTone(783.99, 0.24, 0.18, 0.09, 'triangle');
    }
  }

  function speakKana(item) {
    if (!soundEnabled || !item || !('speechSynthesis' in window)) return;
    activeSpeechToken++;
    const token = activeSpeechToken;
    window.speechSynthesis.cancel();
    setCharSoundButtonState('loading');
    const utterance = new SpeechSynthesisUtterance(item.char);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = voiceVolume;
    utterance.addEventListener('start', function () {
      if (token !== activeSpeechToken) return;
      setCharSoundButtonState('playing');
    });
    utterance.addEventListener('end', function () {
      if (token !== activeSpeechToken) return;
      setCharSoundButtonState('idle');
    });
    utterance.addEventListener('error', function () {
      if (token !== activeSpeechToken) return;
      setCharSoundButtonState('idle');
    });
    window.speechSynthesis.speak(utterance);
    setTimeout(function () {
      if (token !== activeSpeechToken) return;
      if (!window.speechSynthesis.speaking) {
        setCharSoundButtonState('idle');
      }
    }, 900);
  }

  function getSoundSettings() {
    try {
      const raw = localStorage.getItem(SOUND_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSoundSettings() {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({
      enabled: soundEnabled,
      voiceVolume: voiceVolume,
      sfxVolume: sfxVolume
    }));
  }

  function updateSoundUI() {
    toggleSoundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    toggleSoundLabel.textContent = soundEnabled ? 'Suara: ON' : 'Suara: OFF';
    btnToggleSound.classList.toggle('off', !soundEnabled);
    voiceVolumeInput.disabled = !soundEnabled;
    sfxVolumeInput.disabled = !soundEnabled;
    btnPlayCharSound.disabled = !soundEnabled || !('speechSynthesis' in window);
    if (!soundEnabled) setCharSoundButtonState('idle');
    voiceVolumeInput.value = String(Math.round(voiceVolume * 100));
    sfxVolumeInput.value = String(Math.round(sfxVolume * 100));
  }

  function setCharSoundButtonState(state) {
    charSoundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    btnPlayCharSound.dataset.state = state;
    btnPlayCharSound.classList.toggle('is-loading', state === 'loading');
    btnPlayCharSound.classList.toggle('is-playing', state === 'playing');
  }

  function applySavedSoundSettings() {
    const settings = getSoundSettings();
    if (!settings) {
      updateSoundUI();
      return;
    }
    soundEnabled = settings.enabled !== false;
    voiceVolume = Math.min(1, Math.max(0, Number(settings.voiceVolume || 1)));
    sfxVolume = Math.min(1, Math.max(0, Number(settings.sfxVolume || 0.8)));
    updateSoundUI();
  }

  function setAccuracyUI(score, label, tone, note) {
    accuracyText.textContent = score === null ? label : score + '% - ' + label;
    accuracyText.className = 'accuracy-text';
    if (tone) accuracyText.classList.add(tone);
    accuracyNote.textContent = note;
  }

  function getFamilyKey(romaji) {
    return romaji.startsWith('sh') ? 'sh'
      : romaji.startsWith('ch') ? 'ch'
      : romaji.startsWith('ts') ? 'ts'
      : romaji.startsWith('j') ? 'j'
      : romaji.startsWith('f') ? 'f'
      : romaji.charAt(0);
  }

  function getWritingSteps(type, item) {
    const isModified = KANA_DATA[type].modified.some(function (entry) {
      return entry.char === item.char;
    });
    const romaji = item.romaji;
    const first = romaji.charAt(0);
    const family = getFamilyKey(romaji);
    const scriptName = type === 'hiragana' ? 'Hiragana' : 'Katakana';

    const strokeCountByChar = {
      'あ': 3, 'い': 2, 'う': 2, 'え': 2, 'お': 3, 'を': 3, 'ん': 1,
      'ア': 2, 'イ': 2, 'ウ': 3, 'エ': 3, 'オ': 3, 'ヲ': 3, 'ン': 2,
      'し': 1, 'シ': 3, 'つ': 1, 'ツ': 3, 'ふ': 4, 'フ': 1
    };

    const fallbackStrokeByFamily = {
      a: 3, k: 3, g: 3, s: 3, z: 3, j: 3, sh: 1, t: 3, d: 3, ch: 3, ts: 1,
      n: 2, h: 3, b: 3, p: 3, f: 4, m: 3, y: 3, r: 2, w: 2
    };

    const styleByFamily = {
      a: 'fokus pada lengkung utama yang halus',
      k: 'gabungkan satu garis pendek lalu stroke badan yang lebih panjang',
      s: 'mulai tipis, lalu lanjutkan stroke melengkung di tengah',
      t: 'jaga sumbu vertikal agar karakter tetap tegak',
      n: 'pakai stroke ringan, jangan menekan terlalu tebal',
      h: 'buat badan huruf dahulu lalu rapikan penutup',
      m: 'jaga jarak antar stroke agar huruf tidak menumpuk',
      y: 'utamakan keseimbangan antara stroke pendek dan stroke utama',
      r: 'pakai sapuan cepat dan tipis pada stroke awal',
      w: 'buat lekukan akhir secukupnya agar bentuk tidak berlebihan'
    };

    const specialNote = {
      'じ': 'Catatan: ini bentuk ji yang paling umum dipakai.',
      'ぢ': 'Catatan: ini ji versi dakuten dari ち (lebih jarang).',
      'ず': 'Catatan: ini bentuk zu yang paling umum dipakai.',
      'づ': 'Catatan: ini zu versi dakuten dari つ (lebih jarang).',
      'を': 'Catatan: dibaca "o" dalam kalimat modern.',
      'ヲ': 'Catatan: biasanya dipakai sebagai partikel objek (dibaca "o").'
    };

    const strokeHint = strokeCountByChar[item.char] || fallbackStrokeByFamily[family] || 3;
    const styleHint = styleByFamily[family] || 'ikuti bentuk contoh dari atas ke bawah secara konsisten';
    const steps = [
      'Huruf: ' + item.char + ' (' + item.romaji + ') [' + scriptName + '] - estimasi ' + strokeHint + ' stroke.',
      'Step 1: mulai dari area atas-kiri, lalu ikuti urutan stroke standar (atas ke bawah, kiri ke kanan).',
      'Step 2: saat stroke utama, ' + styleHint + '.',
      'Step 3: angkat jari/pena di akhir setiap stroke, lalu rapikan ujung agar bentuk tetap bersih.'
    ];

    if (isModified) {
      const mark = first === 'p' ? 'maru (°)' : 'tenten (")';
      steps.push('Terakhir, tambahkan ' + mark + ' kecil di kanan atas huruf utama.');
    }
    if (specialNote[item.char]) {
      steps.push(specialNote[item.char]);
    }
    return steps;
  }

  function renderWritingSteps(type, item) {
    const steps = getWritingSteps(type, item);
    writingStepsList.innerHTML = '';
    steps.forEach(function (text) {
      const li = document.createElement('li');
      li.textContent = text;
      writingStepsList.appendChild(li);
    });
  }

  function calculateAccuracy(char) {
    const userData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const templateCanvas = document.createElement('canvas');
    templateCanvas.width = canvas.width;
    templateCanvas.height = canvas.height;
    const tctx = templateCanvas.getContext('2d');
    tctx.clearRect(0, 0, templateCanvas.width, templateCanvas.height);
    tctx.fillStyle = '#111';
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.font = '700 ' + Math.round(templateCanvas.width * 0.62) + 'px "Noto Sans JP", sans-serif';
    tctx.fillText(char, templateCanvas.width / 2, templateCanvas.height / 2);
    const templateData = tctx.getImageData(0, 0, templateCanvas.width, templateCanvas.height).data;

    let userCount = 0;
    let templateCount = 0;
    let intersection = 0;

    for (let i = 3; i < userData.length; i += 4) {
      const userPx = userData[i] > 20;
      const templatePx = templateData[i] > 20;
      if (userPx) userCount++;
      if (templatePx) templateCount++;
      if (userPx && templatePx) intersection++;
    }

    if (userCount < 40) {
      return { hasDrawing: false, score: 0, label: 'Belum ada tulisan', tone: 'bad' };
    }

    const score = Math.round((2 * intersection / (userCount + templateCount)) * 100);
    if (score >= 65) return { hasDrawing: true, score: score, label: 'Sangat Baik', tone: 'good' };
    if (score >= MIN_ACCURACY_TO_COUNT) return { hasDrawing: true, score: score, label: 'Cukup', tone: 'warn' };
    return { hasDrawing: true, score: score, label: 'Perlu Latihan', tone: 'bad' };
  }

  function openPractice(type, item) {
    currentType = type;
    currentItem = item;
    practiceCharEl.textContent = item.char;
    practiceRomajiEl.textContent = item.romaji;
    charGuide.textContent = item.char;
    renderWritingSteps(type, item);
    updateProgressUI(getCount(type, item.char));
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 25% (Cukup) agar progress bertambah.');
    btnNext.disabled = getCount(type, item.char) >= TARGET_COUNT;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      setupCanvas();
      speakKana(item);
      if (!hasSeenTutorial()) showTutorial();
    });
  }

  function closeModal() {
    activeSpeechToken++;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCharSoundButtonState('idle');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function refreshCard(type, char) {
    const ids = [type + '-basic-grid', type + '-modified-grid'];
    ids.forEach(function (id) {
      const grid = document.getElementById(id);
      if (!grid) return;
      const card = grid.querySelector('[data-char="' + char + '"]');
      if (!card) return;
      const n = getCount(type, char);
      card.querySelector('.count').textContent = n + ' / ' + TARGET_COUNT;
      card.classList.toggle('completed', n >= TARGET_COUNT);
    });
    updateQuizVisibility();
  }

  function isSetComplete(type) {
    return getAllKana(type).every(function (item) {
      return getCount(type, item.char) >= TARGET_COUNT;
    });
  }

  function updateQuizVisibility() {
    ['hiragana', 'katakana'].forEach(function (type) {
      const wrap = document.getElementById(type + '-quiz-wrap');
      const show = isSetComplete(type);
      wrap.classList.toggle('hidden', !show);
      wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function startQuiz(type) {
    quizType = type;
    quizList = getAllKana(type);
    quizQuestions = shuffleArray(quizList).slice(0, Math.min(QUIZ_SIZE, quizList.length));
    quizIndex = 0;
    quizScore = 0;
    quizTitleEl.textContent = type === 'hiragana' ? 'Tebak huruf — Hiragana' : 'Tebak huruf — Katakana';
    quizModal.classList.add('is-open');
    quizModal.setAttribute('aria-hidden', 'false');
    quizResultScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    showQuizQuestion();
  }

  function showQuizQuestion() {
    const q = quizQuestions[quizIndex];
    if (!q) return showQuizResult();
    quizAnswered = false;
    quizCharEl.textContent = q.char;
    quizProgressEl.textContent = 'Soal ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
    quizFeedbackEl.className = 'quiz-feedback hidden';
    btnQuizNext.classList.add('hidden');

    const wrongs = shuffleArray(quizList.filter(function (x) { return x.romaji !== q.romaji; })).slice(0, 3);
    const options = shuffleArray([{ romaji: q.romaji, correct: true }].concat(wrongs.map(function (x) { return { romaji: x.romaji, correct: false }; })));
    quizOptionsEl.innerHTML = '';
    options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.textContent = opt.romaji;
      btn.addEventListener('click', function () { onQuizAnswer(btn, opt.correct, q.romaji); });
      quizOptionsEl.appendChild(btn);
    });
  }

  function onQuizAnswer(clickedBtn, isCorrect, correctRomaji) {
    if (quizAnswered) return;
    quizAnswered = true;
    if (isCorrect) quizScore++;
    quizOptionsEl.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.disabled = true;
      if (btn.textContent === correctRomaji) btn.classList.add('correct');
      else if (btn === clickedBtn && !isCorrect) btn.classList.add('wrong');
    });
    quizFeedbackEl.classList.remove('hidden');
    quizFeedbackEl.textContent = isCorrect ? 'Benar!' : 'Salah. Jawaban: ' + correctRomaji;
    quizFeedbackEl.classList.add(isCorrect ? 'correct' : 'wrong');
    btnQuizNext.classList.remove('hidden');
  }

  function showQuizResult() {
    quizScreen.classList.add('hidden');
    quizResultScreen.classList.remove('hidden');
    document.getElementById('quiz-score').textContent = quizScore + ' / ' + quizQuestions.length;
  }

  function closeQuizModal() {
    quizModal.classList.remove('is-open');
    quizModal.setAttribute('aria-hidden', 'true');
  }

  function renderGrid(type, groupName, list) {
    const grid = document.getElementById(type + '-' + groupName + '-grid');
    grid.innerHTML = '';
    list.forEach(function (item) {
      const count = getCount(type, item.char);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'kana-card' + (count >= TARGET_COUNT ? ' completed' : '');
      card.setAttribute('data-char', item.char);
      card.innerHTML = '<span class="char">' + item.char + '</span>' +
        '<span class="romaji">' + item.romaji + '</span>' +
        '<span class="count">' + count + ' / ' + TARGET_COUNT + '</span>';
      card.addEventListener('click', function () { openPractice(type, item); });
      grid.appendChild(card);
    });
  }

  function rerenderType(type) {
    renderGrid(type, 'basic', KANA_DATA[type].basic);
    renderGrid(type, 'modified', KANA_DATA[type].modified);
  }

  function resetGroupProgress(type, groupName, label) {
    if (!window.confirm('Reset progress kategori "' + label + '" pada ' + type + '?')) return;
    const progress = getProgress();
    KANA_DATA[type][groupName].forEach(function (item) { progress[type + ':' + item.char] = 0; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    rerenderType(type);
    updateQuizVisibility();
    if (currentItem && currentType === type) {
      updateProgressUI(getCount(type, currentItem.char));
      btnNext.disabled = getCount(type, currentItem.char) >= TARGET_COUNT;
    }
  }

  function hideUndoToast() {
    undoToast.classList.add('hidden');
    if (undoExpireTimer) clearTimeout(undoExpireTimer);
    if (undoCountdownTimer) clearInterval(undoCountdownTimer);
    undoExpireTimer = null;
    undoCountdownTimer = null;
  }

  function showUndoToast() {
    let remaining = 5;
    undoToastText.textContent = 'Progress di-reset. Batalkan dalam ' + remaining + ' detik.';
    if (undoExpireTimer) clearTimeout(undoExpireTimer);
    if (undoCountdownTimer) clearInterval(undoCountdownTimer);
    undoExpireTimer = null;
    undoCountdownTimer = null;
    undoToast.classList.remove('hidden');
    undoCountdownTimer = setInterval(function () {
      remaining--;
      if (remaining > 0) undoToastText.textContent = 'Progress di-reset. Batalkan dalam ' + remaining + ' detik.';
    }, 1000);
    undoExpireTimer = setTimeout(function () {
      lastResetSnapshot = null;
      hideUndoToast();
    }, 5000);
  }

  function resetAllProgress() {
    if (!window.confirm('Reset SEMUA progress Hiragana & Katakana?')) return;
    lastResetSnapshot = getProgress();
    localStorage.removeItem(STORAGE_KEY);
    rerenderType('hiragana');
    rerenderType('katakana');
    updateQuizVisibility();
    showUndoToast();
    if (currentItem) {
      updateProgressUI(0);
      btnNext.disabled = false;
      setAccuracyUI(null, 'Belum dinilai', '', 'Semua progress berhasil di-reset.');
    }
  }

  function undoResetAllProgress() {
    if (!lastResetSnapshot) return hideUndoToast();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastResetSnapshot));
    lastResetSnapshot = null;
    hideUndoToast();
    rerenderType('hiragana');
    rerenderType('katakana');
    updateQuizVisibility();
    if (currentItem) {
      const n = getCount(currentType, currentItem.char);
      updateProgressUI(n);
      btnNext.disabled = n >= TARGET_COUNT;
    }
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw, { passive: false });
  canvas.addEventListener('touchcancel', endDraw, { passive: false });

  btnClear.addEventListener('click', function () {
    clearCanvas();
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 25% (Cukup) agar progress bertambah.');
  });

  btnPlayCharSound.addEventListener('click', function () {
    speakKana(currentItem);
  });

  btnToggleSound.addEventListener('click', function () {
    soundEnabled = !soundEnabled;
    if (!soundEnabled && 'speechSynthesis' in window) {
      activeSpeechToken++;
      window.speechSynthesis.cancel();
      setCharSoundButtonState('idle');
    }
    updateSoundUI();
    saveSoundSettings();
  });

  voiceVolumeInput.addEventListener('input', function () {
    voiceVolume = Math.min(1, Math.max(0, Number(voiceVolumeInput.value) / 100));
    saveSoundSettings();
  });

  sfxVolumeInput.addEventListener('input', function () {
    sfxVolume = Math.min(1, Math.max(0, Number(sfxVolumeInput.value) / 100));
    saveSoundSettings();
  });

  btnNext.addEventListener('click', function () {
    if (!currentItem) return;
    const accuracy = calculateAccuracy(currentItem.char);
    if (!accuracy.hasDrawing) {
      setAccuracyUI(0, 'Belum ada tulisan', 'bad', 'Tulis huruf dulu sebelum menekan Selesai.');
      return;
    }
    if (accuracy.score < MIN_ACCURACY_TO_COUNT) {
      setAccuracyUI(accuracy.score, accuracy.label, accuracy.tone, 'Belum dihitung. Minimal 25% agar progress bertambah.');
      return;
    }

    const newCount = incrementCount(currentType, currentItem.char);
    updateProgressUI(newCount);
    setAccuracyUI(accuracy.score, accuracy.label, accuracy.tone, 'Bagus! Progress bertambah +1.');
    playEffect('progress');
    clearCanvas();
    refreshCard(currentType, currentItem.char);

    if (newCount >= TARGET_COUNT) {
      progressText.textContent = 'Selesai!';
      btnNext.disabled = true;
      playEffect('complete');
    }
  });

  btnClose.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  btnTutorialOk.addEventListener('click', hideTutorial);

  document.getElementById('btn-quiz-hiragana').addEventListener('click', function () { startQuiz('hiragana'); });
  document.getElementById('btn-quiz-katakana').addEventListener('click', function () { startQuiz('katakana'); });
  btnQuizNext.addEventListener('click', function () { quizIndex++; showQuizQuestion(); });
  document.getElementById('btn-quiz-again').addEventListener('click', function () { startQuiz(quizType); });
  document.getElementById('btn-quiz-close').addEventListener('click', closeQuizModal);
  document.getElementById('btn-quiz-close-x').addEventListener('click', closeQuizModal);
  quizModal.querySelector('.quiz-backdrop').addEventListener('click', closeQuizModal);

  document.getElementById('btn-reset-hiragana-basic').addEventListener('click', function () { resetGroupProgress('hiragana', 'basic', 'Dasar'); });
  document.getElementById('btn-reset-hiragana-modified').addEventListener('click', function () { resetGroupProgress('hiragana', 'modified', 'Perubahan'); });
  document.getElementById('btn-reset-katakana-basic').addEventListener('click', function () { resetGroupProgress('katakana', 'basic', 'Dasar'); });
  document.getElementById('btn-reset-katakana-modified').addEventListener('click', function () { resetGroupProgress('katakana', 'modified', 'Perubahan'); });
  document.getElementById('btn-reset-all-progress').addEventListener('click', resetAllProgress);
  btnUndoReset.addEventListener('click', undoResetAllProgress);

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (btn) { btn.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.grid-section').forEach(function (section) { section.classList.remove('active'); });
      document.getElementById(target + '-section').classList.add('active');
    });
  });

  rerenderType('hiragana');
  rerenderType('katakana');
  updateQuizVisibility();
  applySavedSoundSettings();

  window.addEventListener('resize', function () {
    if (modal.classList.contains('is-open')) setupCanvas();
  });
})();
