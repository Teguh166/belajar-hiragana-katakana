(function () {
  const STORAGE_KEY = 'kana-practice';
  const TUTORIAL_KEY = 'kana-tutorial-seen';
  const TARGET_COUNT = 10;
  const QUIZ_SIZE = 10;
  const MIN_ACCURACY_TO_COUNT = 35;

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

  function setAccuracyUI(score, label, tone, note) {
    accuracyText.textContent = score === null ? label : score + '% - ' + label;
    accuracyText.className = 'accuracy-text';
    if (tone) accuracyText.classList.add(tone);
    accuracyNote.textContent = note;
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
    const count = getCount(type, item.char);
    updateProgressUI(count);
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 35% (Cukup) agar progress bertambah.');
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

  function refreshCard(type, char) {
    const ids = [type + '-basic-grid', type + '-modified-grid'];
    let card = null;
    ids.some(function (id) {
      const grid = document.getElementById(id);
      const found = grid ? grid.querySelector('[data-char="' + char + '"]') : null;
      if (found) {
        card = found;
        return true;
      }
      return false;
    });

    if (card) {
      const countEl = card.querySelector('.count');
      const n = getCount(type, char);
      countEl.textContent = n + ' / ' + TARGET_COUNT;
      card.classList.toggle('completed', n >= TARGET_COUNT);
    }
    updateQuizVisibility();
  }

  function isCharInGroup(type, groupName, char) {
    return KANA_DATA[type][groupName].some(function (item) {
      return item.char === char;
    });
  }

  function rerenderType(type) {
    renderGrid(type, 'basic', KANA_DATA[type].basic);
    renderGrid(type, 'modified', KANA_DATA[type].modified);
  }

  function resetGroupProgress(type, groupName, label) {
    const ok = window.confirm('Reset progress kategori "' + label + '" pada ' + type + '?');
    if (!ok) return;

    const progress = getProgress();
    KANA_DATA[type][groupName].forEach(function (item) {
      progress[type + ':' + item.char] = 0;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));

    rerenderType(type);
    updateQuizVisibility();

    if (currentItem && currentType === type && isCharInGroup(type, groupName, currentItem.char)) {
      updateProgressUI(0);
      btnNext.disabled = false;
      setAccuracyUI(null, 'Belum dinilai', '', 'Progress kategori ini telah di-reset.');
    }
  }

  function resetAllProgress() {
    const ok = window.confirm('Reset SEMUA progress Hiragana & Katakana?');
    if (!ok) return;

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

  function hideUndoToast() {
    undoToast.classList.add('hidden');
    if (undoExpireTimer) {
      clearTimeout(undoExpireTimer);
      undoExpireTimer = null;
    }
    if (undoCountdownTimer) {
      clearInterval(undoCountdownTimer);
      undoCountdownTimer = null;
    }
  }

  function expireUndo() {
    lastResetSnapshot = null;
    hideUndoToast();
  }

  function showUndoToast() {
    let remaining = 5;
    undoToastText.textContent = 'Progress di-reset. Batalkan dalam ' + remaining + ' detik.';
    undoToast.classList.remove('hidden');

    if (undoExpireTimer) clearTimeout(undoExpireTimer);
    if (undoCountdownTimer) clearInterval(undoCountdownTimer);

    undoCountdownTimer = setInterval(function () {
      remaining--;
      if (remaining > 0) {
        undoToastText.textContent = 'Progress di-reset. Batalkan dalam ' + remaining + ' detik.';
      }
    }, 1000);

    undoExpireTimer = setTimeout(expireUndo, 5000);
  }

  function undoResetAllProgress() {
    if (!lastResetSnapshot) {
      hideUndoToast();
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastResetSnapshot));
    lastResetSnapshot = null;
    hideUndoToast();

    rerenderType('hiragana');
    rerenderType('katakana');
    updateQuizVisibility();

    if (currentItem) {
      const currentCount = getCount(currentType, currentItem.char);
      updateProgressUI(currentCount);
      btnNext.disabled = currentCount >= TARGET_COUNT;
      setAccuracyUI(null, 'Belum dinilai', '', 'Reset dibatalkan. Progress kembali.');
    }
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

  function isSetComplete(type) {
    return getAllKana(type).every(function (item) {
      return getCount(type, item.char) >= TARGET_COUNT;
    });
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
    if (!q) {
      showQuizResult();
      return;
    }

    quizAnswered = false;
    quizCharEl.textContent = q.char;
    quizProgressEl.textContent = 'Soal ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
    quizFeedbackEl.className = 'quiz-feedback hidden';
    btnQuizNext.classList.add('hidden');

    const wrongPool = quizList.filter(function (item) {
      return item.romaji !== q.romaji;
    });
    const wrongs = shuffleArray(wrongPool).slice(0, 3);
    const options = shuffleArray(
      [{ romaji: q.romaji, correct: true }].concat(
        wrongs.map(function (item) {
          return { romaji: item.romaji, correct: false };
        })
      )
    );

    quizOptionsEl.innerHTML = '';
    options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.textContent = opt.romaji;
      btn.addEventListener('click', function () {
        onQuizAnswer(btn, opt.correct, q.romaji);
      });
      quizOptionsEl.appendChild(btn);
    });
  }

  function onQuizAnswer(clickedBtn, isCorrect, correctRomaji) {
    if (quizAnswered) return;
    quizAnswered = true;
    if (isCorrect) quizScore++;

    quizOptionsEl.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.disabled = true;
      if (btn.textContent === correctRomaji) {
        btn.classList.add('correct');
      } else if (btn === clickedBtn && !isCorrect) {
        btn.classList.add('wrong');
      }
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

  function nextQuizQuestion() {
    quizIndex++;
    showQuizQuestion();
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
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 35% (Cukup) agar progress bertambah.');
  });

  btnNext.addEventListener('click', function () {
    if (!currentItem) return;

    const accuracy = calculateAccuracy(currentItem.char);
    if (!accuracy.hasDrawing) {
      setAccuracyUI(0, 'Belum ada tulisan', 'bad', 'Tulis huruf dulu sebelum menekan Selesai.');
      return;
    }

    if (accuracy.score < MIN_ACCURACY_TO_COUNT) {
      setAccuracyUI(
        accuracy.score,
        accuracy.label,
        accuracy.tone,
        'Belum dihitung. Minimal 35% agar progress bertambah.'
      );
      return;
    }

    const newCount = incrementCount(currentType, currentItem.char);
    updateProgressUI(newCount);
    setAccuracyUI(accuracy.score, accuracy.label, accuracy.tone, 'Bagus! Progress bertambah +1.');
    clearCanvas();
    refreshCard(currentType, currentItem.char);

    if (newCount >= TARGET_COUNT) {
      progressText.textContent = 'Selesai!';
      btnNext.disabled = true;
    }
  });

  btnClose.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  btnTutorialOk.addEventListener('click', hideTutorial);

  document.getElementById('btn-quiz-hiragana').addEventListener('click', function () {
    startQuiz('hiragana');
  });
  document.getElementById('btn-quiz-katakana').addEventListener('click', function () {
    startQuiz('katakana');
  });
  btnQuizNext.addEventListener('click', nextQuizQuestion);
  document.getElementById('btn-quiz-again').addEventListener('click', function () {
    startQuiz(quizType);
  });
  document.getElementById('btn-quiz-close').addEventListener('click', closeQuizModal);
  document.getElementById('btn-quiz-close-x').addEventListener('click', closeQuizModal);
  quizModal.querySelector('.quiz-backdrop').addEventListener('click', closeQuizModal);

  document.getElementById('btn-reset-hiragana-basic').addEventListener('click', function () {
    resetGroupProgress('hiragana', 'basic', 'Dasar');
  });
  document.getElementById('btn-reset-hiragana-modified').addEventListener('click', function () {
    resetGroupProgress('hiragana', 'modified', 'Perubahan');
  });
  document.getElementById('btn-reset-katakana-basic').addEventListener('click', function () {
    resetGroupProgress('katakana', 'basic', 'Dasar');
  });
  document.getElementById('btn-reset-katakana-modified').addEventListener('click', function () {
    resetGroupProgress('katakana', 'modified', 'Perubahan');
  });
  document.getElementById('btn-reset-all-progress').addEventListener('click', resetAllProgress);
  btnUndoReset.addEventListener('click', undoResetAllProgress);

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (item) {
        item.classList.remove('active');
      });
      tab.classList.add('active');
      document.querySelectorAll('.grid-section').forEach(function (section) {
        section.classList.remove('active');
      });
      document.getElementById(target + '-section').classList.add('active');
    });
  });

  renderGrid('hiragana', 'basic', KANA_DATA.hiragana.basic);
  renderGrid('hiragana', 'modified', KANA_DATA.hiragana.modified);
  renderGrid('katakana', 'basic', KANA_DATA.katakana.basic);
  renderGrid('katakana', 'modified', KANA_DATA.katakana.modified);
  updateQuizVisibility();

  window.addEventListener('resize', function () {
    if (modal.classList.contains('is-open')) setupCanvas();
  });
})();
