(function () {
  const STORAGE_KEY = 'kana-practice';
  const TUTORIAL_KEY = 'kana-tutorial-seen';
  const TARGET_COUNT = 10;
  const QUIZ_SIZE = 10;
  const MIN_ACCURACY_TO_COUNT = 25;

  const modal = document.getElementById('practice-modal');
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const btnTutorialOk = document.getElementById('btn-tutorial-ok');
  const canvas = document.getElementById('draw-canvas');
  const strokeGuideCanvas = document.getElementById('stroke-guide-canvas');
  const ctx = canvas.getContext('2d');
  const guideCtx = strokeGuideCanvas.getContext('2d');
  const practiceCharEl = document.getElementById('practice-char');
  const practiceRomajiEl = document.getElementById('practice-romaji');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const charGuide = document.getElementById('char-guide');
  const writingStepsList = document.getElementById('writing-steps-list');
  const btnPlayStrokeAnimation = document.getElementById('btn-play-stroke-animation');
  const strokeSpeedSelect = document.getElementById('stroke-speed-select');
  const strokeLoopToggle = document.getElementById('stroke-loop-toggle');
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
  let activeGuideStrokes = [];
  let strokeAnimFrame = null;
  let strokeAnimDelay = null;
  let isStrokeAnimating = false;

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

  function setupGuideCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = strokeGuideCanvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (strokeGuideCanvas.width !== w || strokeGuideCanvas.height !== h) {
      strokeGuideCanvas.width = w;
      strokeGuideCanvas.height = h;
      guideCtx.setTransform(1, 0, 0, 1, 0, 0);
      guideCtx.scale(dpr, dpr);
    }
    guideCtx.clearRect(0, 0, rect.width, rect.height);
  }

  function cancelStrokeAnimation() {
    if (strokeAnimFrame) {
      cancelAnimationFrame(strokeAnimFrame);
      strokeAnimFrame = null;
    }
    if (strokeAnimDelay) {
      clearTimeout(strokeAnimDelay);
      strokeAnimDelay = null;
    }
    isStrokeAnimating = false;
    btnPlayStrokeAnimation.textContent = 'Lihat Animasi Stroke';
  }

  function getStrokeAnimationTiming() {
    const speed = strokeSpeedSelect ? strokeSpeedSelect.value : 'normal';
    if (speed === 'slow') return { strokeMs: 820, gapMs: 260, loopPauseMs: 520 };
    if (speed === 'fast') return { strokeMs: 320, gapMs: 90, loopPauseMs: 220 };
    return { strokeMs: 520, gapMs: 170, loopPauseMs: 360 };
  }

  function getFamilyKey(romaji) {
    return romaji.startsWith('sh') ? 'sh'
      : romaji.startsWith('ch') ? 'ch'
      : romaji.startsWith('ts') ? 'ts'
      : romaji.startsWith('ky') ? 'ky'
      : romaji.startsWith('ry') ? 'ry'
      : romaji.startsWith('ny') ? 'ny'
      : romaji.startsWith('hy') ? 'hy'
      : romaji.startsWith('my') ? 'my'
      : romaji.startsWith('gy') ? 'gy'
      : romaji.startsWith('by') ? 'by'
      : romaji.startsWith('py') ? 'py'
      : romaji.startsWith('j') ? 'j'
      : romaji.startsWith('f') ? 'f'
      : romaji.charAt(0);
  }

  function getGuideStrokes(item) {
    const romaji = item.romaji;
    const family = getFamilyKey(romaji);
    const byHiraganaBasic = {
      'あ': [[[0.24, 0.26], [0.44, 0.24], [0.56, 0.34]], [[0.56, 0.34], [0.48, 0.54], [0.36, 0.67]], [[0.36, 0.67], [0.58, 0.72]]],
      'い': [[[0.33, 0.34], [0.44, 0.45]], [[0.57, 0.3], [0.57, 0.72]]],
      'う': [[[0.28, 0.3], [0.52, 0.31]], [[0.5, 0.31], [0.42, 0.58], [0.3, 0.67]]],
      'え': [[[0.24, 0.3], [0.58, 0.3]], [[0.3, 0.47], [0.52, 0.48], [0.62, 0.62]]],
      'お': [[[0.28, 0.3], [0.44, 0.37]], [[0.44, 0.37], [0.34, 0.58], [0.5, 0.68]], [[0.54, 0.29], [0.6, 0.39]]],

      'か': [[[0.29, 0.28], [0.53, 0.28]], [[0.43, 0.28], [0.43, 0.69]], [[0.44, 0.47], [0.6, 0.62]]],
      'き': [[[0.25, 0.28], [0.56, 0.28]], [[0.27, 0.45], [0.58, 0.45]], [[0.43, 0.25], [0.45, 0.72]], [[0.45, 0.58], [0.62, 0.66]]],
      'く': [[[0.58, 0.27], [0.38, 0.45], [0.56, 0.7]]],
      'け': [[[0.31, 0.28], [0.31, 0.69]], [[0.52, 0.28], [0.52, 0.58]], [[0.4, 0.52], [0.6, 0.52]]],
      'こ': [[[0.28, 0.34], [0.58, 0.34]], [[0.28, 0.62], [0.58, 0.62]]],

      'さ': [[[0.3, 0.3], [0.53, 0.31]], [[0.56, 0.34], [0.45, 0.5]], [[0.45, 0.5], [0.6, 0.66]]],
      'し': [[[0.6, 0.24], [0.42, 0.44], [0.5, 0.7]]],
      'す': [[[0.28, 0.3], [0.58, 0.3]], [[0.49, 0.28], [0.5, 0.72]], [[0.5, 0.62], [0.37, 0.72]]],
      'せ': [[[0.3, 0.29], [0.58, 0.29]], [[0.45, 0.25], [0.45, 0.7]], [[0.29, 0.53], [0.62, 0.53]]],
      'そ': [[[0.27, 0.29], [0.58, 0.33]], [[0.54, 0.35], [0.42, 0.53], [0.6, 0.7]]],

      'た': [[[0.28, 0.29], [0.56, 0.29]], [[0.44, 0.3], [0.44, 0.66]], [[0.44, 0.56], [0.62, 0.72]]],
      'ち': [[[0.3, 0.28], [0.54, 0.28]], [[0.45, 0.27], [0.42, 0.56]], [[0.42, 0.56], [0.58, 0.7]]],
      'つ': [[[0.34, 0.33], [0.43, 0.36]], [[0.47, 0.31], [0.56, 0.35]], [[0.56, 0.35], [0.45, 0.6], [0.36, 0.7]]],
      'て': [[[0.28, 0.3], [0.6, 0.3]], [[0.45, 0.31], [0.48, 0.72]]],
      'と': [[[0.32, 0.27], [0.34, 0.72]], [[0.52, 0.48], [0.4, 0.58], [0.6, 0.7]]],

      'な': [[[0.3, 0.3], [0.46, 0.35]], [[0.46, 0.35], [0.5, 0.68]]],
      'に': [[[0.28, 0.33], [0.58, 0.33]], [[0.3, 0.53], [0.58, 0.53]], [[0.34, 0.7], [0.6, 0.69]]],
      'ぬ': [[[0.28, 0.3], [0.52, 0.3]], [[0.52, 0.3], [0.44, 0.53], [0.3, 0.66]], [[0.42, 0.53], [0.6, 0.67]], [[0.52, 0.66], [0.46, 0.76]]],
      'ね': [[[0.28, 0.29], [0.52, 0.29]], [[0.42, 0.3], [0.42, 0.73]], [[0.42, 0.5], [0.6, 0.68]]],
      'の': [[[0.58, 0.35], [0.42, 0.24], [0.28, 0.5], [0.44, 0.72], [0.6, 0.56]]],

      'は': [[[0.3, 0.28], [0.3, 0.66]], [[0.3, 0.47], [0.5, 0.48]], [[0.5, 0.48], [0.6, 0.67]]],
      'ひ': [[[0.36, 0.26], [0.34, 0.64]], [[0.52, 0.28], [0.46, 0.46], [0.58, 0.69]]],
      'ふ': [[[0.32, 0.34], [0.33, 0.35]], [[0.49, 0.31], [0.5, 0.32]], [[0.57, 0.35], [0.46, 0.58], [0.35, 0.7]]],
      'へ': [[[0.28, 0.58], [0.44, 0.38], [0.62, 0.58]]],
      'ほ': [[[0.29, 0.28], [0.29, 0.68]], [[0.45, 0.28], [0.45, 0.68]], [[0.45, 0.52], [0.61, 0.52]], [[0.61, 0.29], [0.61, 0.68]]],

      'ま': [[[0.27, 0.31], [0.45, 0.32]], [[0.45, 0.32], [0.46, 0.56]], [[0.3, 0.52], [0.58, 0.52]], [[0.46, 0.56], [0.6, 0.69]]],
      'み': [[[0.28, 0.31], [0.46, 0.32]], [[0.46, 0.32], [0.44, 0.56]], [[0.31, 0.56], [0.58, 0.56]], [[0.58, 0.56], [0.44, 0.71]]],
      'む': [[[0.3, 0.3], [0.55, 0.3]], [[0.43, 0.29], [0.44, 0.63]], [[0.31, 0.63], [0.58, 0.64]], [[0.58, 0.64], [0.5, 0.76]]],
      'め': [[[0.31, 0.31], [0.56, 0.31]], [[0.56, 0.31], [0.42, 0.55], [0.3, 0.7]], [[0.42, 0.55], [0.6, 0.7]]],
      'も': [[[0.28, 0.28], [0.58, 0.28]], [[0.3, 0.46], [0.58, 0.46]], [[0.44, 0.24], [0.44, 0.72]], [[0.44, 0.62], [0.6, 0.72]]],

      'や': [[[0.29, 0.32], [0.44, 0.39]], [[0.44, 0.39], [0.56, 0.69]], [[0.56, 0.35], [0.62, 0.43]]],
      'ゆ': [[[0.29, 0.31], [0.45, 0.36]], [[0.45, 0.29], [0.45, 0.72]], [[0.45, 0.53], [0.6, 0.67]]],
      'よ': [[[0.28, 0.34], [0.6, 0.34]], [[0.42, 0.27], [0.42, 0.72]], [[0.28, 0.56], [0.6, 0.56]]],

      'ら': [[[0.32, 0.3], [0.46, 0.36]], [[0.46, 0.36], [0.42, 0.56], [0.58, 0.68]]],
      'り': [[[0.36, 0.27], [0.36, 0.66]], [[0.55, 0.29], [0.52, 0.72]]],
      'る': [[[0.3, 0.3], [0.56, 0.31]], [[0.56, 0.31], [0.44, 0.53], [0.58, 0.68]], [[0.58, 0.68], [0.48, 0.76]]],
      'れ': [[[0.3, 0.28], [0.5, 0.29]], [[0.42, 0.29], [0.42, 0.72]], [[0.42, 0.52], [0.58, 0.66]]],
      'ろ': [[[0.29, 0.3], [0.58, 0.3]], [[0.58, 0.3], [0.42, 0.54], [0.59, 0.7]]],

      'わ': [[[0.3, 0.33], [0.46, 0.36]], [[0.46, 0.36], [0.59, 0.63]]],
      'を': [[[0.3, 0.34], [0.56, 0.34]], [[0.4, 0.34], [0.41, 0.6]], [[0.41, 0.6], [0.59, 0.68]]],
      'ん': [[[0.35, 0.33], [0.45, 0.4], [0.48, 0.52]]]
    };

    const byKatakanaBasic = {
      'ア': [[[0.32, 0.28], [0.62, 0.28]], [[0.5, 0.28], [0.4, 0.72]]],
      'イ': [[[0.34, 0.3], [0.5, 0.48]], [[0.58, 0.28], [0.56, 0.72]]],
      'ウ': [[[0.33, 0.28], [0.56, 0.28]], [[0.48, 0.36], [0.48, 0.68]], [[0.39, 0.68], [0.6, 0.68]]],
      'エ': [[[0.32, 0.28], [0.62, 0.28]], [[0.47, 0.28], [0.47, 0.7]], [[0.3, 0.7], [0.64, 0.7]]],
      'オ': [[[0.32, 0.28], [0.62, 0.28]], [[0.48, 0.28], [0.48, 0.74]], [[0.36, 0.48], [0.62, 0.48]]],

      'カ': [[[0.34, 0.29], [0.58, 0.29]], [[0.55, 0.29], [0.52, 0.66]]],
      'キ': [[[0.3, 0.28], [0.62, 0.28]], [[0.33, 0.47], [0.61, 0.47]], [[0.46, 0.24], [0.48, 0.74]]],
      'ク': [[[0.36, 0.29], [0.58, 0.29]], [[0.58, 0.29], [0.42, 0.64]], [[0.42, 0.64], [0.6, 0.64]]],
      'ケ': [[[0.34, 0.28], [0.34, 0.7]], [[0.55, 0.27], [0.55, 0.62]], [[0.44, 0.53], [0.62, 0.53]]],
      'コ': [[[0.34, 0.31], [0.6, 0.31]], [[0.34, 0.67], [0.6, 0.67]]],

      'サ': [[[0.3, 0.3], [0.62, 0.3]], [[0.45, 0.24], [0.45, 0.74]], [[0.57, 0.25], [0.57, 0.53]]],
      'シ': [[[0.35, 0.34], [0.42, 0.38]], [[0.36, 0.49], [0.45, 0.53]], [[0.6, 0.31], [0.46, 0.72]]],
      'ス': [[[0.34, 0.31], [0.58, 0.31]], [[0.58, 0.31], [0.4, 0.58]], [[0.46, 0.55], [0.62, 0.71]]],
      'セ': [[[0.3, 0.31], [0.62, 0.31]], [[0.45, 0.24], [0.45, 0.7]], [[0.58, 0.24], [0.58, 0.52]]],
      'ソ': [[[0.37, 0.35], [0.47, 0.4]], [[0.58, 0.29], [0.46, 0.72]]],

      'タ': [[[0.35, 0.3], [0.57, 0.3]], [[0.57, 0.3], [0.4, 0.56]], [[0.41, 0.57], [0.61, 0.71]]],
      'チ': [[[0.31, 0.3], [0.63, 0.3]], [[0.47, 0.24], [0.47, 0.74]], [[0.33, 0.52], [0.62, 0.52]]],
      'ツ': [[[0.33, 0.34], [0.41, 0.39]], [[0.45, 0.32], [0.53, 0.37]], [[0.61, 0.29], [0.49, 0.73]]],
      'テ': [[[0.31, 0.31], [0.63, 0.31]], [[0.46, 0.31], [0.48, 0.73]], [[0.35, 0.52], [0.61, 0.52]]],
      'ト': [[[0.39, 0.25], [0.39, 0.73]], [[0.56, 0.48], [0.4, 0.58]]],

      'ナ': [[[0.3, 0.3], [0.62, 0.3]], [[0.47, 0.24], [0.47, 0.73]]],
      'ニ': [[[0.33, 0.34], [0.6, 0.34]], [[0.31, 0.67], [0.62, 0.67]]],
      'ヌ': [[[0.33, 0.32], [0.59, 0.32]], [[0.59, 0.32], [0.4, 0.58]], [[0.4, 0.58], [0.62, 0.7]], [[0.52, 0.67], [0.44, 0.77]]],
      'ネ': [[[0.34, 0.32], [0.58, 0.32]], [[0.46, 0.25], [0.46, 0.73]], [[0.46, 0.53], [0.6, 0.67]], [[0.34, 0.52], [0.57, 0.52]]],
      'ノ': [[[0.57, 0.25], [0.41, 0.72]]],

      'ハ': [[[0.35, 0.28], [0.31, 0.7]], [[0.58, 0.28], [0.62, 0.7]]],
      'ヒ': [[[0.35, 0.27], [0.35, 0.67]], [[0.35, 0.49], [0.56, 0.49]], [[0.56, 0.49], [0.6, 0.72]]],
      'フ': [[[0.33, 0.31], [0.61, 0.31]]],
      'ヘ': [[[0.3, 0.6], [0.46, 0.38], [0.64, 0.6]]],
      'ホ': [[[0.33, 0.27], [0.33, 0.73]], [[0.58, 0.27], [0.58, 0.73]], [[0.31, 0.5], [0.61, 0.5]], [[0.44, 0.27], [0.44, 0.73]]],

      'マ': [[[0.31, 0.3], [0.61, 0.3]], [[0.34, 0.52], [0.58, 0.52]], [[0.58, 0.52], [0.46, 0.72]]],
      'ミ': [[[0.33, 0.32], [0.6, 0.32]], [[0.35, 0.51], [0.58, 0.51]], [[0.31, 0.68], [0.62, 0.68]]],
      'ム': [[[0.41, 0.26], [0.32, 0.66]], [[0.32, 0.66], [0.61, 0.66]], [[0.55, 0.56], [0.63, 0.74]]],
      'メ': [[[0.32, 0.29], [0.61, 0.69]], [[0.58, 0.29], [0.37, 0.73]]],
      'モ': [[[0.31, 0.3], [0.61, 0.3]], [[0.34, 0.48], [0.59, 0.48]], [[0.45, 0.25], [0.45, 0.73]]],

      'ヤ': [[[0.33, 0.33], [0.44, 0.39]], [[0.44, 0.39], [0.55, 0.72]], [[0.56, 0.36], [0.63, 0.45]]],
      'ユ': [[[0.33, 0.31], [0.58, 0.31]], [[0.58, 0.31], [0.58, 0.69]], [[0.33, 0.69], [0.61, 0.69]]],
      'ヨ': [[[0.33, 0.3], [0.61, 0.3]], [[0.33, 0.5], [0.59, 0.5]], [[0.33, 0.7], [0.61, 0.7]], [[0.33, 0.28], [0.33, 0.72]]],

      'ラ': [[[0.33, 0.31], [0.61, 0.31]], [[0.61, 0.31], [0.43, 0.72]]],
      'リ': [[[0.37, 0.27], [0.37, 0.66]], [[0.58, 0.29], [0.56, 0.73]]],
      'ル': [[[0.36, 0.29], [0.36, 0.66]], [[0.56, 0.29], [0.55, 0.73]], [[0.36, 0.66], [0.58, 0.73]]],
      'レ': [[[0.38, 0.27], [0.38, 0.72]], [[0.38, 0.72], [0.61, 0.6]]],
      'ロ': [[[0.33, 0.3], [0.61, 0.3]], [[0.33, 0.3], [0.33, 0.72]], [[0.61, 0.3], [0.61, 0.72]], [[0.33, 0.72], [0.61, 0.72]]],

      'ワ': [[[0.33, 0.31], [0.61, 0.31]], [[0.61, 0.31], [0.49, 0.58]], [[0.49, 0.58], [0.62, 0.72]]],
      'ヲ': [[[0.33, 0.33], [0.61, 0.33]], [[0.44, 0.33], [0.45, 0.62]], [[0.45, 0.62], [0.62, 0.69]]],
      'ン': [[[0.38, 0.37], [0.5, 0.43]], [[0.62, 0.3], [0.48, 0.73]]]
    };

    const modifiedToBase = {
      'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ',
      'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ',
      'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と',
      'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ',
      'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ',
      'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ',
      'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ',
      'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト',
      'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ',
      'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ'
    };

    const byFamily = {
      k: [[[0.29, 0.28], [0.53, 0.28]], [[0.43, 0.28], [0.43, 0.69]], [[0.44, 0.47], [0.6, 0.62]]],
      g: [[[0.29, 0.28], [0.53, 0.28]], [[0.43, 0.28], [0.43, 0.69]], [[0.44, 0.47], [0.6, 0.62]]],
      s: [[[0.3, 0.3], [0.53, 0.31]], [[0.56, 0.34], [0.45, 0.5]], [[0.45, 0.5], [0.6, 0.66]]],
      z: [[[0.3, 0.3], [0.53, 0.31]], [[0.56, 0.34], [0.45, 0.5]], [[0.45, 0.5], [0.6, 0.66]]],
      t: [[[0.28, 0.29], [0.56, 0.29]], [[0.44, 0.3], [0.44, 0.66]], [[0.44, 0.56], [0.62, 0.72]]],
      d: [[[0.28, 0.29], [0.56, 0.29]], [[0.44, 0.3], [0.44, 0.66]], [[0.44, 0.56], [0.62, 0.72]]],
      n: [[[0.3, 0.3], [0.46, 0.35]], [[0.46, 0.35], [0.5, 0.68]]],
      h: [[[0.3, 0.28], [0.3, 0.66]], [[0.3, 0.47], [0.5, 0.48]], [[0.5, 0.48], [0.6, 0.67]]],
      b: [[[0.3, 0.28], [0.3, 0.66]], [[0.3, 0.47], [0.5, 0.48]], [[0.5, 0.48], [0.6, 0.67]]],
      p: [[[0.3, 0.28], [0.3, 0.66]], [[0.3, 0.47], [0.5, 0.48]], [[0.5, 0.48], [0.6, 0.67]]],
      m: [[[0.29, 0.31], [0.45, 0.32]], [[0.45, 0.32], [0.46, 0.56]], [[0.46, 0.56], [0.6, 0.69]]],
      y: [[[0.32, 0.32], [0.44, 0.39]], [[0.44, 0.39], [0.56, 0.69]]],
      r: [[[0.36, 0.29], [0.5, 0.35]], [[0.5, 0.35], [0.44, 0.69]]],
      w: [[[0.3, 0.33], [0.46, 0.36]], [[0.46, 0.36], [0.59, 0.63]]]
    };

    const generic = [[[0.28, 0.28], [0.54, 0.3]], [[0.54, 0.3], [0.42, 0.55]], [[0.42, 0.55], [0.6, 0.7]]];
    const baseChar = modifiedToBase[item.char] || '';
    const byChar =
      byHiraganaBasic[item.char] ||
      byKatakanaBasic[item.char] ||
      byHiraganaBasic[baseChar] ||
      byKatakanaBasic[baseChar];
    const base = byChar || byFamily[family] || generic;
    return base;
  }

  function drawStrokePartial(stroke, progress, color, lineWidth) {
    if (!stroke || stroke.length < 2) return;
    const rect = strokeGuideCanvas.getBoundingClientRect();
    const points = stroke.map(function (p) {
      return [p[0] * rect.width, p[1] * rect.height];
    });

    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy);
    }

    const target = total * progress;
    let traveled = 0;

    guideCtx.beginPath();
    guideCtx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const x0 = points[i - 1][0];
      const y0 = points[i - 1][1];
      const x1 = points[i][0];
      const y1 = points[i][1];
      const segLen = Math.hypot(x1 - x0, y1 - y0);

      if (traveled + segLen <= target) {
        guideCtx.lineTo(x1, y1);
        traveled += segLen;
      } else {
        const remain = Math.max(0, target - traveled);
        const ratio = segLen === 0 ? 0 : remain / segLen;
        guideCtx.lineTo(x0 + (x1 - x0) * ratio, y0 + (y1 - y0) * ratio);
        break;
      }
    }

    guideCtx.strokeStyle = color;
    guideCtx.lineWidth = lineWidth;
    guideCtx.lineCap = 'round';
    guideCtx.lineJoin = 'round';
    guideCtx.stroke();
  }

  function drawStrokeNumbers(strokes, activeIndex) {
    const rect = strokeGuideCanvas.getBoundingClientRect();
    strokes.forEach(function (stroke, index) {
      const p = stroke[0];
      if (!p) return;
      const x = p[0] * rect.width;
      const y = p[1] * rect.height;
      guideCtx.beginPath();
      guideCtx.fillStyle = index === activeIndex ? '#ff9350' : 'rgba(89, 119, 182, 0.75)';
      guideCtx.arc(x, y, 11, 0, Math.PI * 2);
      guideCtx.fill();
      guideCtx.fillStyle = '#fff';
      guideCtx.font = '700 12px Outfit, sans-serif';
      guideCtx.textAlign = 'center';
      guideCtx.textBaseline = 'middle';
      guideCtx.fillText(String(index + 1), x, y + 0.5);
    });
  }

  function renderStrokeGuideFrame(strokes, activeIndex, activeProgress) {
    const rect = strokeGuideCanvas.getBoundingClientRect();
    guideCtx.clearRect(0, 0, rect.width, rect.height);

    for (let i = 0; i < activeIndex; i++) {
      drawStrokePartial(strokes[i], 1, 'rgba(255,147,80,0.7)', 4);
    }

    if (activeIndex < strokes.length) {
      drawStrokePartial(strokes[activeIndex], activeProgress, '#ff7c2f', 5);
    }
    drawStrokeNumbers(strokes, activeIndex);
  }

  function playStrokeAnimation() {
    if (!currentItem) return;
    if (isStrokeAnimating) {
      cancelStrokeAnimation();
      setupGuideCanvas();
      if (activeGuideStrokes.length) renderStrokeGuideFrame(activeGuideStrokes, 0, 0);
      return;
    }

    cancelStrokeAnimation();
    isStrokeAnimating = true;
    btnPlayStrokeAnimation.textContent = 'Hentikan Animasi';
    setupGuideCanvas();
    const strokes = activeGuideStrokes.length ? activeGuideStrokes : getGuideStrokes(currentItem);
    activeGuideStrokes = strokes;
    let index = 0;
    const timing = getStrokeAnimationTiming();

    function runStroke() {
      if (index >= strokes.length) {
        renderStrokeGuideFrame(strokes, Math.max(0, strokes.length - 1), 1);
        if (strokeLoopToggle && strokeLoopToggle.checked) {
          strokeAnimDelay = setTimeout(function () {
            index = 0;
            runStroke();
          }, timing.loopPauseMs);
          return;
        }
        isStrokeAnimating = false;
        btnPlayStrokeAnimation.textContent = 'Lihat Animasi Stroke';
        return;
      }

      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / timing.strokeMs);
        renderStrokeGuideFrame(strokes, index, p);
        if (p < 1) {
          strokeAnimFrame = requestAnimationFrame(step);
        } else {
          index++;
          strokeAnimDelay = setTimeout(runStroke, timing.gapMs);
        }
      }
      strokeAnimFrame = requestAnimationFrame(step);
    }

    runStroke();
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
      'し': 1, 'シ': 3, 'つ': 1, 'ツ': 3, 'そ': 1, 'ソ': 2, 'の': 1, 'ノ': 1,
      'ふ': 4, 'フ': 1, 'ら': 2, 'ラ': 2, 'り': 2, 'リ': 2
    };

    const fallbackStrokeByFamily = {
      a: 3, k: 3, g: 3, s: 3, z: 3, j: 3, sh: 1, t: 3, d: 3, ch: 3, ts: 1,
      n: 2, h: 3, b: 3, p: 3, f: 4, m: 3, y: 3, r: 2, w: 2
    };

    const familyStyle = {
      a: 'fokus pada lengkung utama yang halus',
      k: 'gabungkan satu garis pendek lalu stroke badan yang lebih panjang',
      g: 'ikuti pola keluarga K lalu tambah tanda suara',
      s: 'mulai tipis, lalu lanjutkan stroke melengkung di tengah',
      z: 'ikuti pola keluarga S lalu tambah tanda suara',
      j: 'buat bentuk dasar ji dengan lengkungan tidak patah',
      sh: 'tarik satu stroke utama yang mengalir dari atas ke bawah',
      t: 'jaga sumbu vertikal agar karakter tetap tegak',
      d: 'ikuti pola keluarga T lalu tambah tanda suara',
      ch: 'buat tiga stroke berurutan: pendek, vertikal, lalu penutup',
      ts: 'awali dengan stroke kecil lalu akhiri stroke utama yang dominan',
      n: 'pakai stroke ringan, jangan menekan terlalu tebal',
      h: 'buat badan huruf dahulu lalu rapikan penutup',
      b: 'ikuti pola keluarga H lalu tambah tanda suara',
      p: 'ikuti pola keluarga H lalu tambah maru',
      f: 'buat dua titik awal kecil lalu stroke utama panjang',
      m: 'jaga jarak antar stroke agar huruf tidak menumpuk',
      y: 'utamakan keseimbangan antara stroke pendek dan stroke utama',
      r: 'pakai sapuan cepat dan tipis pada stroke awal',
      w: 'buat lekukan akhir secukupnya agar bentuk tidak berlebihan'
    };

    const charSpecialNote = {
      'じ': 'Catatan: ini bentuk ji yang paling umum dipakai sehari-hari.',
      'ぢ': 'Catatan: ini ji versi dakuten dari ち (pemakaian lebih jarang).',
      'ず': 'Catatan: ini bentuk zu yang paling umum dipakai sehari-hari.',
      'づ': 'Catatan: ini zu versi dakuten dari つ (pemakaian lebih jarang).',
      'ヂ': 'Catatan: ini ji versi katakana dari チ + dakuten.',
      'ヅ': 'Catatan: ini zu versi katakana dari ツ + dakuten.',
      'を': 'Catatan: dibaca "o" dalam kalimat modern, bukan "wo" penuh.',
      'ヲ': 'Catatan: sering dipakai untuk partikel objek (dibaca "o").'
    };

    const strokeHint = strokeCountByChar[item.char] || fallbackStrokeByFamily[family] || 3;
    const styleHint = familyStyle[family] || 'ikuti bentuk contoh dari atas ke bawah secara konsisten';

    const detailed = [
      'Huruf: ' + item.char + ' (' + item.romaji + ') [' + scriptName + '] - estimasi ' + strokeHint + ' stroke.',
      'Step 1: mulai dari area atas-kiri, lalu ikuti urutan stroke standar (atas ke bawah, kiri ke kanan).',
      'Step 2: saat stroke utama, ' + styleHint + '.',
      'Step 3: angkat jari/pena di akhir setiap stroke, lalu rapikan ujung agar bentuk tetap bersih.'
    ];

    if (isModified) {
      const mark = first === 'p' ? 'maru (°)' : 'tenten (")';
      detailed.push('Terakhir, tambahkan ' + mark + ' di kanan atas huruf utama dengan ukuran kecil.');
    }

    if (charSpecialNote[item.char]) {
      detailed.push(charSpecialNote[item.char]);
    }

    return detailed;
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
    cancelStrokeAnimation();
    practiceCharEl.textContent = item.char;
    practiceRomajiEl.textContent = item.romaji;
    charGuide.textContent = item.char;
    activeGuideStrokes = getGuideStrokes(item);
    const count = getCount(type, item.char);
    updateProgressUI(count);
    renderWritingSteps(type, item);
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 25% (Cukup) agar progress bertambah.');
    btnNext.disabled = count >= TARGET_COUNT;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      setupCanvas();
      setupGuideCanvas();
      renderStrokeGuideFrame(activeGuideStrokes, 0, 0);
      playStrokeAnimation();
      if (!hasSeenTutorial()) showTutorial();
    });
  }

  function closeModal() {
    cancelStrokeAnimation();
    setupGuideCanvas();
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
    setAccuracyUI(null, 'Belum dinilai', '', 'Minimal 25% (Cukup) agar progress bertambah.');
  });

  btnPlayStrokeAnimation.addEventListener('click', function () {
    playStrokeAnimation();
  });

  strokeSpeedSelect.addEventListener('change', function () {
    if (isStrokeAnimating) {
      cancelStrokeAnimation();
      playStrokeAnimation();
    }
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
        'Belum dihitung. Minimal 25% agar progress bertambah.'
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
    if (modal.classList.contains('is-open')) {
      setupCanvas();
      setupGuideCanvas();
      if (activeGuideStrokes.length) {
        renderStrokeGuideFrame(activeGuideStrokes, 0, 0);
      }
    }
  });
})();
