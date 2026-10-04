(() => {
  const STORAGE_KEY = 'taskcade-state-v1';
  const starterTasks = [
    { id: crypto.randomUUID(), text: 'Review notes for 20 minutes', difficulty: 'easy' },
    { id: crypto.randomUUID(), text: 'Finish one homework problem set', difficulty: 'medium' },
    { id: crypto.randomUUID(), text: 'Start the project outline', difficulty: 'hard' },
    { id: crypto.randomUUID(), text: 'Pack tomorrow’s school bag', difficulty: 'easy' }
  ];

  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
  const state = {
    tasks: Array.isArray(saved?.tasks) ? saved.tasks : starterTasks,
    completed: Array.isArray(saved?.completed) ? saved.completed : [],
    game: saved?.game || 'balloon',
    selectedId: null,
    clawX: 50,
    wheelRotation: 0,
    busy: false,
    recentPicks: Array.isArray(saved?.recentPicks) ? saved.recentPicks : [],
    pickCounts: saved?.pickCounts || {},
    guideSeen: saved?.guideSeen === true,
    soundEnabled: saved?.soundEnabled !== false,
    stats: saved?.stats || { total: Array.isArray(saved?.completed) ? saved.completed.length : 0, streak: 0, lastDate: null, dailyBreaksClaimed: 0, breakEndsAt: null }
  };

  const $ = (s) => document.querySelector(s);
  const els = {
    gameStage: $('#gameStage'), gameBoard: $('#gameBoard'), emptyGame: $('#emptyGame'),
    resultCard: $('#resultCard'), resultTask: $('#resultTask'), resultDifficulty: $('#resultDifficulty'),
    taskForm: $('#taskForm'), taskInput: $('#taskInput'), difficultyInput: $('#difficultyInput'),
    taskList: $('#taskList'), completedList: $('#completedList'), taskCount: $('#taskCount'),
    doneCount: $('#doneCount'), readyBadge: $('#readyBadge'), toast: $('#toast'),
    streakCount: $('#streakCount'), soundToggle: $('#soundToggle'), rewardStrip: $('#rewardStrip'),
    siteGuide: $('#siteGuide'), helpButton: $('#helpButton'), closeGuide: $('#closeGuide'), dismissGuide: $('#dismissGuide'), closeResult: $('#closeResult'),
    breakTimer: $('#breakTimer'), breakCountdown: $('#breakCountdown'), endBreakBtn: $('#endBreakBtn')
  };

  const difficultyPoints = { easy: 1, medium: 2, hard: 3 };
  const colors = ['#e83f6f', '#ff8c32', '#10a7a2', '#6f56d9', '#ef5b2a', '#f3bd24', '#168ad2', '#c93996', '#6ebd38', '#ed3f3f'];
  const balloonColors = [
    ['#ff96bd','#f03f83','#a90f4f'], ['#c7a8ff','#845de7','#4c2aa8'], ['#6be5f4','#19afd0','#08718f'],
    ['#ffe36b','#f5a824','#b45a0b'], ['#8fea77','#42b64d','#1f7131'], ['#ff9672','#f1543e','#a92631'],
    ['#7ab8ff','#347be1','#174694'], ['#f08bea','#c43db0','#7d206f']
  ];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escapeHtml = (text) => String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, completed: state.completed, game: state.game, recentPicks: state.recentPicks, pickCounts: state.pickCounts, guideSeen: state.guideSeen, soundEnabled: state.soundEnabled, stats: state.stats }));
  const getSelected = () => state.tasks.find(t => t.id === state.selectedId);
  let audioContext;
  let breakTimerInterval;
  let lastRewardPoints = null;

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function playSound(kind) {
    if (!state.soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (kind === 'pop') {
        const duration = .16;
        const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const envelope = Math.pow(1 - i / data.length, 2.7);
          data[i] = (Math.random() * 2 - 1) * envelope;
        }
        const noise = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        noise.buffer = buffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(720, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(1800, audioContext.currentTime + duration);
        gain.gain.setValueAtTime(.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
        noise.connect(filter).connect(gain).connect(audioContext.destination);
        noise.start();
        return;
      }
      const presets = {
        click: [[420,.045,0]], add: [[520,.07,0],[700,.08,.07]], throw: [[220,.08,0],[340,.1,.05]],
        miss: [[210,.12,0],[150,.16,.1]], grab: [[180,.08,0],[240,.09,.08]],
        win: [[523,.09,0],[659,.09,.1],[784,.16,.2]], tick: [[920,.025,0]], unlock: [[660,.08,0],[880,.1,.09],[1100,.16,.18]]
      };
      (presets[kind] || presets.click).forEach(([frequency,duration,delay]) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = kind === 'miss' ? 'sawtooth' : 'square';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.035, audioContext.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + delay + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + delay);
        oscillator.stop(audioContext.currentTime + delay + duration);
      });
    } catch {}
  }

  function recordPick(id) {
    state.recentPicks = [id, ...state.recentPicks.filter(item => item !== id)].slice(0, 3);
    state.pickCounts[id] = (state.pickCounts[id] || 0) + 1;
  }

  function showMissImpact() {
    els.gameStage.classList.remove('miss-impact');
    void els.gameStage.offsetWidth;
    els.gameStage.classList.add('miss-impact');
    setTimeout(() => els.gameStage.classList.remove('miss-impact'), 320);
  }

  function setSelected(id) {
    state.selectedId = id;
    const task = getSelected();
    if (!task) return hideResult();
    recordPick(id);
    els.resultTask.textContent = task.text;
    els.resultDifficulty.textContent = task.difficulty;
    els.resultDifficulty.className = `difficulty-pill ${task.difficulty}`;
    els.resultCard.classList.remove('hidden');
    els.resultCard.setAttribute('aria-hidden', 'false');
    els.resultCard.focus({ preventScroll: true });
  }

  function hideResult() {
    state.selectedId = null;
    els.resultCard.classList.add('hidden');
    els.resultCard.setAttribute('aria-hidden', 'true');
  }

  function randomTask(source = state.tasks) {
    if (!source.length) return null;
    let pool = source.filter(task => !state.recentPicks.slice(0, 2).includes(task.id));
    if (!pool.length) pool = source;
    const fewestPicks = Math.min(...pool.map(task => state.pickCounts[task.id] || 0));
    const fairest = pool.filter(task => (state.pickCounts[task.id] || 0) === fewestPicks);
    return fairest[Math.floor(Math.random() * fairest.length)];
  }

  function render() {
    syncDailyStats();
    save();
    els.taskCount.textContent = state.tasks.length;
    els.doneCount.textContent = state.completed.length;
    els.streakCount.textContent = state.stats.streak || 0;
    els.readyBadge.textContent = state.tasks.length;
    els.soundToggle.classList.toggle('muted', !state.soundEnabled);
    els.soundToggle.setAttribute('aria-pressed', String(state.soundEnabled));
    els.soundToggle.setAttribute('aria-label', state.soundEnabled ? 'Mute game sounds' : 'Turn on game sounds');
    renderRewards();
    renderLists();
    renderGame();
    if (!getSelected()) hideResult();
  }

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function syncDailyStats() {
    const todayKey = localDateKey();
    const todaysCompleted = state.completed.filter(task => task.completedAt && localDateKey(new Date(task.completedAt)) === todayKey);
    if (state.stats.dailyDate !== todayKey) {
      state.stats.dailyDate = todayKey;
      state.stats.dailyTasks = todaysCompleted.length;
      state.stats.dailyPoints = todaysCompleted.reduce((sum, task) => sum + (difficultyPoints[task.difficulty] || 1), 0);
      state.stats.dailyBreaksClaimed = 0;
      state.stats.breakEndsAt = null;
      return;
    }
    if (!Number.isFinite(state.stats.dailyTasks)) state.stats.dailyTasks = Number.isFinite(state.stats.dailyCount) ? state.stats.dailyCount : todaysCompleted.length;
    if (!Number.isFinite(state.stats.dailyPoints)) {
      state.stats.dailyPoints = todaysCompleted.length
        ? todaysCompleted.reduce((sum, task) => sum + (difficultyPoints[task.difficulty] || 1), 0)
        : (state.stats.dailyCount || 0);
    }
  }

  function renderRewards() {
    const dailyPoints = state.stats.dailyPoints || 0;
    const dailyTasks = state.stats.dailyTasks || 0;
    const levelSize = 6;
    const levelsCleared = Math.floor(dailyPoints / levelSize);
    const progress = dailyPoints % levelSize;
    const nextTarget = (levelsCleared + 1) * levelSize;
    const percent = (progress / levelSize) * 100;
    const previousPoints = lastRewardPoints;
    const previousProgress = previousPoints === null ? progress : previousPoints % levelSize;
    const previousPercent = (previousProgress / levelSize) * 100;
    const passes = Math.max(0, levelsCleared - (state.stats.dailyBreaksClaimed || 0));
    document.body.classList.toggle('run-powered', levelsCleared >= 1);
    document.body.classList.toggle('run-champion', levelsCleared >= 3);
    els.rewardStrip.innerHTML = `<div class="daily-run-copy"><span>DAILY RUN · LEVEL ${levelsCleared + 1}</span><strong>${dailyPoints} points · ${dailyTasks} ${dailyTasks === 1 ? 'task' : 'tasks'} today</strong></div>
      <div class="daily-progress" role="progressbar" aria-label="Daily Run points toward the next level" aria-valuemin="0" aria-valuemax="${levelSize}" aria-valuenow="${progress}"><i style="width:${previousPercent}%"></i></div>
      <span class="reward-badge unlocked">${passes} Recharge ${passes === 1 ? 'Pass' : 'Passes'}</span>
      <span class="reward-badge">Next pass in ${nextTarget - dailyPoints} pts</span>
      <button class="reward-badge reward-action" type="button" data-claim-break ${passes ? '' : 'disabled'}>${passes ? 'Take a 5-min break' : 'Earn 6 pts to unlock'}</button>`;
    const progressBar = els.rewardStrip.querySelector('.daily-progress i');
    if (previousPoints !== null && dailyPoints > previousPoints && Math.floor(dailyPoints / levelSize) > Math.floor(previousPoints / levelSize)) {
      requestAnimationFrame(() => {
        progressBar.style.width = '100%';
        progressBar.classList.add('level-up');
        setTimeout(() => {
          progressBar.style.transition = 'none';
          progressBar.style.width = '0%';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            progressBar.style.transition = '';
            progressBar.style.width = `${percent}%`;
          }));
        }, reducedMotion ? 20 : 520);
      });
    } else {
      requestAnimationFrame(() => { progressBar.style.width = `${percent}%`; });
    }
    lastRewardPoints = dailyPoints;
  }

  function availableBreaks() {
    return Math.max(0, Math.floor((state.stats.dailyPoints || 0) / 6) - (state.stats.dailyBreaksClaimed || 0));
  }

  function updateBreakTimer() {
    const remaining = Math.max(0, (state.stats.breakEndsAt || 0) - Date.now());
    if (!remaining) {
      clearInterval(breakTimerInterval);
      state.stats.breakEndsAt = null;
      els.breakTimer.classList.add('hidden');
      els.breakTimer.setAttribute('aria-hidden', 'true');
      save();
      showToast('Recharge complete. Ready for the next mission!');
      playSound('unlock');
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    els.breakCountdown.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function openBreakTimer() {
    if (!state.stats.breakEndsAt || state.stats.breakEndsAt <= Date.now()) {
      if (!availableBreaks()) return;
      state.stats.dailyBreaksClaimed = (state.stats.dailyBreaksClaimed || 0) + 1;
      state.stats.breakEndsAt = Date.now() + 5 * 60 * 1000;
      save();
      renderRewards();
    }
    els.breakTimer.classList.remove('hidden');
    els.breakTimer.setAttribute('aria-hidden', 'false');
    clearInterval(breakTimerInterval);
    updateBreakTimer();
    breakTimerInterval = setInterval(updateBreakTimer, 1000);
    els.endBreakBtn.focus();
  }

  function endBreakEarly() {
    clearInterval(breakTimerInterval);
    state.stats.breakEndsAt = null;
    save();
    els.breakTimer.classList.add('hidden');
    els.breakTimer.setAttribute('aria-hidden', 'true');
    showToast('Break ended. Welcome back!');
  }

  function renderLists() {
    els.taskList.innerHTML = state.tasks.length ? state.tasks.map(task => `
      <div class="task-item" data-id="${task.id}">
        <button class="task-check" data-action="complete" aria-label="Mark ${escapeHtml(task.text)} complete">✓</button>
        <div><div class="task-name">${escapeHtml(task.text)}</div><div class="task-meta"><span class="mini-difficulty">${task.difficulty}</span></div></div>
        <div class="task-actions">
          <button class="icon-button" data-action="edit" title="Edit task" aria-label="Edit ${escapeHtml(task.text)}">✎</button>
          <button class="icon-button" data-action="delete" title="Delete task" aria-label="Delete ${escapeHtml(task.text)}">×</button>
        </div>
      </div>`).join('') : '<div class="empty-list">No tasks yet. Add one above to stock the games.</div>';

    els.completedList.innerHTML = state.completed.length ? state.completed.map(task => `
      <div class="task-item">
        <span class="task-check completed-check">✓</span>
        <div><div class="task-name">${escapeHtml(task.text)}</div><div class="task-meta"><span class="mini-difficulty">${task.difficulty}</span></div></div>
        <button class="icon-button" data-restore="${task.id}" title="Restore task" aria-label="Restore ${escapeHtml(task.text)}">↶</button>
      </div>`).join('') : '<div class="empty-list">Finished tasks land here.</div>';
  }

  function promptAddTask() {
    els.taskForm.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    els.taskInput.focus({ preventScroll: true });
    showToast('Add a task below to load the arcade.');
  }

  function renderGame() {
    els.gameStage.className = `game-stage ${state.game}-theme`;
    document.body.classList.remove('theme-balloon', 'theme-claw', 'theme-wheel');
    document.body.classList.add(`theme-${state.game}`);
    document.querySelectorAll('.game-tab').forEach(tab => {
      const active = tab.dataset.game === state.game;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const hasTasks = state.tasks.length > 0;
    const playableEmpty = !hasTasks && (state.game === 'balloon' || state.game === 'claw');
    els.emptyGame.classList.toggle('hidden', hasTasks || playableEmpty);
    els.gameBoard.innerHTML = '';
    if (!hasTasks && state.game === 'wheel') return;
    if (state.game === 'balloon') renderBalloons();
    if (state.game === 'claw') renderClaw();
    if (state.game === 'wheel') renderWheel();
  }

  function openGuide() {
    els.siteGuide.classList.remove('hidden');
    els.siteGuide.setAttribute('aria-hidden', 'false');
    els.closeGuide.focus();
  }

  function closeGuide() {
    state.guideSeen = true;
    save();
    els.siteGuide.classList.add('hidden');
    els.siteGuide.setAttribute('aria-hidden', 'true');
    els.helpButton.focus();
  }

  function renderBalloons() {
    const shown = state.tasks.slice(0, 8);
    const cells = [[0,0],[1,1],[3,0],[2,1],[1,0],[3,1],[0,1],[2,0]];
    const seed = shown.reduce((sum, task) => sum + [...task.id].reduce((n, char) => n + char.charCodeAt(0), 0), 0);
    cells.sort((a,b) => ((a[0]*37+a[1]*19+seed)%97)-((b[0]*37+b[1]*19+seed)%97));
    const decorativeCells = [[0,2],[1,2],[2,2],[3,2],[0.5,0.5],[1.5,1.5],[2.5,0.5],[3.5,1.5]];
    const decorativeBalloons = decorativeCells.map(([column, row], i) => {
      const palette = balloonColors[(i + 2) % balloonColors.length];
      return `<div class="balloon decorative" aria-label="Decorative balloon" data-column="${column}" data-row="${row}" style="--balloon-light:${palette[0]};--balloon-mid:${palette[1]};--balloon-dark:${palette[2]};--drift-x:${(i%2?12:-10)}px;--drift-y:${8+i}px;--drift-back-x:${(i%2?-8:10)}px;--drift-back-y:${-6-i}px"></div>`;
    }).join('');
    els.gameBoard.innerHTML = `<div class="balloon-scene" aria-label="Balloon dart game">
      <svg class="utah-landscape" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="utahSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#287ec5"/><stop offset=".42" stop-color="#f28b4c"/><stop offset=".74" stop-color="#ffc567"/><stop offset="1" stop-color="#df6a3c"/></linearGradient>
          <linearGradient id="mesaFace" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e76537"/><stop offset=".52" stop-color="#a93d2c"/><stop offset="1" stop-color="#6e2730"/></linearGradient>
          <linearGradient id="desertFloor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d96134"/><stop offset="1" stop-color="#8d3028"/></linearGradient>
          <filter id="sunGlow"><feGaussianBlur stdDeviation="12"/></filter>
        </defs>
        <rect width="1200" height="620" fill="url(#utahSky)"/>
        <circle cx="935" cy="116" r="67" fill="#ffd56a" opacity=".28" filter="url(#sunGlow)"/>
        <circle cx="935" cy="116" r="47" fill="#ffe28a"/>
        <path d="M0 365L90 342l35-74h128l28 65 98 25 75-83h220l58 75 93-18 42-102h143l35 102 175 45v243H0Z" fill="#8b3540" opacity=".55"/>
        <path d="M0 428V292h82l24-48h220l27 102 88 28v254H0Zm1200 0V264h-72l-29-72H901l-31 151-89 35v250h419Z" fill="#702735"/>
        <path d="M0 427V318h90l30-51h183l25 111 97 31v219H0Zm1200 0V295h-89l-32-70H927l-30 145-111 38v220h414Z" fill="url(#mesaFace)"/>
        <path d="M120 267h183l15 64H105Z M927 225h152l18 62H914Z" fill="#f07b3e" opacity=".9"/>
        <path d="M0 480c175-35 328-17 472 22 165 45 312 40 452-3 95-29 187-36 276-14v135H0Z" fill="url(#desertFloor)"/>
        <path d="M0 520c206-26 354-2 512 39 194 50 411 4 688-33v94H0Z" fill="#b4462f" opacity=".72"/>
        <g fill="#173f2b" opacity=".7"><path transform="translate(280 0)" d="M744 451h9v69h-9zM725 468h24v8h-24zM725 454h8v22h-8zM750 460h8v25h-8z"/><path d="M453 476h7v49h-7zM440 487h17v7h-17zM440 475h7v19h-7z"/></g>
      </svg>
      ${decorativeBalloons}
      ${shown.map((task, i) => {
        const [column,row] = cells[i];
        const palette = balloonColors[i % balloonColors.length];
        return `<div class="balloon" data-balloon="${task.id}" aria-label="Task balloon" data-column="${column}" data-row="${row}" style="--balloon-light:${palette[0]};--balloon-mid:${palette[1]};--balloon-dark:${palette[2]}"></div>`;
      }).join('')}
      <div class="wood-footer" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="western-sign">TASK ROUNDUP</div>
      <div class="aim-line" id="aimLine"></div>
      <div class="dart-launcher" id="dartLauncher" role="button" tabindex="0" aria-label="Pull back and release the dart"><div class="dart" id="dart" aria-hidden="true"><span class="dart-tip"></span><span class="dart-barrel"></span><span class="dart-shaft"></span><span class="dart-flight"></span></div></div>
      <div class="dart-hint">Pull the dart down to aim • release to throw</div>
      <div class="dart-key-controls" aria-label="Keyboard dart controls"><button type="button" data-dart-angle="-8" aria-label="Aim dart left">◀</button><button type="button" id="fireDart">FIRE</button><button type="button" data-dart-angle="8" aria-label="Aim dart right">▶</button></div>
    </div>`;
    setupBalloonMotion();
    setupDartGame();
  }

  function setupBalloonMotion() {
    const scene = els.gameBoard.querySelector('.balloon-scene');
    const balloons = [...scene.querySelectorAll('.balloon')];
    const footer = scene.querySelector('.wood-footer');
    let frame = 0;
    let previous = performance.now();
    const movers = balloons.map((balloon, index) => ({
      element: balloon,
      x: 0,
      y: 0,
      vx: (index % 2 ? -1 : 1) * (24 + (index * 11) % 19),
      vy: (index % 3 ? 1 : -1) * (17 + (index * 7) % 15),
      turnAt: performance.now() + 900 + Math.random() * 2100
    }));
    movers.forEach(mover => {
      mover.targetVx = mover.vx;
      mover.targetVy = mover.vy;
    });

    const place = () => {
      const width = scene.clientWidth;
      const height = scene.clientHeight;
      const usableHeight = Math.max(180, height - (footer?.offsetHeight || 0) - 30);
      movers.forEach((mover, index) => {
        const rect = mover.element.getBoundingClientRect();
        const columns = 4;
        const rows = 3;
        const column = Math.min(columns - 0.01, Number(mover.element.dataset.column || index % columns));
        const row = Math.min(rows - 0.01, Number(mover.element.dataset.row || Math.floor(index / columns) % rows));
        mover.x = 14 + column * ((width - rect.width - 28) / Math.max(1, columns - 1));
        mover.y = 16 + row * ((usableHeight - rect.height - 16) / Math.max(1, rows - 1));
      });
    };
    place();

    const move = now => {
      if (!scene.isConnected) return cancelAnimationFrame(frame);
      const dt = Math.min(.034, Math.max(.008, (now - previous) / 1000));
      previous = now;
      const width = scene.clientWidth;
      const height = scene.clientHeight;

      movers.forEach((mover, index) => {
        const balloonWidth = mover.element.offsetWidth;
        const balloonHeight = mover.element.offsetHeight;
        const minX = 10, maxX = Math.max(minX, width - balloonWidth - 10);
        const footerHeight = footer?.offsetHeight || 0;
        const minY = 10, maxY = Math.max(minY, height - balloonHeight - footerHeight - 54);
        if (now >= mover.turnAt) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 27 + Math.random() * 24;
          mover.targetVx = Math.cos(angle) * speed;
          mover.targetVy = Math.sin(angle) * speed;
          mover.turnAt = now + 1700 + Math.random() * 3200;
        }
        const acceleration = 18 * dt;
        mover.vx += Math.max(-acceleration, Math.min(acceleration, mover.targetVx - mover.vx));
        mover.vy += Math.max(-acceleration, Math.min(acceleration, mover.targetVy - mover.vy));
        mover.x += mover.vx * dt;
        mover.y += mover.vy * dt;
        if (mover.x <= minX || mover.x >= maxX) {
          mover.x = Math.max(minX, Math.min(maxX, mover.x));
          mover.targetVx = mover.x <= minX ? Math.abs(mover.targetVx) : -Math.abs(mover.targetVx);
        }
        if (mover.y <= minY || mover.y >= maxY) {
          mover.y = Math.max(minY, Math.min(maxY, mover.y));
          mover.targetVy = mover.y <= minY ? Math.abs(mover.targetVy) : -Math.abs(mover.targetVy);
        }
        mover.element.style.transform = `translate3d(${mover.x}px,${mover.y}px,0) rotate(${Math.sin(now / 850 + index) * 2.2}deg)`;
      });

      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          const a = movers[i], b = movers[j];
          const aw = a.element.offsetWidth, ah = a.element.offsetHeight;
          const bw = b.element.offsetWidth, bh = b.element.offsetHeight;
          const dx = (a.x + aw / 2) - (b.x + bw / 2);
          const dy = (a.y + ah / 2) - (b.y + bh / 2);
          const safeX = (aw + bw) * .52;
          const safeY = (ah + bh) * .48;
          if (Math.abs(dx) < safeX && Math.abs(dy) < safeY) {
            const distance = Math.hypot(dx,dy) || 1;
            const separation = 8;
            const forceX = dx / distance * separation;
            const forceY = dy / distance * separation;
            a.targetVx += forceX; b.targetVx -= forceX;
            a.targetVy += forceY; b.targetVy -= forceY;
            [a,b].forEach(mover => {
              const speed = Math.hypot(mover.targetVx,mover.targetVy);
              if (speed > 56) {
                mover.targetVx = mover.targetVx / speed * 56;
                mover.targetVy = mover.targetVy / speed * 56;
              }
            });
          }
        }
      }
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
  }

  function burstBalloon(balloon, scene) {
    const balloonRect = balloon.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'balloon-burst';
    burst.style.left = `${balloonRect.left - sceneRect.left + balloonRect.width / 2}px`;
    burst.style.top = `${balloonRect.top - sceneRect.top + balloonRect.height / 2}px`;
    const color = getComputedStyle(balloon).getPropertyValue('--balloon-mid').trim() || '#ff4d8d';
    burst.style.setProperty('--burst-color', color);
    burst.innerHTML = `<b></b>${Array.from({length:12},(_,i)=>`<i style="--burst-angle:${i*30}deg;--burst-distance:-${34 + (i%4)*8}px"></i>`).join('')}`;
    scene.appendChild(burst);
    balloon.classList.add('popped');
    setTimeout(() => burst.remove(), 520);
  }

  function setupDartGame() {
    const scene = els.gameBoard.querySelector('.balloon-scene');
    const launcher = $('#dartLauncher');
    const dart = $('#dart');
    const aimLine = $('#aimLine');
    let pulling = false, dragX = 0, dragY = 0, frame = 0, keyboardAngle = 0;
    const drawDart = (x, y, angle = 0) => { dart.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`; };
    const resetDart = () => { cancelAnimationFrame(frame); drawDart(0, 0, 0); scene.classList.remove('aiming'); pulling = false; };

    launcher.addEventListener('pointerdown', event => {
      if (state.busy) return;
      pulling = true; dragX = 0; dragY = 0;
      scene.classList.add('aiming');
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener('pointermove', event => {
      if (!pulling) return;
      const rect = launcher.getBoundingClientRect();
      let dx = event.clientX - (rect.left + rect.width / 2);
      let dy = Math.max(0, event.clientY - (rect.top + rect.height / 2));
      const horizontalLimit = Math.max(8, dy * 2.7);
      dx = Math.max(-horizontalLimit, Math.min(horizontalLimit, dx));
      const length = Math.hypot(dx, dy) || 1;
      if (length > 82) { dx = dx / length * 82; dy = dy / length * 82; }
      dragX = dx; dragY = dy;
      const angle = Math.atan2(-dx, Math.max(dy, 1)) * 180 / Math.PI;
      drawDart(dx, dy, angle);
      aimLine.style.transform = `rotate(${angle}deg)`;
    });
    const launchDart = () => {
      if (state.busy) return;
      if (dragY < 12) { resetDart(); showToast('Pull the dart down, then release.'); return; }
      pulling = false; scene.classList.remove('aiming'); state.busy = true;
      playSound('throw');
      let x = dragX, y = dragY;
      const length = Math.hypot(dragX, dragY);
      const pullStrength = Math.min(1, length / 82);
      const launchSpeed = 16 + pullStrength * 10.5;
      let vx = -dragX / length * launchSpeed;
      let vy = -dragY / length * launchSpeed;
      let previousTime = performance.now();
      const fly = now => {
        const dt = Math.min(1.65, Math.max(.45, (now - previousTime) / 16.67));
        previousTime = now;
        const airDrag = Math.pow(.994, dt);
        vx *= airDrag;
        vy = vy * airDrag + .28 * dt;
        x += vx * dt; y += vy * dt;
        const angle = Math.atan2(vx, -vy) * 180 / Math.PI;
        drawDart(x, y, angle);
        const dartRect = dart.getBoundingClientRect();
        const dartX = dartRect.left + dartRect.width / 2;
        const dartY = dartRect.top + 7;
        const hit = [...scene.querySelectorAll('.balloon:not(.popped)')].find(balloon => {
          const rect = balloon.getBoundingClientRect();
          return dartX >= rect.left && dartX <= rect.right && dartY >= rect.top && dartY <= rect.bottom;
        });
        if (hit) {
          burstBalloon(hit, scene);
          playSound('pop');
          cancelAnimationFrame(frame);
          setTimeout(() => {
            const chosen = randomTask();
            if (chosen) setSelected(chosen.id);
            else promptAddTask();
            state.busy = false;
            resetDart();
          }, 250);
          return;
        }
        const sceneRect = scene.getBoundingClientRect();
        if (dartRect.bottom < sceneRect.top || dartRect.top > sceneRect.bottom || dartRect.left > sceneRect.right || dartRect.right < sceneRect.left) {
          state.busy = false; resetDart(); playSound('miss'); showMissImpact(); showToast('So close — pull back and try again!'); return;
        }
        frame = requestAnimationFrame(fly);
      };
      frame = requestAnimationFrame(fly);
    };
    launcher.addEventListener('pointerup', () => { if (pulling) launchDart(); });
    launcher.addEventListener('pointercancel', resetDart);

    const setKeyboardAim = delta => {
      if (state.busy) return;
      keyboardAngle = Math.max(-56, Math.min(56, keyboardAngle + delta));
      dragY = 70;
      dragX = -Math.tan(keyboardAngle * Math.PI / 180) * dragY;
      const length = Math.hypot(dragX, dragY);
      if (length > 82) { dragX = dragX / length * 82; dragY = dragY / length * 82; }
      scene.classList.add('aiming');
      drawDart(dragX, dragY, keyboardAngle);
      aimLine.style.transform = `rotate(${keyboardAngle}deg)`;
      showToast(`Aim ${keyboardAngle === 0 ? 'center' : keyboardAngle < 0 ? `${Math.abs(keyboardAngle)}° left` : `${keyboardAngle}° right`}`);
    };
    scene.querySelectorAll('[data-dart-angle]').forEach(button => button.addEventListener('click', () => setKeyboardAim(Number(button.dataset.dartAngle))));
    $('#fireDart').addEventListener('click', () => { if (dragY < 12) setKeyboardAim(0); launchDart(); });
    launcher.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); setKeyboardAim(-8); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setKeyboardAim(8); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (dragY < 12) setKeyboardAim(0); launchDart(); }
    });
  }

  function renderClaw() {
    const prizeLayout = [
      [2,4,-11,'capsule'],[13,28,7,'star'],[24,2,-5,'block'],[35,30,13,'capsule'],[46,5,-8,'star'],[57,27,5,'block'],[68,2,-14,'capsule'],[79,28,9,'star'],[90,5,-6,'block'],
      [7,58,12,'star'],[18,51,-9,'capsule'],[30,61,6,'block'],[42,50,-13,'capsule'],[54,63,10,'star'],[66,53,-4,'block'],[77,62,14,'capsule'],[87,51,-8,'star'],[95,60,5,'capsule'],
      [1,89,8,'block'],[11,94,-12,'capsule'],[22,86,14,'star'],[33,96,-7,'block'],[45,87,10,'capsule'],[56,96,-14,'star'],[68,88,6,'block'],[79,97,-9,'capsule'],[90,87,12,'star'],[38,71,4,'star'],[61,74,-6,'capsule']
    ];
    els.gameBoard.innerHTML = `<div class="claw-scene" aria-label="Claw machine game">
      <div class="claw-cabinet"><div class="cabinet-back" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="cabinet-ceiling" aria-hidden="true"></div><div class="cabinet-side left" aria-hidden="true"></div><div class="cabinet-side right" aria-hidden="true"></div><div class="cabinet-floor" aria-hidden="true"></div><div class="glass-shine" aria-hidden="true"></div><div class="claw-track"></div><div class="claw" id="claw" style="left:${state.clawX}%"><div class="cable"></div><div class="claw-head"></div><i class="claw-prong left"></i><i class="claw-prong right"></i></div>
      <div class="balls-bin">${prizeLayout.map((item,i) => `<div class="prize-item ${item[3]}" data-prize="${i}" aria-label="Arcade prize" style="--prize-left:${item[0]}%;--prize-bottom:${item[1]}px;--prize-rotation:${item[2]}deg"></div>`).join('')}</div></div>
      <div class="claw-controls"><div class="control-deck">
        <button class="control-button move" data-move="-3" aria-label="Move claw left"><span>◀</span></button>
        <div class="joystick" id="clawJoystick" role="slider" tabindex="0" aria-label="Move claw" aria-orientation="horizontal" aria-valuemin="8" aria-valuemax="92" aria-valuenow="${Math.round(state.clawX)}"><i></i><b></b></div>
        <button class="control-button move" data-move="3" aria-label="Move claw right"><span>▶</span></button>
        <button class="control-button drop" id="dropClaw"><span>DROP</span></button>
      </div></div>
    </div>`;
    els.gameBoard.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => moveClaw(Number(btn.dataset.move))));
    setupPrizeGleam();
    setupClawJoystick();
    $('#dropClaw').addEventListener('click', dropClaw);
  }

  function setupPrizeGleam() {
    const cabinet = els.gameBoard.querySelector('.claw-cabinet');
    if (!cabinet) return;
    const shimmer = () => {
      if (!cabinet.isConnected) return;
      const prizes = [...cabinet.querySelectorAll('.prize-item:not(.grabbed):not(.won)')];
      const prize = prizes[Math.floor(Math.random() * prizes.length)];
      if (prize) {
        prize.classList.add('gleam');
        setTimeout(() => prize.classList.remove('gleam'), 950);
      }
      setTimeout(shimmer, 1500 + Math.random() * 2400);
    };
    setTimeout(shimmer, 700 + Math.random() * 1000);
  }

  function setClawPosition(value) {
    state.clawX = Math.max(8, Math.min(92, value));
    const claw = $('#claw');
    const joystick = $('#clawJoystick');
    if (claw) claw.style.left = `${state.clawX}%`;
    if (joystick) joystick.setAttribute('aria-valuenow', String(Math.round(state.clawX)));
  }

  function moveClaw(amount) {
    if (state.busy) return;
    setClawPosition(state.clawX + amount);
  }

  function setupClawJoystick() {
    const joystick = $('#clawJoystick');
    const cabinet = els.gameBoard.querySelector('.claw-cabinet');
    if (!joystick || !cabinet) return;
    let dragging = false, startPointerX = 0, startClawX = state.clawX;

    const release = event => {
      if (!dragging) return;
      const travel = event.clientX - startPointerX;
      if (event.type === 'pointerup' && Math.abs(travel) < 4) {
        const rect = joystick.getBoundingClientRect();
        moveClaw(event.clientX < rect.left + rect.width / 2 ? -3 : 3);
      }
      dragging = false;
      joystick.classList.remove('engaged');
      joystick.style.setProperty('--joystick-tilt', '0deg');
      joystick.style.setProperty('--joystick-nudge', '0px');
    };

    joystick.addEventListener('pointerdown', event => {
      if (state.busy) return;
      dragging = true;
      startPointerX = event.clientX;
      startClawX = state.clawX;
      joystick.classList.add('engaged');
      joystick.setPointerCapture(event.pointerId);
    });
    joystick.addEventListener('pointermove', event => {
      if (!dragging || state.busy) return;
      const delta = (event.clientX - startPointerX) / cabinet.clientWidth * 100;
      setClawPosition(startClawX + delta);
      joystick.style.setProperty('--joystick-tilt', `${Math.max(-18, Math.min(18, delta * .9))}deg`);
      joystick.style.setProperty('--joystick-nudge', `${Math.max(-5, Math.min(5, delta * .22))}px`);
    });
    joystick.addEventListener('pointerup', release);
    joystick.addEventListener('pointercancel', release);
    joystick.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveClaw(-3); joystick.style.setProperty('--joystick-tilt', '-12deg'); joystick.style.setProperty('--joystick-nudge', '-3px'); }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveClaw(3); joystick.style.setProperty('--joystick-tilt', '12deg'); joystick.style.setProperty('--joystick-nudge', '3px'); }
    });
    joystick.addEventListener('keyup', () => { joystick.style.setProperty('--joystick-tilt', '0deg'); joystick.style.setProperty('--joystick-nudge', '0px'); });
  }

  function dropClaw() {
    if (state.busy) return;
    state.busy = true;
    playSound('grab');
    const claw = $('#claw');
    claw.classList.add('dropping','opening');
    const prizes = [...els.gameBoard.querySelectorAll('[data-prize]')];
    let hit = null;
    let wonTask = null;
    setTimeout(() => {
      claw.classList.remove('opening');
      claw.classList.add('closing');
    }, 610);
    setTimeout(() => {
      const leftProng = claw.querySelector('.claw-prong.left').getBoundingClientRect();
      const rightProng = claw.querySelector('.claw-prong.right').getBoundingClientRect();
      const leftTip = leftProng.right - 4;
      const rightTip = rightProng.left + 4;
      const gripLeft = Math.min(leftTip, rightTip) - 16;
      const gripRight = Math.max(leftTip, rightTip) + 16;
      const tipY = Math.max(leftProng.bottom, rightProng.bottom);
      const gripTop = tipY - 32;
      const gripBottom = tipY + 12;
      const gripCenter = (gripLeft + gripRight) / 2;
      hit = prizes.filter(prize => {
        const r = prize.getBoundingClientRect();
        return r.right >= gripLeft && r.left <= gripRight && r.bottom >= gripTop && r.top <= gripBottom;
      }).sort((a,b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return Math.abs((aRect.left + aRect.width / 2) - gripCenter) - Math.abs((bRect.left + bRect.width / 2) - gripCenter);
      })[0] || null;
      if (hit) {
        const hitRect = hit.getBoundingClientRect();
        hit.style.setProperty('--grab-x', `${gripCenter - (hitRect.left + hitRect.width / 2)}px`);
        hit.style.setProperty('--lift-y', `${-(Math.max(0, $('.claw .cable').getBoundingClientRect().height - 88))}px`);
        hit.classList.add('grabbed');
        if (state.tasks.length && Math.random() < .58) wonTask = randomTask();
      }
    }, 820);
    setTimeout(() => { claw.classList.remove('dropping'); hit?.classList.add('lifting'); }, 980);
    setTimeout(() => {
      if (hit && !wonTask && state.tasks.length) {
        hit.classList.add('slipping');
        playSound('miss');
      }
    }, 1320);
    setTimeout(() => {
      claw.classList.remove('closing','opening','dropping');
      state.busy = false;
      if (hit && !state.tasks.length) {
        hit.classList.remove('grabbed','lifting','slipping');
        playSound('click');
        promptAddTask();
      } else if (hit && wonTask) { hit.classList.add('won'); playSound('win'); setSelected(wonTask.id); }
      else if (hit) { hit.classList.remove('grabbed','lifting','slipping'); showToast('It slipped! Line up and try another drop.'); }
      else { playSound('miss'); showMissImpact(); showToast('No prize — line up over an object and try again!'); }
    }, 2320);
  }

  function renderWheel() {
    const shown = state.tasks.slice(0, 10);
    const step = 360 / shown.length;
    const gradient = shown.map((_, i) => `${colors[i % colors.length]} ${i * step}deg ${(i + 1) * step}deg`).join(',');
    els.gameBoard.innerHTML = `<div class="wheel-scene" aria-label="Prize wheel game">
      <div class="stage-room" aria-hidden="true"><i class="stage-back"></i><i class="stage-ceiling"></i><i class="stage-side left"></i><i class="stage-side right"></i><i class="stage-floor"></i></div>
      <div class="wheel-wrap"><div class="wheel-pointer" id="wheelPointer"></div><div class="wheel" id="wheel" style="background:conic-gradient(${gradient});transform:rotate(${state.wheelRotation}deg)"><div class="wheel-pegs" aria-hidden="true">${Array.from({length:20},(_,i)=>`<i style="--peg:${i*18}deg;--bulb-delay:${(-i*.065).toFixed(3)}s"></i>`).join('')}</div>
        ${shown.map((t,i) => { const a=i*step+step/2, rad=a*Math.PI/180, left=50+29*Math.sin(rad), top=50-29*Math.cos(rad); let rotation=a-90; if(rotation>90) rotation-=180; if(rotation<-90) rotation+=180; return `<span class="wheel-label" style="left:${left}%;top:${top}%;transform:translate(-50%,-50%) rotate(${rotation}deg)">${escapeHtml(t.text)}</span>`; }).join('')}
      </div></div>
      <div class="wheel-panel"><button class="button button-primary spin-button" id="spinWheel">SPIN THE WHEEL</button></div>
    </div>`;
    $('#spinWheel').addEventListener('click', spinWheel);
  }

  function spinWheel() {
    if (state.busy) return;
    state.busy = true;
    const shown = state.tasks.slice(0, 10);
    const chosen = randomTask(shown);
    const index = shown.findIndex(task => task.id === chosen.id);
    const step = 360 / shown.length;
    const selectedCenter = index * step + step / 2;
    const currentAngle = ((state.wheelRotation % 360) + 360) % 360;
    const targetAngle = ((90 - selectedCenter) % 360 + 360) % 360;
    const alignmentTurn = (targetAngle - currentAngle + 360) % 360;
    state.wheelRotation += 1440 + alignmentTurn;
    $('#wheel').style.transform = `rotate(${state.wheelRotation}deg)`;
    const spinDuration = reducedMotion ? 250 : 3200;
    const pointer = $('#wheelPointer');
    let tickFrame = 0;
    if (!reducedMotion) {
      let lastAngle = null;
      let pegTravel = 0;
      const trackPegs = () => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle($('#wheel')).transform);
        const angle = (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360;
        if (lastAngle !== null) {
          const delta = (angle - lastAngle + 360) % 360;
          if (delta < 90) pegTravel += delta;
          if (pegTravel >= 18) {
            pegTravel %= 18;
            pointer.classList.remove('ticking');
            void pointer.offsetWidth;
            pointer.classList.add('ticking');
            playSound('tick');
          }
        }
        lastAngle = angle;
        tickFrame = requestAnimationFrame(trackPegs);
      };
      tickFrame = requestAnimationFrame(trackPegs);
    }
    setTimeout(() => { cancelAnimationFrame(tickFrame); pointer.classList.remove('ticking'); playSound('win'); setSelected(shown[index].id); state.busy = false; }, spinDuration);
  }

  function updateCompletionStats() {
    const today = new Date();
    const todayKey = localDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = localDateKey(yesterday);
    if (state.stats.lastDate !== todayKey) state.stats.streak = state.stats.lastDate === yesterdayKey ? (state.stats.streak || 0) + 1 : 1;
    state.stats.lastDate = todayKey;
    state.stats.total = (state.stats.total || 0) + 1;
    syncDailyStats();
    state.stats.dailyTasks = (state.stats.dailyTasks || 0) + 1;
  }

  function completeTask(id) {
    const index = state.tasks.findIndex(t => t.id === id);
    if (index < 0) return;
    const [task] = state.tasks.splice(index, 1);
    syncDailyStats();
    const earnedPoints = difficultyPoints[task.difficulty] || 1;
    const levelBefore = Math.floor((state.stats.dailyPoints || 0) / 6);
    updateCompletionStats();
    state.stats.dailyPoints = (state.stats.dailyPoints || 0) + earnedPoints;
    const levelAfter = Math.floor((state.stats.dailyPoints || 0) / 6);
    state.completed.unshift({ ...task, completedAt: Date.now() });
    hideResult();
    celebrate();
    playSound(levelAfter > levelBefore ? 'unlock' : 'win');
    showToast(levelAfter > levelBefore ? `Level ${levelAfter + 1}! Recharge Pass unlocked.` : `Mission cleared! +${earnedPoints} Daily Run ${earnedPoints === 1 ? 'point' : 'points'}.`);
    render();
  }

  function celebrate() {
    const confettiCount = Math.min(74, 34 + Math.floor((state.stats.dailyPoints || 0) / 6) * 8);
    for (let i = 0; i < confettiCount; i++) {
      const piece = document.createElement('i');
      piece.className = `confetti confetti-${state.game}`;
      const drift = Math.round((Math.random() - .5) * 260);
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.setProperty('--confetti-color', colors[i % colors.length]);
      piece.style.setProperty('--confetti-size', `${12 + Math.random() * 14}px`);
      piece.style.setProperty('--drift', `${drift}px`);
      piece.style.animationDelay = `${Math.random() * .3}s`;
      piece.style.setProperty('--start-rotation', `${Math.random() * 180}deg`);
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), state.game === 'balloon' ? 2500 : 2100);
    }
  }

  els.taskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.taskInput.value.trim();
    if (!text) return;
    state.tasks.push({ id: crypto.randomUUID(), text, difficulty: els.difficultyInput.value });
    els.taskInput.value = '';
    els.difficultyInput.value = '';
    render();
    playSound('add');
    showToast('Task added to every game.');
    els.taskInput.focus();
  });

  document.querySelectorAll('.game-tab').forEach(tab => tab.addEventListener('click', () => {
    if (state.busy) return;
    state.game = tab.dataset.game;
    playSound('click');
    hideResult();
    render();
  }));

  els.taskList.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.closest('.task-item').dataset.id;
    const task = state.tasks.find(t => t.id === id);
    if (button.dataset.action === 'complete') completeTask(id);
    if (button.dataset.action === 'delete') { state.tasks = state.tasks.filter(t => t.id !== id); render(); showToast('Task removed.'); }
    if (button.dataset.action === 'edit') {
      const next = prompt('Edit task', task.text);
      if (next?.trim()) { task.text = next.trim().slice(0, 90); render(); showToast('Task updated.'); }
    }
  });

  els.completedList.addEventListener('click', event => {
    const button = event.target.closest('[data-restore]');
    if (!button) return;
    const index = state.completed.findIndex(t => t.id === button.dataset.restore);
    const [task] = state.completed.splice(index, 1);
    state.tasks.push({ id: task.id, text: task.text, difficulty: task.difficulty });
    render(); showToast('Task restored to the arcade.');
  });

  $('#completeBtn').addEventListener('click', () => state.selectedId && completeTask(state.selectedId));
  $('#rerollBtn').addEventListener('click', () => { hideResult(); renderGame(); showToast('Ready for another pick!'); });
  els.closeResult.addEventListener('click', hideResult);
  els.resultCard.addEventListener('click', event => { if (event.target === els.resultCard) hideResult(); });
  $('#clearTasksBtn').addEventListener('click', () => {
    if (!state.tasks.length || !confirm('Remove every active task?')) return;
    state.tasks = []; hideResult(); render(); showToast('Active tasks cleared.');
  });
  $('#clearCompletedBtn').addEventListener('click', () => {
    if (!state.completed.length || !confirm('Clear the victory shelf?')) return;
    state.completed = []; render(); showToast('Completed tasks cleared.');
  });
  els.soundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    save();
    render();
    if (state.soundEnabled) playSound('add');
    showToast(state.soundEnabled ? 'Game sounds on.' : 'Game sounds muted.');
  });

  els.rewardStrip.addEventListener('click', event => {
    if (event.target.closest('[data-claim-break]')) openBreakTimer();
  });
  els.endBreakBtn.addEventListener('click', endBreakEarly);

  els.helpButton.addEventListener('click', () => { playSound('click'); openGuide(); });
  els.closeGuide.addEventListener('click', closeGuide);
  els.dismissGuide.addEventListener('click', () => { playSound('click'); closeGuide(); });
  els.siteGuide.addEventListener('click', event => { if (event.target === els.siteGuide) closeGuide(); });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !els.siteGuide.classList.contains('hidden')) { closeGuide(); return; }
    if (event.key === 'Escape' && !els.resultCard.classList.contains('hidden')) { hideResult(); return; }
    if (state.game === 'claw' && !['INPUT','SELECT'].includes(document.activeElement.tagName)) {
      if (event.target.closest?.('.game-tab, .result-card, .task-zone, button')) return;
      if (event.key === 'ArrowLeft') moveClaw(-3);
      if (event.key === 'ArrowRight') moveClaw(3);
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); dropClaw(); }
    }
  });

  function registerWebMCP() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const tools = [
      { name: 'list_tasks', title: 'List arcade tasks', description: 'List active and completed Taskcade tasks.', inputSchema: { type:'object', properties:{}, additionalProperties:false }, annotations: { readOnlyHint:true, untrustedContentHint:true }, execute: () => ({ active: state.tasks, completed: state.completed }) },
      { name: 'add_task', title: 'Add an arcade task', description: 'Add a task with a difficulty to the Taskcade arcade.', inputSchema: { type:'object', properties:{ text:{type:'string',minLength:1,maxLength:90}, difficulty:{type:'string',enum:['easy','medium','hard']} }, required:['text','difficulty'], additionalProperties:false }, annotations: { readOnlyHint:false, untrustedContentHint:true }, execute: ({text,difficulty}) => { const clean=String(text).trim(); if(!clean || !['easy','medium','hard'].includes(difficulty)) throw new Error('Invalid task'); const task={id:crypto.randomUUID(),text:clean.slice(0,90),difficulty}; state.tasks.push(task); render(); return task; } },
      { name: 'complete_task', title: 'Complete an arcade task', description: 'Mark one active Taskcade task complete by its id.', inputSchema: { type:'object', properties:{ id:{type:'string'} }, required:['id'], additionalProperties:false }, annotations: { readOnlyHint:false, untrustedContentHint:false }, execute: ({id}) => { const task=state.tasks.find(t=>t.id===id); if(!task) throw new Error('Task not found'); completeTask(id); return {id,status:'completed'}; } }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch {} });
  }

  render();
  if (state.stats.breakEndsAt > Date.now()) openBreakTimer();
  if (!state.guideSeen) openGuide();
  registerWebMCP();
})();
