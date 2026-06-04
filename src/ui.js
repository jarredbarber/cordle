(function () {
  'use strict';
  const E = window.CordleEngine;
  const MAX_GUESSES = 6;
  const STATS_KEY = 'cordle-stats';

  const $ = (id) => document.getElementById(id);
  const rgbCss = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

  let state = null;

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || {
        played: 0, won: 0, streak: 0, best: 0,
      };
    } catch (e) {
      return { played: 0, won: 0, streak: 0, best: 0 };
    }
  }

  function saveStats(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function recordResult(won) {
    const s = loadStats();
    s.played += 1;
    if (won) {
      s.won += 1;
      s.streak += 1;
      s.best = Math.max(s.best, s.streak);
    } else {
      s.streak = 0;
    }
    saveStats(s);
  }

  function showStats() {
    const s = loadStats();
    $('st-played').textContent = s.played;
    $('st-winpct').textContent = s.played ? Math.round((s.won / s.played) * 100) : 0;
    $('st-streak').textContent = s.streak;
    $('st-best').textContent = s.best;
    $('stats-dialog').showModal();
  }

  function newPuzzle() {
    const puzzle = E.generatePuzzle(E.PIGMENTS, Math.random);
    state = { puzzle, selected: new Set(), guessesUsed: 0, over: false };
    $('message').textContent = '';
    $('message').className = '';
    $('history').innerHTML = '';
    $('target').style.background = rgbCss(puzzle.target);
    $('hint').textContent = `This mix uses ${puzzle.answerIndices.length} colors.`;
    renderPalette();
    updatePreview();
    updateControls();
  }

  function renderPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    state.puzzle.palette.forEach((pig, i) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (state.selected.has(i) ? ' selected' : '');
      el.style.background = rgbCss(pig.rgb);
      el.innerHTML = `<span class="name">${pig.name}</span>`;
      el.addEventListener('click', () => toggle(i));
      pal.appendChild(el);
    });
  }

  function toggle(i) {
    if (state.over) return;
    if (state.selected.has(i)) state.selected.delete(i);
    else state.selected.add(i);
    renderPalette();
    updatePreview();
    updateControls();
  }

  function updatePreview() {
    const sel = [...state.selected];
    const mix = E.mixSubset(sel.map((i) => state.puzzle.palette[i].rgb));
    if (mix) {
      $('preview').style.background = rgbCss(mix);
      const m = E.matchPercent(mix, state.puzzle.target);
      $('match-live').textContent = `Current mix: ${m}% match`;
    } else {
      $('preview').style.background = 'transparent';
      $('match-live').innerHTML = '&nbsp;';
    }
  }

  function updateControls() {
    $('guesses-left').textContent = `${MAX_GUESSES - state.guessesUsed} guesses left`;
    $('submit').disabled = state.over || state.selected.size === 0;
    $('clear').disabled = state.over || state.selected.size === 0;
  }

  function submitGuess() {
    if (state.over || state.selected.size === 0) return;
    const selected = [...state.selected].sort((a, b) => a - b);
    const r = E.evaluateGuess(
      selected, state.puzzle.answerIndices, state.puzzle.palette, state.puzzle.target
    );
    state.guessesUsed += 1;
    addHistoryRow(r);

    if (r.win) {
      endGame(true);
    } else if (state.guessesUsed >= MAX_GUESSES) {
      endGame(false);
    } else {
      updateControls();
    }
  }

  function addHistoryRow(r) {
    const row = document.createElement('div');
    row.className = 'guess-row';
    const chips = document.createElement('div');
    chips.className = 'guess-chips';
    r.perSwatch.forEach((p) => {
      const c = document.createElement('div');
      c.className = 'chip ' + (p.inAnswer ? 'in' : 'out');
      c.style.background = rgbCss(state.puzzle.palette[p.index].rgb);
      c.title = state.puzzle.palette[p.index].name + (p.inAnswer ? ' ✓' : ' ✗');
      chips.appendChild(c);
    });
    const result = document.createElement('div');
    result.className = 'guess-result';
    result.style.background = rgbCss(r.mixedRgb);
    const match = document.createElement('div');
    match.className = 'guess-match';
    match.textContent = `${r.match}%`;
    row.append(chips, result, match);
    $('history').appendChild(row);
  }

  function endGame(won) {
    state.over = true;
    recordResult(won);
    const msg = $('message');
    if (won) {
      msg.textContent = `Solved in ${state.guessesUsed}/${MAX_GUESSES}!`;
      msg.className = 'win';
    } else {
      const names = state.puzzle.answerIndices
        .map((i) => state.puzzle.palette[i].name).join(' + ');
      msg.textContent = `Out of guesses. Answer: ${names}.`;
      msg.className = 'lose';
      revealAnswer();
    }
    updateControls();
  }

  function revealAnswer() {
    const swatches = $('palette').children;
    state.puzzle.answerIndices.forEach((i) => {
      swatches[i].classList.add('selected');
    });
  }

  $('submit').addEventListener('click', submitGuess);
  $('clear').addEventListener('click', () => {
    if (state.over) return;
    state.selected.clear();
    renderPalette();
    updatePreview();
    updateControls();
  });
  $('new').addEventListener('click', newPuzzle);
  $('stats-btn').addEventListener('click', showStats);

  newPuzzle();
})();
