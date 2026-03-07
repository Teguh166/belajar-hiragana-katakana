(function () {
  const STORAGE_KEY = 'kana-practice';
  const TUTORIAL_KEY = 'kana-tutorial-seen';
  const TARGET_COUNT = 20;

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
  const btnClear = document.getElementById('btn-clear');
  const btnNext = document.getElementById('btn-next');
  const btnClose = document.getElementById('btn-close-modal');
  const backdrop = modal.querySelector('.modal-backdrop');

  let currentItem = null;
  let currentType = 'hiragana';

  // --- Progress (localStorage) ---
  function getProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function getCount(type, char) {
    const key = type + ':' + char;
    return getProgress()[key] || 0;
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

  // --- Canvas drawing (mouse + touch) ---
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function getPoint(e) {
    const rect = canvas.getBoundingClientRect();
    // Koordinat dalam ruang CSS canvas (ctx sudah di-scale dpr di setupCanvas)
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
      ctx.scale(dpr, dpr);
    }
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    clearCanvas();
  }

  // Event listeners for drawing - mouse
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  // Event listeners for drawing - touch (touchscreen)
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw, { passive: false });
  canvas.addEventListener('touchcancel', endDraw, { passive: false });

  btnClear.addEventListener('click', function () {
    clearCanvas();
  });

  btnNext.addEventListener('click', function () {
    if (!currentItem) return;
    const newCount = incrementCount(currentType, currentItem.char);
    updateProgressUI(newCount);
    clearCanvas();
    refreshCard(currentType, currentItem.char);
    if (newCount >= TARGET_COUNT) {
      progressText.textContent = 'Selesai!';
      btnNext.disabled = true;
    }
  });

  function updateProgressUI(count) {
    const pct = (count / TARGET_COUNT) * 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = count + ' / ' + TARGET_COUNT;
    document.getElementById('progress-bar').setAttribute('aria-valuenow', count);
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

  function openPractice(type, item) {
    currentType = type;
    currentItem = item;
    practiceCharEl.textContent = item.char;
    practiceRomajiEl.textContent = item.romaji;
    charGuide.textContent = item.char;
    const count = getCount(type, item.char);
    updateProgressUI(count);
    btnNext.disabled = count >= TARGET_COUNT;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      setupCanvas();
      if (!hasSeenTutorial()) showTutorial();
    });
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  btnClose.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  btnTutorialOk.addEventListener('click', function () {
    hideTutorial();
  });

  function refreshCard(type, char) {
    const grid = type === 'hiragana' ? document.getElementById('hiragana-grid') : document.getElementById('katakana-grid');
    const card = grid.querySelector('[data-char="' + char + '"]');
    if (card) {
      const countEl = card.querySelector('.count');
      const n = getCount(type, char);
      countEl.textContent = n + ' / ' + TARGET_COUNT;
      card.classList.toggle('completed', n >= TARGET_COUNT);
    }
    updateQuizVisibility();
  }

  // --- Quiz (tebak huruf) ---
  const QUIZ_SIZE = 10;
  const quizModal = document.getElementById('quiz-modal');
  const quizScreen = document.getElementById('quiz-screen');
  const quizResultScreen = document.getElementById('quiz-result-screen');
  const quizTitleEl = document.getElementById('quiz-title');
  const quizProgressEl = document.getElementById('quiz-progress');
  const quizCharEl = document.getElementById('quiz-char');
  const quizOptionsEl = document.getElementById('quiz-options');
  const quizFeedbackEl = document.getElementById('quiz-feedback');
  const btnQuizNext = document.getElementById('btn-quiz-next');

  let quizList = [];
  let quizQuestions = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizAnswered = false;

  function isSetComplete(type) {
    const list = type === 'hiragana' ? HIRAGANA : KATAKANA;
    return list.every(function (item) { return getCount(type, item.char) >= TARGET_COUNT; });
  }

  function updateQuizVisibility() {
    const hWrap = document.getElementById('hiragana-quiz-wrap');
    const kWrap = document.getElementById('katakana-quiz-wrap');
    if (hWrap) {
      const show = isSetComplete('hiragana');
      hWrap.classList.toggle('hidden', !show);
      hWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    if (kWrap) {
      const show = isSetComplete('katakana');
      kWrap.classList.toggle('hidden', !show);
      kWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickRandom(list, n) {
    const shuffled = shuffleArray(list);
    return shuffled.slice(0, Math.min(n, list.length));
  }

  function startQuiz(type) {
    quizList = type === 'hiragana' ? HIRAGANA : KATAKANA;
    const pool = shuffleArray(quizList);
    quizQuestions = pool.slice(0, Math.min(QUIZ_SIZE, pool.length));
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
    if (!q) {
      showQuizResult();
      return;
    }
    quizAnswered = false;
    quizCharEl.textContent = q.char;
    quizProgressEl.textContent = 'Soal ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
    quizFeedbackEl.classList.add('hidden');
    quizFeedbackEl.className = 'quiz-feedback hidden';
    btnQuizNext.classList.add('hidden');

    const wrongPool = quizList.filter(function (item) { return item.romaji !== q.romaji; });
    const wrongs = shuffleArray(wrongPool).slice(0, 3);
    const options = [{ romaji: q.romaji, correct: true }].concat(wrongs.map(function (o) { return { romaji: o.romaji, correct: false }; }));
    const shuffledOptions = shuffleArray(options);

    quizOptionsEl.innerHTML = '';
    shuffledOptions.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.textContent = opt.romaji;
      btn.addEventListener('click', function () { onQuizAnswer(btn, opt.correct, q.romaji); });
      quizOptionsEl.appendChild(btn);
    });
  }

  function onQuizAnswer(clickedBtn, correct, correctRomaji) {
    if (quizAnswered) return;
    quizAnswered = true;
    if (correct) quizScore++;

    const options = quizOptionsEl.querySelectorAll('.quiz-option');
    options.forEach(function (btn) {
      btn.disabled = true;
      if (btn.textContent === correctRomaji) btn.classList.add('correct');
      else if (btn === clickedBtn && !correct) btn.classList.add('wrong');
    });

    quizFeedbackEl.classList.remove('hidden');
    quizFeedbackEl.textContent = correct ? 'Benar!' : 'Salah. Jawaban: ' + correctRomaji;
    quizFeedbackEl.classList.add(correct ? 'correct' : 'wrong');
    btnQuizNext.classList.remove('hidden');
  }

  function showQuizResult() {
    quizScreen.classList.add('hidden');
    quizResultScreen.classList.remove('hidden');
    document.getElementById('quiz-score').textContent = quizScore + ' / ' + quizQuestions.length;
  }

  function nextQuizQuestion() {
    quizIndex++;
    showQuizQuestion();
  }

  function closeQuizModal() {
    quizModal.classList.remove('is-open');
    quizModal.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('btn-quiz-hiragana').addEventListener('click', function () { startQuiz('hiragana'); });
  document.getElementById('btn-quiz-katakana').addEventListener('click', function () { startQuiz('katakana'); });
  btnQuizNext.addEventListener('click', nextQuizQuestion);
  document.getElementById('btn-quiz-again').addEventListener('click', function () {
    startQuiz(quizList === HIRAGANA ? 'hiragana' : 'katakana');
  });
  document.getElementById('btn-quiz-close').addEventListener('click', closeQuizModal);
  document.getElementById('btn-quiz-close-x').addEventListener('click', closeQuizModal);
  quizModal.querySelector('.quiz-backdrop').addEventListener('click', closeQuizModal);

  function renderGrid(type, list) {
    const grid = document.getElementById(type + '-grid');
    grid.innerHTML = '';
    list.forEach(function (item) {
      const count = getCount(type, item.char);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'kana-card' + (count >= TARGET_COUNT ? ' completed' : '');
      card.setAttribute('data-char', item.char);
      card.innerHTML =
        '<span class="char">' + item.char + '</span>' +
        '<span class="romaji">' + item.romaji + '</span>' +
        '<span class="count">' + count + ' / ' + TARGET_COUNT + '</span>';
      card.addEventListener('click', function () {
        openPractice(type, item);
      });
      grid.appendChild(card);
    });
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const t = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.grid-section').forEach(function (s) { s.classList.remove('active'); });
      document.getElementById(t + '-section').classList.add('active');
    });
  });

  // Init
  renderGrid('hiragana', HIRAGANA);
  renderGrid('katakana', KATAKANA);
  updateQuizVisibility();

  window.addEventListener('resize', function () {
    if (modal.classList.contains('is-open')) setupCanvas();
  });
})();
