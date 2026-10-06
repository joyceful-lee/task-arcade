(() => {
  const STORAGE_KEY = 'taskcade-state-v1';
  const starterTaskIdeas = [
    { text: 'Review notes for 20 minutes', difficulty: 'easy' },
    { text: 'Finish one homework problem set', difficulty: 'medium' },
    { text: 'Start the project outline', difficulty: 'hard' },
    { text: 'Pack tomorrow’s school bag', difficulty: 'easy' }
  ];

  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
  const validViews = ['tasks', 'balloon', 'claw', 'wheel'];
  const validGames = ['balloon', 'claw', 'wheel'];
  const savedGame = validGames.includes(saved?.game) ? saved.game : 'balloon';
  const state = {
    tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
    completed: Array.isArray(saved?.completed) ? saved.completed : [],
    game: savedGame,
    view: validViews.includes(saved?.view) ? saved.view : 'tasks',
    selectedId: null,
    clawX: 50,
    wheelRotation: 0,
    busy: false,
    clawDepleted: Array.isArray(saved?.clawDepleted) ? saved.clawDepleted : [],
    recentPicks: Array.isArray(saved?.recentPicks) ? saved.recentPicks : [],
    pickCounts: saved?.pickCounts || {},
    guideSeen: saved?.guideSeen === true,
    setupSeen: saved?.setupSeen === true || saved !== null,
    soundEnabled: saved?.soundEnabled !== false,
    stats: saved?.stats || { total: Array.isArray(saved?.completed) ? saved.completed.length : 0, streak: 0, lastDate: null, dailyBreaksClaimed: 0, breakEndsAt: null }
  };

  const $ = (s) => document.querySelector(s);
  const els = {
    arcadeShell: $('#arcade'), taskZone: $('#tasks'),
    gameStage: $('#gameStage'), gameBoard: $('#gameBoard'), emptyGame: $('#emptyGame'),
    resultCard: $('#resultCard'), resultTask: $('#resultTask'), resultDifficulty: $('#resultDifficulty'),
    taskForm: $('#taskForm'), taskInput: $('#taskInput'), difficultyInput: $('#difficultyInput'),
    taskList: $('#taskList'), completedList: $('#completedList'), taskCount: $('#taskCount'),
    doneCount: $('#doneCount'), readyBadge: $('#readyBadge'), toast: $('#toast'),
    streakCount: $('#streakCount'), soundToggle: $('#soundToggle'), rewardStrip: $('#rewardStrip'),
    siteGuide: $('#siteGuide'), closeGuide: $('#closeGuide'), dismissGuide: $('#dismissGuide'), closeResult: $('#closeResult'),
    breakTimer: $('#breakTimer'), breakCountdown: $('#breakCountdown'), endBreakBtn: $('#endBreakBtn'),
    setupModal: $('#setupModal'), setupTaskForm: $('#setupTaskForm'), setupTaskInput: $('#setupTaskInput'),
    setupDifficultyInput: $('#setupDifficultyInput'), setupTaskList: $('#setupTaskList'),
    setupBadge: $('#setupBadge'), suggestTasksBtn: $('#suggestTasksBtn'), finishSetupBtn: $('#finishSetupBtn'),
    emptyAddTaskBtn: $('#emptyAddTaskBtn')
  };

  const difficultyPoints = { easy: 1, medium: 2, hard: 3 };
  const colors = ['#e83f6f', '#ff8c32', '#10a7a2', '#6f56d9', '#ef5b2a', '#f3bd24', '#168ad2', '#c93996', '#6ebd38', '#ed3f3f'];
  // Balloon Darts sprites are 1:1 PNGs in assets/balloon-darts/, scaled up in CSS by --px.
  // Each balloon color has its own balloon-<name>.png and pop-burst-<name>.png; mid is its main
  // NES palette shade, used for the burst shards.
  const SPRITE_DIR = 'assets/balloon-darts/';
  const balloonColors = [
    { name:'pink', mid:'#e40058' }, { name:'yellow', mid:'#f8b800' }, { name:'green', mid:'#00a800' },
    { name:'blue', mid:'#0078f8' }, { name:'purple', mid:'#6844fc' }
  ];
  const spriteUrl = name => `url('${SPRITE_DIR}${name}.png')`;
  const spriteSizes = {};
  const spriteSize = name => spriteSizes[name] || null;
  const scenePixelSize = width => width < 560 ? 3 : 4;
  // Read each PNG's dimensions so edited sprites can change size without touching CSS.
  ['balloon-pink', 'balloon-string', 'dart', 'pop-burst-pink'].forEach(name => {
    const image = new Image();
    image.onload = () => { spriteSizes[name] = [image.naturalWidth, image.naturalHeight]; applyBalloonDartSprites(); };
    image.src = `${SPRITE_DIR}${name}.png`;
  });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escapeHtml = (text) => String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, completed: state.completed, game: state.game, view: state.view, clawDepleted: state.clawDepleted, recentPicks: state.recentPicks, pickCounts: state.pickCounts, guideSeen: state.guideSeen, setupSeen: state.setupSeen, soundEnabled: state.soundEnabled, stats: state.stats }));
  const getSelected = () => state.tasks.find(t => t.id === state.selectedId);
  let audioContext;
  let breakTimerInterval;
  let lastRewardPoints = null;
  let heldClawPrize = null;

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
        win: [[523,.09,0],[659,.09,.1],[784,.16,.2]], tick: [[920,.025,0]], aim: [[1320,.014,0]], bonk: [[300,.018,0]], unlock: [[660,.08,0],[880,.1,.09],[1100,.16,.18]]
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

  // 8-bit background music: looping chiptunes keyed by game, scheduled ahead with Web Audio.
  // Notes are MIDI numbers in eighth-note steps; null is a rest.
  const musicTracks = {
    balloon: {
      bpm: 138,
      lead: [
        72,76,79,76,84,79,76,79, 77,81,84,81,77,76,74,72, 74,79,83,79,86,83,79,77, 76,74,72,74,76,79,72,null,
        76,81,84,81,76,72,69,72, 77,81,77,74,72,74,77,81, 79,83,86,83,79,77,76,74, 72,null,76,null,79,null,72,null
      ],
      // Chords per bar: C F G C | Am F G C. Bass is root/fifth quarter notes.
      bass: [48,55,48,55, 41,48,41,48, 43,50,43,50, 48,55,48,55, 45,52,45,52, 41,48,41,48, 43,50,43,50, 48,55,48,null]
    },
    claw: {
      bpm: 126,
      lead: [
        69,72,76,72,81,76,72,76, 77,72,69,72,77,81,77,72, 76,79,84,79,76,72,76,79, 79,83,86,83,79,74,71,74,
        81,79,76,79,81,84,81,76, 77,76,72,76,77,81,84,81, 79,77,74,71,74,77,79,83, 81,null,76,null,69,null,null,null
      ],
      // Chords per bar: Am F C G | Am F G Am.
      bass: [45,52,45,52, 41,48,41,48, 48,55,48,55, 43,50,43,50, 45,52,45,52, 41,48,41,48, 43,50,43,50, 45,52,45,null]
    }
  };
  const music = { track: null, timer: 0, step: 0, nextTime: 0, gain: null };
  const midiFrequency = note => 440 * Math.pow(2, (note - 69) / 12);
  function playMusicNote(type, note, time, duration, volume) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = midiFrequency(note);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain).connect(music.gain);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }
  function scheduleMusic() {
    const track = musicTracks[music.track];
    const stepLength = 30 / track.bpm;
    while (music.nextTime < audioContext.currentTime + .15) {
      const lead = track.lead[music.step % track.lead.length];
      if (lead) playMusicNote('square', lead, music.nextTime, stepLength * .85, .022);
      // Bass plays quarter notes: one entry per two lead steps.
      if (music.step % 2 === 0) {
        const bass = track.bass[(music.step / 2) % track.bass.length];
        if (bass) playMusicNote('triangle', bass, music.nextTime, stepLength * 1.7, .07);
      }
      music.step++;
      music.nextTime += stepLength;
    }
  }
  function stopMusic() {
    clearInterval(music.timer);
    if (music.gain) {
      const fade = music.gain;
      fade.gain.setTargetAtTime(0, audioContext.currentTime, .05);
      setTimeout(() => fade.disconnect(), 400);
    }
    music.track = null; music.timer = 0; music.gain = null;
  }
  function updateMusic() {
    const wanted = state.soundEnabled && !document.hidden && state.view !== 'tasks' && musicTracks[state.view] ? state.view : null;
    if (wanted === music.track) { if (wanted && audioContext?.state === 'suspended') audioContext.resume(); return; }
    if (music.track) stopMusic();
    if (!wanted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      // Browsers keep audio suspended until the first click or key press; see the listeners below.
      if (audioContext.state === 'suspended') audioContext.resume();
      music.gain = audioContext.createGain();
      music.gain.connect(audioContext.destination);
      music.track = wanted; music.step = 0; music.nextTime = audioContext.currentTime + .05;
      scheduleMusic();
      music.timer = setInterval(scheduleMusic, 40);
    } catch {}
  }
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, () => { if (music.track && audioContext?.state === 'suspended') audioContext.resume(); }));
  document.addEventListener('visibilitychange', () => updateMusic());

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

  function render({ preserveGame = false } = {}) {
    syncDailyStats();
    save();
    els.taskCount.textContent = state.tasks.length;
    els.doneCount.textContent = state.completed.length;
    els.streakCount.textContent = state.stats.streak || 0;
    els.readyBadge.textContent = state.tasks.length;
    els.soundToggle.classList.toggle('muted', !state.soundEnabled);
    els.soundToggle.setAttribute('aria-pressed', String(state.soundEnabled));
    els.soundToggle.setAttribute('aria-label', state.soundEnabled ? 'Mute game sounds' : 'Turn on game sounds');
    renderView();
    updateMusic();
    renderRewards();
    renderLists();
    if (!preserveGame && state.view !== 'tasks') renderGame();
    if (!getSelected()) hideResult();
  }

  function setView(view) {
    if (!validViews.includes(view)) return;
    if (view !== 'tasks' && !state.tasks.length) {
      state.view = 'tasks';
      return;
    }
    state.view = view;
    if (view !== 'tasks') state.game = view;
  }

  function renderView() {
    if (state.view !== 'tasks' && !state.tasks.length) state.view = 'tasks';
    const onTasks = state.view === 'tasks';
    const theme = onTasks ? 'tasks' : state.game;
    const gamesLocked = state.tasks.length === 0;
    els.arcadeShell.classList.toggle('hidden', onTasks);
    els.taskZone.classList.toggle('hidden', !onTasks);
    document.body.classList.remove('theme-balloon', 'theme-claw', 'theme-wheel', 'theme-tasks');
    document.body.classList.add(`theme-${theme}`);
    document.querySelectorAll('.section-tab').forEach(tab => {
      const view = tab.dataset.view;
      const isGame = view !== 'tasks';
      const locked = isGame && gamesLocked;
      const active = view === state.view;
      tab.classList.toggle('active', active);
      tab.classList.toggle('locked', locked);
      tab.disabled = locked;
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-disabled', String(locked));
      if (locked) tab.title = 'Add a task first';
      else tab.removeAttribute('title');
    });
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
    const championUnlocked = levelsCleared >= 3;
    document.body.classList.toggle('run-powered', levelsCleared >= 1);
    document.body.classList.toggle('run-champion', championUnlocked);
    els.rewardStrip.innerHTML = `<div class="daily-run-copy"><span>DAILY RUN · LEVEL ${levelsCleared + 1}</span><strong>${dailyPoints} points · ${dailyTasks} ${dailyTasks === 1 ? 'task' : 'tasks'} today</strong><small>${championUnlocked ? 'Daily Champion is active for the rest of today' : `Daily Champion unlocks at 18 points (${18 - dailyPoints} to go)`}</small></div>
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
        <div><div class="task-name">${escapeHtml(task.text)}</div><div class="task-meta"><span class="mini-difficulty ${task.difficulty}">${task.difficulty}</span></div></div>
        <div class="task-actions">
          <button class="icon-button" data-action="edit" title="Edit task" aria-label="Edit ${escapeHtml(task.text)}">✎</button>
          <button class="icon-button" data-action="delete" title="Delete task" aria-label="Delete ${escapeHtml(task.text)}">×</button>
        </div>
      </div>`).join('') : `<div class="empty-list">No tasks yet. Add one above to stock the games.<button type="button" class="button button-primary empty-suggest" data-suggest-tasks>Suggest some tasks</button></div>`;

    els.completedList.innerHTML = state.completed.length ? state.completed.map(task => `
      <div class="task-item">
        <span class="task-check completed-check">✓</span>
        <div><div class="task-name">${escapeHtml(task.text)}</div><div class="task-meta"><span class="mini-difficulty ${task.difficulty}">${task.difficulty}</span></div></div>
        <button class="icon-button" data-restore="${task.id}" title="Restore task" aria-label="Restore ${escapeHtml(task.text)}">↶</button>
      </div>`).join('') : '<div class="empty-list">Finished tasks land here.</div>';

    els.taskList.classList.toggle('is-scrollable', state.tasks.length > 7);
    els.completedList.classList.toggle('is-scrollable', state.completed.length > 7);
    renderSetupList();
  }

  function renderSetupList() {
    els.setupBadge.textContent = state.tasks.length;
    els.finishSetupBtn.disabled = state.tasks.length === 0;
    els.setupTaskList.innerHTML = state.tasks.length ? state.tasks.map(task => `
      <div class="task-item" data-id="${task.id}">
        <span class="task-check" aria-hidden="true"></span>
        <div><div class="task-name">${escapeHtml(task.text)}</div><div class="task-meta"><span class="mini-difficulty ${task.difficulty}">${task.difficulty}</span></div></div>
        <div class="task-actions">
          <button class="icon-button" data-setup-action="delete" title="Delete task" aria-label="Delete ${escapeHtml(task.text)}">×</button>
        </div>
      </div>`).join('') : '<div class="empty-list">No tasks yet. Add one above, or suggest some.</div>';
    els.setupTaskList.classList.toggle('is-scrollable', state.tasks.length > 7);
  }

  function openSetup() {
    els.setupModal.classList.remove('hidden');
    els.setupModal.setAttribute('aria-hidden', 'false');
    renderSetupList();
    els.setupTaskInput.focus({ preventScroll: true });
  }

  function closeSetup() {
    state.setupSeen = true;
    save();
    els.setupModal.classList.add('hidden');
    els.setupModal.setAttribute('aria-hidden', 'true');
  }

  function addTask(text, difficulty) {
    const clean = String(text).trim().slice(0, 90);
    if (!clean || !['easy', 'medium', 'hard'].includes(difficulty)) return null;
    const task = { id: crypto.randomUUID(), text: clean, difficulty };
    state.tasks.push(task);
    replenishClawPrizes(3);
    return task;
  }

  function syncDifficultySelect(select) {
    if (!select) return;
    const dropdown = select.closest('[data-difficulty-dropdown]');
    const value = ['easy', 'medium', 'hard'].includes(select.value) ? select.value : 'medium';
    select.value = value;
    if (!dropdown) return;
    const trigger = dropdown.querySelector('.difficulty-trigger');
    const labels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    trigger.textContent = labels[value];
    trigger.classList.remove('difficulty-easy', 'difficulty-medium', 'difficulty-hard');
    trigger.classList.add(`difficulty-${value}`);
    dropdown.querySelectorAll('[role="option"]').forEach(option => {
      option.setAttribute('aria-selected', String(option.dataset.value === value));
    });
  }

  function closeDifficultyMenus(except = null) {
    document.querySelectorAll('[data-difficulty-dropdown]').forEach(dropdown => {
      if (dropdown === except) return;
      const trigger = dropdown.querySelector('.difficulty-trigger');
      const menu = dropdown.querySelector('.difficulty-menu');
      trigger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    });
  }

  function initDifficultyDropdowns() {
    document.querySelectorAll('[data-difficulty-dropdown]').forEach(dropdown => {
      const trigger = dropdown.querySelector('.difficulty-trigger');
      const menu = dropdown.querySelector('.difficulty-menu');
      const select = dropdown.querySelector('select');
      syncDifficultySelect(select);
      trigger.addEventListener('click', event => {
        event.preventDefault();
        const open = trigger.getAttribute('aria-expanded') === 'true';
        closeDifficultyMenus();
        if (!open) {
          trigger.setAttribute('aria-expanded', 'true');
          menu.hidden = false;
        }
      });
      menu.querySelectorAll('[role="option"]').forEach(option => {
        option.addEventListener('click', () => {
          select.value = option.dataset.value;
          syncDifficultySelect(select);
          closeDifficultyMenus();
          trigger.focus();
        });
      });
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-difficulty-dropdown]')) closeDifficultyMenus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDifficultyMenus();
    });
  }

  function applySuggestedTasks() {
    const added = suggestStarterTasks();
    if (!added) {
      showToast('Suggested tasks are already on your list.');
      return;
    }
    render();
    playSound('add');
    showToast('Suggested tasks added.');
  }

  function suggestStarterTasks() {
    const existing = new Set(state.tasks.map(task => task.text.toLowerCase()));
    let added = 0;
    starterTaskIdeas.forEach(idea => {
      if (existing.has(idea.text.toLowerCase())) return;
      state.tasks.push({ id: crypto.randomUUID(), text: idea.text, difficulty: idea.difficulty });
      added += 1;
    });
    if (added) replenishClawPrizes(3);
    return added;
  }

  function promptAddTask() {
    setView('tasks');
    render();
    els.taskInput.focus({ preventScroll: true });
    showToast('Add a task here to load the arcade.');
  }

  function renderGame() {
    els.gameStage.className = `game-stage ${state.game}-theme`;
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
  }

  // Reusable arcade cabinet: a pixel-art marquee strip (each game's unique element), a
  // bezel-framed screen holding the game's scene, and a control panel.
  function arcadeCabinet({ title, marquee, screen, controls = '', instructions = '' }) {
    return `<div class="arcade-cabinet">
      <header class="cabinet-marquee" style="--marquee-art:${marquee}"><h2 class="visually-hidden">${escapeHtml(title)}</h2></header>
      <div class="cabinet-bezel"><div class="cabinet-screen">${screen}</div></div>
      <div class="cabinet-panel">${controls}${instructions ? `<p class="cabinet-instructions">${escapeHtml(instructions)}</p>` : ''}</div>
    </div>`;
  }

  function renderBalloons() {
    const shown = state.tasks.slice(0, 8);
    const cells = [[0,0],[1,1],[3,0],[2,1],[1,0],[3,1],[0,1],[2,0]];
    const seed = shown.reduce((sum, task) => sum + [...task.id].reduce((n, char) => n + char.charCodeAt(0), 0), 0);
    cells.sort((a,b) => ((a[0]*37+a[1]*19+seed)%97)-((b[0]*37+b[1]*19+seed)%97));
    const decorativeCells = [[0,2],[1,2],[2,2],[3,2],[0.5,0.5],[1.5,1.5],[2.5,0.5],[3.5,1.5]];
    const decorativeBalloons = decorativeCells.map(([column, row], i) => {
      const palette = balloonColors[(i + 2) % balloonColors.length];
      return `<div class="balloon decorative" aria-label="Decorative balloon" data-column="${column}" data-row="${row}" data-palette="${(i + 2) % balloonColors.length}" style="--balloon-mid:${palette.mid};--balloon-sprite:${spriteUrl(`balloon-${palette.name}`)};--drift-x:${(i%2?12:-10)}px;--drift-y:${8+i}px;--drift-back-x:${(i%2?-8:10)}px;--drift-back-y:${-6-i}px"></div>`;
    }).join('');
    els.gameStage.classList.add('has-cabinet');
    const screen = `<div class="balloon-scene" aria-label="Balloon dart game" style="--px:${scenePixelSize(els.gameBoard.clientWidth)}px">
      <canvas class="pixel-backdrop" aria-hidden="true"></canvas>
      ${decorativeBalloons}
      ${shown.map((task, i) => {
        const [column,row] = cells[i];
        const palette = balloonColors[i % balloonColors.length];
        return `<div class="balloon" data-balloon="${task.id}" aria-label="Task balloon" data-column="${column}" data-row="${row}" data-palette="${i % balloonColors.length}" style="--balloon-mid:${palette.mid};--balloon-sprite:${spriteUrl(`balloon-${palette.name}`)}"></div>`;
      }).join('')}
      <div class="wood-footer" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="aim-line" id="aimLine"></div>
      <div class="dart-launcher" id="dartLauncher" role="button" tabindex="0" aria-label="Pull back and release the dart"><div class="dart" id="dart" aria-hidden="true"></div></div>
    </div>`;
    els.gameBoard.innerHTML = arcadeCabinet({
      title: 'Balloon Darts',
      marquee: spriteUrl('marquee'),
      screen,
      controls: `<div class="cabinet-controls dart-key-controls" aria-label="Dart aim controls"><button type="button" class="arcade-button" data-dart-angle="-8" aria-label="Aim dart left">◀</button><button type="button" class="arcade-button fire" id="fireDart">FIRE</button><button type="button" class="arcade-button" data-dart-angle="8" aria-label="Aim dart right">▶</button></div>`,
      instructions: 'Pull back to aim • release to throw'
    });
    applyBalloonDartSprites();
    setupPixelBackdrop();
    setupBalloonMotion();
    setupDartGame();
  }

  function applyBalloonDartSprites() {
    const scene = els.gameBoard.querySelector('.balloon-scene');
    if (!scene) return;
    scene.style.setProperty('--string-sprite', spriteUrl('balloon-string'));
    scene.style.setProperty('--dart-sprite', spriteUrl('dart'));
    // Size each sprite from its PNG so edited assets can change dimensions without touching CSS.
    [['balloon-pink', 'balloon'], ['balloon-string', 'string'], ['dart', 'dart'], ['pop-burst-pink', 'burst']].forEach(([name, prop]) => {
      const size = spriteSize(name);
      if (!size) return;
      scene.style.setProperty(`--${prop}-w`, size[0]);
      scene.style.setProperty(`--${prop}-h`, size[1]);
    });
  }

  function setupPixelBackdrop() {
    const scene = els.gameBoard.querySelector('.balloon-scene');
    const canvas = scene.querySelector('.pixel-backdrop');
    const observer = new ResizeObserver(() => {
      if (!scene.isConnected) return observer.disconnect();
      const px = scenePixelSize(scene.clientWidth);
      const w = Math.ceil(scene.clientWidth / px), h = Math.ceil(scene.clientHeight / px);
      scene.style.setProperty('--px', `${px}px`);
      if (!w || !h || (canvas.width === w && canvas.height === h)) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w * px}px`;
      canvas.style.height = `${h * px}px`;
      paintPixelDesert(canvas.getContext('2d'), w, h);
    });
    observer.observe(scene);
  }

  function paintPixelDesert(ctx, w, h) {
    const rect = (x, y, rw, rh, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh)); };
    const dither = (y, color, offset = 0) => { for (let x = (y + offset) % 2; x < w; x += 2) rect(x, y, 1, 1, color); };
    const horizon = Math.round(h * .66);

    // Sky: flat bands joined by checkerboard dithering instead of gradients.
    const sky = ['#0058f8', '#0078f8', '#3cbcfc', '#f0d0b0', '#f87858', '#fca044', '#f8d878'];
    const bandHeight = horizon / sky.length;
    sky.forEach((color, i) => rect(0, i * bandHeight, w, bandHeight + 1, color));
    for (let i = 1; i < sky.length; i++) {
      const edge = Math.round(i * bandHeight);
      dither(edge - 2, sky[i], 1);
      dither(edge - 1, sky[i]);
      dither(edge, sky[i - 1], 1);
    }

    // Retro sun with scanline gaps across its lower half.
    const sunX = Math.round(w * .78), sunY = Math.round(h * .2), sunR = Math.max(5, Math.round(Math.min(w, h) * .075));
    const disc = (r, color, gaps) => {
      for (let dy = -r; dy <= r; dy++) {
        if (gaps && dy > r * .15 && dy % 3 === 0) continue;
        const span = Math.round(Math.sqrt(r * r - dy * dy));
        rect(sunX - span, sunY + dy, span * 2 + 1, 1, color);
      }
    };
    disc(sunR + 2, '#f8b800', true);
    disc(sunR, '#fce0a8', true);

    const cloud = (x, y, s) => {
      rect(x + s, y - s, s * 3, s, '#fcfcfc');
      rect(x, y, s * 6, s, '#fcfcfc');
      rect(x + s, y + s, s * 5, s, '#f8a4c0');
    };
    cloud(w * .1, h * .14, 2);
    cloud(w * .44, h * .24, 1);
    cloud(w * .6, h * .1, 2);

    // Mesas: steep cliffs that flare into a talus slope, with lit caps and strata.
    const mesa = (x0, x1, top, colors) => {
      const cliffEnd = top + (horizon - top) * .6;
      for (let y = Math.round(top); y < horizon; y++) {
        const flare = y < cliffEnd ? Math.floor((y - top) / 4) : Math.floor((cliffEnd - top) / 4) + (y - cliffEnd);
        const left = x0 - flare, right = x1 + flare;
        const face = y - top < 2 ? colors.cap : (y - top) % 6 === 4 ? colors.strata : colors.face;
        rect(left, y, right - left, 1, face);
        rect(right - (right - left) * .22, y, (right - left) * .22, 1, y - top < 2 ? colors.face : colors.shade);
      }
    };
    const far = { cap:'#fca044', face:'#e45c10', strata:'#f83800', shade:'#a81000' };
    const near = { cap:'#f87858', face:'#a81000', strata:'#881400', shade:'#503000' };
    mesa(w * .1, w * .3, h * .5, far);
    mesa(w * .44, w * .68, h * .46, far);
    mesa(-w * .05, w * .2, h * .4, near);
    mesa(w * .2, w * .3, h * .55, near);
    mesa(w * .82, w * 1.05, h * .37, near);
    mesa(w * .7, w * .82, h * .53, near);

    // Desert floor with a dithered band change and scattered pebbles.
    rect(0, horizon, w, h - horizon, '#e45c10');
    rect(0, horizon, w, 1, '#fca044');
    const lower = Math.round(h * .8);
    rect(0, lower, w, h - lower, '#a81000');
    dither(lower - 1, '#a81000');
    dither(lower, '#e45c10', 1);
    let seed = 7;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < w * (h - horizon) / 60; i++) {
      const x = random() * w, y = horizon + 2 + random() * (h - horizon - 2);
      rect(x, y, 1, 1, '#503000');
      rect(x, y - 1, 1, 1, '#fca044');
    }

    const cactus = (x, base) => {
      rect(x - 1, base, 5, 1, '#503000');
      rect(x, base - 9, 2, 9, '#007800');
      rect(x, base - 9, 1, 9, '#58d854');
      rect(x - 2, base - 5, 2, 1, '#007800');
      rect(x - 2, base - 8, 1, 3, '#007800');
      rect(x + 2, base - 4, 2, 1, '#007800');
      rect(x + 3, base - 7, 1, 3, '#007800');
    };
    cactus(w * .36, h * .77);
    cactus(w * .86, h * .79);
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
      const px = parseFloat(scene.style.getPropertyValue('--px')) || 4;

      movers.forEach(mover => {
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
        // Snap to the pixel grid so sprites move in whole art pixels like an arcade cabinet.
        mover.element.style.transform = `translate3d(${Math.round(mover.x / px) * px}px,${Math.round(mover.y / px) * px}px,0)`;
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
    const palette = balloonColors[balloon.dataset.palette] || balloonColors[0];
    burst.style.setProperty('--burst-color', palette.mid);
    burst.style.setProperty('--burst-sprite', spriteUrl(`pop-burst-${palette.name}`));
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
    let pulling = false, dragX = 0, dragY = 0, frame = 0, keyboardAngle = 0, aimStep = 0;
    // Tick once each time the aim crosses a 4-degree step.
    const tickAim = angle => {
      const step = Math.round(angle / 4);
      if (step !== aimStep) { aimStep = step; playSound('aim'); }
    };
    const drawDart = (x, y, angle = 0) => { dart.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`; };
    const resetDart = () => { cancelAnimationFrame(frame); drawDart(0, 0, 0); scene.classList.remove('aiming'); pulling = false; };

    launcher.addEventListener('pointerdown', event => {
      if (state.busy) return;
      event.preventDefault();
      pulling = true; dragX = 0; dragY = 0; aimStep = 0;
      scene.classList.add('aiming');
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener('pointermove', event => {
      if (!pulling) return;
      event.preventDefault();
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
      tickAim(angle);
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
          state.busy = false; resetDart(); playSound('miss'); showMissImpact(); return;
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
      tickAim(keyboardAngle);
    };
    els.gameBoard.querySelectorAll('[data-dart-angle]').forEach(button => button.addEventListener('click', () => setKeyboardAim(Number(button.dataset.dartAngle))));
    $('#fireDart').addEventListener('click', () => { if (dragY < 12) setKeyboardAim(0); launchDart(); });
    launcher.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); setKeyboardAim(-8); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setKeyboardAim(8); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (dragY < 12) setKeyboardAim(0); launchDart(); }
    });
  }

  // Claw Machine: gachapon balls with 2D circle physics, drawn as 1:1 PNG sprites from
  // assets/claw-machine/ onto a low-res canvas that CSS scales up by --px (one art pixel).
  // All coordinates below are in art pixels; velocities are art pixels per 60fps frame.
  const CLAW_DIR = 'assets/claw-machine/';
  const gachaColors = ['pink', 'yellow', 'green', 'blue', 'purple'];
  const CLAW_BALL_COUNT = 30;
  // Two ball sizes (radius 6 and 9) keep the pile from packing into a regular grid. About 30%
  // of balls are large; which ones is fixed by index so the machine looks the same each visit.
  const BALL_SIZES = { small: 6, large: 9 };
  const makeBall = (index, x, y) => {
    const size = (index * 7 + 3) % 10 < 3 ? 'large' : 'small';
    const color = gachaColors[index % gachaColors.length];
    const r = BALL_SIZES[size];
    return { index, size, r, mass: r * r, x, y, vx: 0, vy: 0, sprite: size === 'large' ? `ball-large-${color}` : `ball-${color}` };
  };
  const clawImages = Object.fromEntries(['claw-open', 'claw-closed', ...gachaColors.flatMap(color => [`ball-${color}`, `ball-large-${color}`])].map(name => {
    const image = new Image();
    image.src = `${CLAW_DIR}${name}.png`;
    return [name, image];
  }));
  const clawPhysics = { gravity: .09, bounce: .35, wallBounce: .4, rollFriction: .985, airDrag: .999, substeps: 4 };
  const clawTiming = { dropSpeed: 1, liftSpeed: .8, moveSpeed: 1.2, closeFrames: 16, openFrames: 12 };
  let clawWorld = null;

  function renderClaw() {
    els.gameStage.classList.add('has-cabinet');
    const screen = `<div class="claw-scene" aria-label="Claw machine game" style="--px:${scenePixelSize(els.gameBoard.clientWidth)}px"><canvas class="claw-canvas" aria-hidden="true"></canvas></div>`;
    els.gameBoard.innerHTML = arcadeCabinet({
      title: 'Claw Machine',
      marquee: `url('${CLAW_DIR}marquee.png')`,
      screen,
      controls: `<div class="cabinet-controls" aria-label="Claw controls">
        <button type="button" class="arcade-button" data-move="-3" aria-label="Move claw left">◀</button>
        <div class="joystick" id="clawJoystick" role="slider" tabindex="0" aria-label="Move claw" aria-orientation="horizontal" aria-valuemin="8" aria-valuemax="92" aria-valuenow="${Math.round(state.clawX)}"><i></i><b></b></div>
        <button type="button" class="arcade-button" data-move="3" aria-label="Move claw right">▶</button>
        <button type="button" class="arcade-button fire" id="dropClaw">DROP</button>
      </div>`,
      instructions: 'Line up the claw • drop to grab a ball'
    });
    els.gameBoard.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => moveClaw(Number(btn.dataset.move))));
    setupClawWorld();
    setupClawJoystick();
    $('#dropClaw').addEventListener('click', dropClaw);
  }

  // Seeded random so the pile settles into the same layout every time the game is shown.
  function seededRandom(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function setupClawWorld() {
    const scene = els.gameBoard.querySelector('.claw-scene');
    const canvas = scene.querySelector('.claw-canvas');
    const observer = new ResizeObserver(() => {
      if (!scene.isConnected) { observer.disconnect(); return; }
      const px = scenePixelSize(scene.clientWidth);
      const w = Math.ceil(scene.clientWidth / px), h = Math.ceil(scene.clientHeight / px);
      if (!w || !h || (clawWorld?.canvas === canvas && clawWorld.w === w && clawWorld.h === h)) return;
      scene.style.setProperty('--px', `${px}px`);
      canvas.width = w; canvas.height = h;
      canvas.style.width = `${w * px}px`; canvas.style.height = `${h * px}px`;
      if (clawWorld?.canvas === canvas && clawWorld.claw.mode !== 'idle') state.busy = false;
      clawWorld = createClawWorld(canvas, w, h);
    });
    observer.observe(scene);
  }

  function createClawWorld(canvas, w, h) {
    const floorY = h - 6, wallL = 3, wallR = w - 3;
    const chuteR = wallL + 22, barrierX = chuteR + 1;
    // The chute wall stands well above the settled pile so balls can't spill into it. The pile
    // height is estimated from the balls' total area spread over the floor (about 80% packing).
    const pileArea = Array.from({ length: CLAW_BALL_COUNT }, (_, i) => Math.PI * makeBall(i).r ** 2).reduce((a, b) => a + b, 0);
    const barrierTop = floorY - Math.max(38, Math.round(pileArea / ((wallR - chuteR) * .8)) + 20);
    const world = {
      canvas, w, h, floorY, wallL, wallR, chuteR, barrierX, barrierTop,
      railY: 6, homeY: 9, chuteX: wallL + 11, minX: chuteR + 11, maxX: wallR - 9,
      balls: [], quiet: true, lastBonk: 0,
      claw: { x: 0, y: 9, mode: 'idle', open: true, held: null, outcome: null, timer: 0, slipAt: 0, slipped: false }
    };
    world.claw.x = clawTargetX(world);
    world.backdrop = paintClawBackdrop(world);
    world.foreground = paintClawForeground(world);
    // Drop the balls in from scattered heights and let them settle into a random-looking heap.
    const random = seededRandom(7);
    for (let i = 0; i < CLAW_BALL_COUNT; i++) {
      if (state.clawDepleted.includes(i) || heldClawPrize?.prizeIndex === i) continue;
      const ball = makeBall(i, 0, floorY - 12 - i * 8 - random() * 6);
      ball.x = chuteR + 3 + ball.r + random() * (wallR - chuteR - 6 - ball.r * 2);
      world.balls.push(ball);
    }
    for (let i = 0; i < 600; i++) stepClawWorld(world);
    world.balls.forEach(ball => { ball.vx = 0; ball.vy = 0; });
    world.quiet = false;
    world.returnBall = index => {
      if (world.balls.some(ball => ball.index === index)) return;
      const ball = makeBall(index, world.minX + Math.random() * (world.maxX - world.minX), -12);
      ball.vx = (Math.random() - .5) * .6;
      world.balls.push(ball);
    };
    let last = performance.now(), pending = 0;
    const loop = now => {
      if (!canvas.isConnected || clawWorld !== world) return;
      pending = Math.min(pending + (now - last) / (1000 / 60), 4);
      last = now;
      while (pending >= 1) { stepClawWorld(world); updateClaw(world); pending -= 1; }
      drawClawWorld(world);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return world;
  }

  const clawTargetX = world => world.minX + (state.clawX - 8) / 84 * (world.maxX - world.minX);

  // Kinematic colliders for the claw: the head plus the inner edge of each prong. While the
  // claw descends and closes only the head collides, so it settles onto the pile instead of
  // parting the balls with its prongs.
  function clawColliders(claw) {
    const head = { x: claw.x, y: claw.y + 2, r: 4 };
    if (claw.mode === 'down' || claw.mode === 'close') return [head];
    const spread = claw.open ? 7 : 6, tip = claw.open ? 4.5 : 3;
    return [
      head,
      { x: claw.x - spread, y: claw.y + 7, r: 1.5 }, { x: claw.x + spread, y: claw.y + 7, r: 1.5 },
      { x: claw.x - tip, y: claw.y + 12, r: 1.5 }, { x: claw.x + tip, y: claw.y + 12, r: 1.5 }
    ];
  }

  function stepClawWorld(world) {
    const { gravity, bounce, wallBounce, rollFriction, airDrag, substeps } = clawPhysics;
    const dt = 1 / substeps;
    const held = world.claw.held;
    const free = world.balls.filter(ball => ball !== held);
    const colliders = clawColliders(world.claw);
    for (let s = 0; s < substeps; s++) {
      free.forEach(ball => {
        ball.vy += gravity * dt;
        ball.vx *= Math.pow(airDrag, dt); ball.vy *= Math.pow(airDrag, dt);
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      });
      // Ball-ball contacts: separate overlapping balls and exchange momentum along the normal,
      // split by mass (area). The held ball moves with the claw, so it acts as infinitely heavy.
      for (let a = 0; a < world.balls.length; a++) {
        for (let b = a + 1; b < world.balls.length; b++) {
          const A = world.balls[a], B = world.balls[b];
          const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy), reach = A.r + B.r;
          if (dist >= reach || dist === 0) continue;
          const nx = dx / dist, ny = dy / dist, overlap = reach - dist;
          const invA = A === held ? 0 : 1 / A.mass, invB = B === held ? 0 : 1 / B.mass;
          const shareA = invA / (invA + invB), shareB = invB / (invA + invB);
          A.x -= nx * overlap * shareA; A.y -= ny * overlap * shareA;
          B.x += nx * overlap * shareB; B.y += ny * overlap * shareB;
          const closing = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
          if (closing >= 0) continue;
          const impulse = -(1 + bounce) * closing / (invA + invB);
          A.vx -= impulse * nx * invA; A.vy -= impulse * ny * invA;
          B.vx += impulse * nx * invB; B.vy += impulse * ny * invB;
          if (-closing > .7) clawBonk(world);
        }
      }
      free.forEach(ball => {
        collideCircle(ball, colliders);
        // Side walls.
        if (ball.x < world.wallL + ball.r) { ball.x = world.wallL + ball.r; ball.vx = Math.abs(ball.vx) * wallBounce; }
        if (ball.x > world.wallR - ball.r) { ball.x = world.wallR - ball.r; ball.vx = -Math.abs(ball.vx) * wallBounce; }
        // The chute wall: a thin vertical capsule from barrierTop down to the floor.
        const nearestY = Math.max(world.barrierTop, Math.min(world.floorY, ball.y));
        const bx = ball.x - world.barrierX, by = ball.y - nearestY, bd = Math.hypot(bx, by);
        if (bd < ball.r + 1 && bd > 0) {
          const nx = bx / bd, ny = by / bd;
          ball.x += nx * (ball.r + 1 - bd); ball.y += ny * (ball.r + 1 - bd);
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) { ball.vx -= (1 + wallBounce) * vn * nx; ball.vy -= (1 + wallBounce) * vn * ny; if (-vn > .7) clawBonk(world); }
        }
        // Floor everywhere except over the chute hole.
        if (ball.x > world.chuteR && ball.y > world.floorY - ball.r) {
          ball.y = world.floorY - ball.r;
          if (ball.vy > .7) clawBonk(world);
          ball.vy = ball.vy > .2 ? -ball.vy * bounce : 0;
          ball.vx *= Math.pow(rollFriction, dt);
        }
      });
    }
    // Balls that fall out through the chute: the delivered prize resolves the win,
    // anything else that tumbles in is dropped back in from the top.
    world.balls.slice().forEach(ball => {
      if (ball.y < world.h + ball.r * 2) return;
      world.balls.splice(world.balls.indexOf(ball), 1);
      if (ball.delivering) deliverClawPrize(world, ball);
      else world.returnBall(ball.index);
    });
  }

  function collideCircle(ball, colliders) {
    colliders.forEach(c => {
      const dx = ball.x - c.x, dy = ball.y - c.y, dist = Math.hypot(dx, dy), min = ball.r + c.r;
      if (dist >= min || dist === 0) return;
      const nx = dx / dist, ny = dy / dist;
      ball.x += nx * (min - dist); ball.y += ny * (min - dist);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= (1 + clawPhysics.bounce) * vn * nx; ball.vy -= (1 + clawPhysics.bounce) * vn * ny; }
    });
  }

  function clawBonk(world) {
    const now = performance.now();
    if (world.quiet || now - world.lastBonk < 90) return;
    world.lastBonk = now;
    playSound('bonk');
  }

  // The claw's state machine: idle → down → close → up → (carry → release over the chute) → idle.
  function updateClaw(world) {
    const claw = world.claw;
    const approach = (from, to, speed) => from + Math.max(-speed, Math.min(speed, to - from));
    if (claw.mode === 'idle') { claw.x = approach(claw.x, clawTargetX(world), clawTiming.moveSpeed); return; }
    if (claw.mode === 'down') {
      claw.y += clawTiming.dropSpeed;
      const touching = world.balls.some(ball => Math.hypot(ball.x - claw.x, ball.y - (claw.y + 2)) <= ball.r + 4.5);
      if (!touching && claw.y + 13 < world.floorY) return;
      // Settled: close the prongs around the ball nearest the claw's center, if any.
      const ball = world.balls
        .filter(b => Math.abs(b.x - claw.x) <= b.r + 1 && b.y >= claw.y + 2 && b.y <= claw.y + 10 + b.r)
        .sort((a, b) => Math.abs(a.x - claw.x) - Math.abs(b.x - claw.x))[0];
      claw.held = ball || null;
      // Big balls are harder to hold onto, like a real claw machine.
      const winChance = ball?.size === 'large' ? .42 : .64;
      claw.outcome = !ball ? null : !state.tasks.length ? 'empty' : Math.random() < winChance ? 'win' : 'slip';
      claw.slipAt = claw.y - 8 - Math.random() * Math.max(4, claw.y - world.homeY - 12);
      claw.slipped = false;
      claw.mode = 'close'; claw.timer = clawTiming.closeFrames; claw.open = false;
      return;
    }
    if (claw.mode === 'close') {
      // The closing prongs pull the ball in to the claw's center over the close frames.
      if (claw.held) {
        const pull = 1 / Math.max(1, claw.timer);
        claw.held.x += (claw.x - claw.held.x) * pull;
        claw.held.y += (claw.y + 3 + claw.held.r - claw.held.y) * pull;
        claw.held.vx = 0; claw.held.vy = 0;
      }
      if (--claw.timer > 0) return;
      if (!claw.held) claw.open = true;
      claw.mode = 'up';
      return;
    }
    if (claw.held) Object.assign(claw.held, { x: claw.x, y: claw.y + 3 + claw.held.r, vx: 0, vy: 0 });
    if (claw.mode === 'up') {
      claw.y = Math.max(world.homeY, claw.y - clawTiming.liftSpeed);
      if (claw.held) claw.held.vy = -clawTiming.liftSpeed;
      if (claw.outcome === 'slip' && claw.held && claw.y <= claw.slipAt) {
        claw.held.vx = (Math.random() - .5) * .8;
        claw.held = null; claw.slipped = true; claw.open = true;
        playSound('miss');
      }
      if (claw.y > world.homeY) return;
      if (claw.held && claw.outcome === 'win') { claw.mode = 'carry'; return; }
      if (claw.held) { claw.held.vx = (Math.random() - .5) * .6; claw.held = null; }
      claw.open = true; claw.mode = 'idle'; state.busy = false;
      if (claw.outcome === 'empty') { playSound('click'); promptAddTask(); }
      else if (claw.slipped) showToast('It slipped! Line up and try another drop.');
      else { playSound('miss'); showMissImpact(); showToast('No prize — line up over a ball and try again!'); }
      return;
    }
    if (claw.mode === 'carry') {
      claw.x = approach(claw.x, world.chuteX, clawTiming.moveSpeed);
      if (claw.x !== world.chuteX) return;
      claw.mode = 'release'; claw.timer = clawTiming.openFrames; claw.open = true;
      claw.held.delivering = true; claw.held = null;
      return;
    }
    if (claw.mode === 'release' && --claw.timer <= 0) claw.mode = 'waiting';
  }

  function deliverClawPrize(world, ball) {
    world.claw.mode = 'idle';
    state.busy = false;
    const task = randomTask();
    if (!task) return world.returnBall(ball.index);
    heldClawPrize = { prizeIndex: ball.index, taskId: task.id };
    playSound('win');
    setSelected(task.id);
  }

  function drawClawWorld(world) {
    const ctx = world.canvas.getContext('2d');
    const draw = (name, x, y) => { const image = clawImages[name]; if (image.complete && image.naturalWidth) ctx.drawImage(image, Math.round(x), Math.round(y)); };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world.backdrop, 0, 0);
    world.balls.forEach(ball => { if (ball !== world.claw.held) draw(ball.sprite, ball.x - ball.r, ball.y - ball.r); });
    const claw = world.claw, cx = Math.round(claw.x), cy = Math.round(claw.y);
    ctx.fillStyle = '#7c7c7c'; ctx.fillRect(cx, world.railY + 1, 1, cy - world.railY - 1);
    ctx.fillStyle = '#bcbcbc'; ctx.fillRect(cx + 1, world.railY + 1, 1, cy - world.railY - 1);
    if (claw.held) draw(claw.held.sprite, claw.held.x - claw.held.r, claw.held.y - claw.held.r);
    draw(claw.open ? 'claw-open' : 'claw-closed', cx - 8, cy);
    ctx.drawImage(world.foreground, 0, 0);
  }

  // Static machine interior in NES colors: back wall, rail, neon trim, floor bed, chute.
  function paintClawBackdrop(world) {
    const { w, h, floorY, wallL, wallR, chuteR, barrierTop, railY } = world;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const rect = (x, y, rw, rh, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, rw, rh); };
    rect(0, 0, w, h, '#0000bc');
    for (let x = wallL + 12; x < wallR; x += 24) rect(x, railY + 2, 1, floorY - railY - 2, '#4428bc');
    // Light spill rising from the floor, dithered into the back wall.
    for (let y = floorY - 30; y < floorY; y++) {
      const level = (y - (floorY - 30)) / 30;
      for (let x = y % 2; x < w; x += 2) if (level > .5 || (x + y) % 4 === 0) rect(x, y, 1, 1, '#4428bc');
    }
    rect(0, 0, w, railY + 2, '#000000');
    rect(0, railY, w, 1, '#bcbcbc'); rect(0, railY + 1, w, 1, '#7c7c7c');
    for (let x = 4; x < w; x += 12) rect(x, railY, 1, 1, '#fcfcfc');
    rect(0, 0, wallL, h, '#000000'); rect(wallR, 0, w - wallR, h, '#000000');
    rect(wallL - 1, railY + 2, 1, h, '#d800cc'); rect(wallR, railY + 2, 1, h, '#3cbcfc');
    // Chute shaft with an arrow pointing into it.
    rect(wallL, barrierTop, chuteR - wallL, h - barrierTop, '#000000');
    const arrowX = world.chuteX, arrowY = barrierTop - 14;
    [[-1, 0, 2, 5], [-4, 5, 8, 1], [-3, 6, 6, 1], [-2, 7, 4, 1], [-1, 8, 2, 1]].forEach(([dx, dy, rw, rh]) => rect(arrowX + dx, arrowY + dy, rw, rh, '#f8b800'));
    rect(chuteR + 2, floorY, w, 1, '#d800cc');
    rect(chuteR + 2, floorY + 1, w, h, '#000000');
    for (let x = chuteR + 4; x < wallR; x += 6) rect(x, floorY + 3, 2, 1, '#4428bc');
    return canvas;
  }

  // Drawn over the balls: the glass chute wall and the prize door the ball drops behind.
  function paintClawForeground(world) {
    const { w, h, floorY, wallL, chuteR, barrierX, barrierTop } = world;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const rect = (x, y, rw, rh, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, rw, rh); };
    rect(barrierX - 1, barrierTop, 3, h - barrierTop, '#3cbcfc');
    rect(barrierX, barrierTop, 1, h - barrierTop, '#a4e4fc');
    rect(barrierX - 1, barrierTop - 1, 3, 1, '#fcfcfc');
    rect(wallL, floorY - 2, chuteR - wallL, h - floorY + 2, '#000000');
    rect(wallL, floorY - 2, chuteR - wallL, 1, '#f8b800');
    for (let x = wallL + 2; x < chuteR - 1; x += 3) rect(x, floorY + 1, 1, 2, '#ac7c00');
    return canvas;
  }

  function replenishClawPrizes(amount = 3) {
    if (!state.clawDepleted.length) return;
    state.clawDepleted.splice(0, Math.min(amount, state.clawDepleted.length));
  }

  // Closing the result without completing the task drops the won ball back into the machine.
  function releaseHeldClawPrize() {
    if (!heldClawPrize) return;
    if (clawWorld?.canvas.isConnected) clawWorld.returnBall(heldClawPrize.prizeIndex);
    heldClawPrize = null;
  }

  function setClawPosition(value) {
    state.clawX = Math.max(8, Math.min(92, value));
    const joystick = $('#clawJoystick');
    if (joystick) joystick.setAttribute('aria-valuenow', String(Math.round(state.clawX)));
  }

  function moveClaw(amount) {
    if (state.busy) return;
    setClawPosition(state.clawX + amount);
  }

  function setupClawJoystick() {
    const joystick = $('#clawJoystick');
    const screen = els.gameBoard.querySelector('.cabinet-screen');
    if (!joystick || !screen) return;
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
      const delta = (event.clientX - startPointerX) / screen.clientWidth * 100;
      setClawPosition(startClawX + delta);
      joystick.style.setProperty('--joystick-tilt', `${Math.max(-18, Math.min(18, delta * .9))}deg`);
      joystick.style.setProperty('--joystick-nudge', `${Math.max(-5, Math.min(5, delta * .22))}px`);
    });
    joystick.addEventListener('pointerup', release);
    joystick.addEventListener('pointercancel', release);
    joystick.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveClaw(-3); joystick.style.setProperty('--joystick-tilt', '-12deg'); joystick.style.setProperty('--joystick-nudge', '-3px'); }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveClaw(3); joystick.style.setProperty('--joystick-tilt', '12deg'); joystick.style.setProperty('--joystick-nudge', '3px'); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dropClaw(); }
    });
    joystick.addEventListener('keyup', () => { joystick.style.setProperty('--joystick-tilt', '0deg'); joystick.style.setProperty('--joystick-nudge', '0px'); });
  }

  function dropClaw() {
    const claw = clawWorld?.claw;
    if (state.busy || !claw || claw.mode !== 'idle') return;
    state.busy = true;
    playSound('grab');
    claw.mode = 'down';
    claw.open = true;
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
    let preserveGame = false;
    // A won gachapon ball already dropped out through the chute; completing its task keeps it out.
    if (heldClawPrize?.taskId === id) {
      if (!state.clawDepleted.includes(heldClawPrize.prizeIndex)) state.clawDepleted.push(heldClawPrize.prizeIndex);
      preserveGame = state.game === 'claw' && !!clawWorld?.canvas.isConnected;
      heldClawPrize = null;
    }
    hideResult();
    celebrate();
    playSound(levelAfter > levelBefore ? 'unlock' : 'win');
    showToast(levelAfter > levelBefore ? `Level ${levelAfter + 1}! Recharge Pass unlocked.` : `Mission cleared! +${earnedPoints} Daily Run ${earnedPoints === 1 ? 'point' : 'points'}.`);
    render({ preserveGame });
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
    if (!text || !addTask(text, els.difficultyInput.value)) return;
    els.taskInput.value = '';
    els.difficultyInput.value = 'medium';
    syncDifficultySelect(els.difficultyInput);
    render();
    playSound('add');
    showToast('Task added to every game.');
    els.taskInput.focus();
  });

  els.setupTaskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.setupTaskInput.value.trim();
    if (!text || !addTask(text, els.setupDifficultyInput.value)) return;
    els.setupTaskInput.value = '';
    els.setupDifficultyInput.value = 'medium';
    syncDifficultySelect(els.setupDifficultyInput);
    render();
    playSound('add');
    els.setupTaskInput.focus();
  });

  els.suggestTasksBtn.addEventListener('click', applySuggestedTasks);

  els.taskList.addEventListener('click', event => {
    if (event.target.closest('[data-suggest-tasks]')) {
      applySuggestedTasks();
      return;
    }
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

  els.finishSetupBtn.addEventListener('click', () => {
    if (!state.tasks.length) return;
    playSound('click');
    closeSetup();
    if (!state.guideSeen) openGuide();
    else showToast('Arcade loaded. Pick a game!');
  });

  els.setupTaskList.addEventListener('click', event => {
    const button = event.target.closest('[data-setup-action]');
    if (!button) return;
    const id = button.closest('.task-item').dataset.id;
    if (button.dataset.setupAction === 'delete') {
      state.tasks = state.tasks.filter(task => task.id !== id);
      render();
    }
  });

  document.querySelectorAll('.section-tab').forEach(tab => tab.addEventListener('click', () => {
    if (state.busy || tab.disabled) return;
    const view = tab.dataset.view;
    if (view === state.view) return;
    if (view !== 'tasks' && !state.tasks.length) {
      showToast('Add a task before choosing a game.');
      return;
    }
    releaseHeldClawPrize();
    setView(view);
    playSound('click');
    hideResult();
    render();
  }));

  els.emptyAddTaskBtn.addEventListener('click', () => {
    playSound('click');
    promptAddTask();
  });

  $('#skipToTasks').addEventListener('click', event => {
    event.preventDefault();
    setView('tasks');
    render();
    els.taskInput.focus({ preventScroll: true });
  });

  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    if (state.busy) return;
    releaseHeldClawPrize();
    setView('tasks');
    hideResult();
    render();
  });

  els.completedList.addEventListener('click', event => {
    const button = event.target.closest('[data-restore]');
    if (!button) return;
    const index = state.completed.findIndex(t => t.id === button.dataset.restore);
    const [task] = state.completed.splice(index, 1);
    state.tasks.push({ id: task.id, text: task.text, difficulty: task.difficulty });
    replenishClawPrizes(3);
    render(); showToast('Task restored to the arcade.');
  });

  $('#completeBtn').addEventListener('click', () => state.selectedId && completeTask(state.selectedId));
  $('#rerollBtn').addEventListener('click', () => { releaseHeldClawPrize(); hideResult(); renderGame(); showToast('Ready for another pick!'); });
  els.closeResult.addEventListener('click', () => { releaseHeldClawPrize(); hideResult(); });
  els.resultCard.addEventListener('click', event => { if (event.target === els.resultCard) { releaseHeldClawPrize(); hideResult(); } });
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

  els.closeGuide.addEventListener('click', closeGuide);
  els.dismissGuide.addEventListener('click', () => { playSound('click'); closeGuide(); });
  els.siteGuide.addEventListener('click', event => { if (event.target === els.siteGuide) closeGuide(); });

  document.addEventListener('keydown', event => {
    if (!els.setupModal.classList.contains('hidden')) {
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && !els.siteGuide.classList.contains('hidden')) { closeGuide(); return; }
    if (event.key === 'Escape' && !els.resultCard.classList.contains('hidden')) { hideResult(); return; }
    if (state.game === 'claw' && !['INPUT','SELECT'].includes(document.activeElement.tagName)) {
      if (event.target.closest?.('.section-tab, .result-card, .task-zone, button')) return;
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
      { name: 'add_task', title: 'Add an arcade task', description: 'Add a task with a difficulty to the Taskcade arcade.', inputSchema: { type:'object', properties:{ text:{type:'string',minLength:1,maxLength:90}, difficulty:{type:'string',enum:['easy','medium','hard']} }, required:['text','difficulty'], additionalProperties:false }, annotations: { readOnlyHint:false, untrustedContentHint:true }, execute: ({text,difficulty}) => { const task=addTask(text,difficulty); if(!task) throw new Error('Invalid task'); render(); return task; } },
      { name: 'complete_task', title: 'Complete an arcade task', description: 'Mark one active Taskcade task complete by its id.', inputSchema: { type:'object', properties:{ id:{type:'string'} }, required:['id'], additionalProperties:false }, annotations: { readOnlyHint:false, untrustedContentHint:false }, execute: ({id}) => { const task=state.tasks.find(t=>t.id===id); if(!task) throw new Error('Task not found'); completeTask(id); return {id,status:'completed'}; } }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch {} });
  }

  render();
  initDifficultyDropdowns();
  if (!state.setupSeen) openSetup();
  else {
    if (state.stats.breakEndsAt > Date.now()) openBreakTimer();
    if (!state.guideSeen) openGuide();
  }
  registerWebMCP();
})();
