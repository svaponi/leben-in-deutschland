const KEY = 'lid-progress-v2';
const $ = id => document.getElementById(id);

// state: { answers: { [number]: chosenIndex }, current: number, autoSpeak: bool }
const state = Object.assign({ answers: {}, current: QUESTIONS[0].number, autoSpeak: false, lang: 'de', states: ['be'] },
  JSON.parse(localStorage.getItem(KEY) || '{}'));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const STATES = {
  bw: 'Baden-Württemberg', by: 'Bayern', be: 'Berlin', bb: 'Brandenburg', hb: 'Bremen', hh: 'Hamburg',
  he: 'Hessen', mv: 'Mecklenburg-Vorpommern', ni: 'Niedersachsen', nw: 'Nordrhein-Westfalen',
  rp: 'Rheinland-Pfalz', sl: 'Saarland', sn: 'Sachsen', st: 'Sachsen-Anhalt',
  sh: 'Schleswig-Holstein', th: 'Thüringen',
};
const UI = {
  de: {
    overview: 'Übersicht', states: 'Bundesländer', all: 'alle', none: 'keine', continue: 'Nächste Frage →', autoSpeak: 'automatisch vorlesen',
    reset: 'Fortschritt zurücksetzen', confirmReset: 'Fortschritt wirklich zurücksetzen?',
    sayAnswer: 'Antwort vorlesen', general: 'Allgemeine Fragen', speechLang: 'de-DE',
    resetWrong: n => `Falsche Fragen zurücksetzen (${n})`,
    stats: (a, n, r) => `${a} / ${n} beantwortet · ${r} richtig`,
    qnum: (q, n) => `Frage ${q} von ${n}`,
  },
  en: {
    overview: 'Overview', states: 'Federal states', all: 'all', none: 'none', continue: 'Next question →', autoSpeak: 'read aloud automatically',
    reset: 'Reset progress', confirmReset: 'Really reset your progress?',
    sayAnswer: 'Read answer aloud', general: 'General questions', speechLang: 'en-US',
    resetWrong: n => `Reset wrong questions (${n})`,
    stats: (a, n, r) => `${a} / ${n} answered · ${r} correct`,
    qnum: (q, n) => `Question ${q} of ${n}`,
  },
};
const ui = () => UI[state.lang] || UI.de;
// localized view of a question: { text, answers }
function view(q) {
  const t = state.lang === 'en' && TRANSLATIONS_EN[q.number];
  return t ? { text: t.q, answers: t.a } : { text: q.question, answers: q.answers };
}
const byNumber = new Map(QUESTIONS.map((q, i) => [q.number, i]));
const idx = () => byNumber.get(state.current) ?? 0;
const isRight = q => state.answers[q.number] === q.correct;
// general questions plus those of the selected Bundesländer
const isActive = q => q.region === 'de' || state.states.includes(q.region);
const activeQuestions = () => QUESTIONS.filter(isActive);
const wrongNumbers = () => activeQuestions().filter(q => q.number in state.answers && !isRight(q)).map(q => q.number);

function neighbour(d) {
  const list = activeQuestions().map(q => byNumber.get(q.number));
  const cur = idx();
  const i = d > 0 ? list.find(i => i > cur) : list.findLast(i => i < cur);
  return i === undefined ? null : QUESTIONS[i].number;
}

// where the "next question" button leads: the next unanswered question (wrapping around),
// or plain next once everything has been answered
function nextTarget() {
  const list = activeQuestions().map(q => q.number);
  const at = list.findIndex(n => byNumber.get(n) > idx());
  const after = at < 0 ? [] : list.slice(at);
  const before = at < 0 ? list : list.slice(0, at);
  const open = [...after, ...before].find(n => !(n in state.answers) && n !== state.current);
  return open ?? neighbour(1);
}

// forget the wrong answers: they become unanswered again and show up in the next-question loop
function resetWrong() {
  wrongNumbers().forEach(n => delete state.answers[n]);
  show(false);
}
function renderResetWrong() {
  const n = wrongNumbers().length;
  $('reset-wrong').hidden = !n;
  $('reset-wrong').textContent = ui().resetWrong(n);
}

// --- speech ---
const norm = l => l.toLowerCase().replace('_', '-');
function voiceFor(lang) {
  if (!('speechSynthesis' in window)) return null;
  const all = speechSynthesis.getVoices().filter(v => norm(v.lang).startsWith(lang.slice(0, 2).toLowerCase()));
  return all.find(v => norm(v.lang) === norm(lang)) || all[0] || null;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = ui().speechLang;
  const v = voiceFor(u.lang); // voices load asynchronously; looked up at speak time
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// --- rendering ---
function renderStats() {
  const active = activeQuestions();
  const answered = active.filter(q => q.number in state.answers).length;
  const right = active.filter(q => q.number in state.answers && isRight(q)).length;
  $('stats').textContent = ui().stats(answered, active.length, right);
  $('bar-fill').style.width = `${(answered / active.length) * 100}%`;
}

function buildStateFilter() {
  const f = $('state-filter');
  const label = document.createElement('span');
  label.dataset.i18n = 'states';
  f.append(label);
  const quick = (key, value) => {
    const b = document.createElement('button');
    b.className = 'link';
    b.dataset.i18n = key;
    b.onclick = () => setStates(value);
    f.append(b);
  };
  quick('all', Object.keys(STATES));
  quick('none', []);
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const [code, name] of Object.entries(STATES)) {
    const l = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.value = code;
    c.onchange = () => setStates(Object.keys(STATES).filter(k =>
      k === code ? c.checked : state.states.includes(k)));
    l.append(c, ' ' + name);
    chips.append(l);
  }
  f.append(chips);
}
function setStates(list) {
  state.states = list;
  save();
  show(false);
}

let gridFor = null;
function renderGrid() {
  if (gridFor !== state.states.join()) { // rebuild when the selected states change
    gridFor = state.states.join();
    $('grid-general').innerHTML = '';
    $('grid-states').innerHTML = '';
    let region = null;
    activeQuestions().forEach(q => {
      if (q.region !== region) {
        region = q.region;
        const h = document.createElement('div');
        h.className = 'grid-heading' + (region === 'de' ? '' : ' state');
        if (region === 'de') h.dataset.i18n = 'general';
        h.textContent = region === 'de' ? ui().general : STATES[region];
        (region === 'de' ? $('grid-general') : $('grid-states')).append(h);
      }
      const b = document.createElement('button');
      b.textContent = q.number;
      b.dataset.n = q.number;
      if (region !== 'de') { b.classList.add('state'); b.title = STATES[region]; }
      b.onclick = () => go(q.number);
      (region === 'de' ? $('grid-general') : $('grid-states')).append(b);
    });
  }
  for (const b of $('grid').querySelectorAll('.grid-items button')) {
    const q = QUESTIONS[byNumber.get(+b.dataset.n)];
    b.classList.toggle('ok', q.number in state.answers && isRight(q));
    b.classList.toggle('bad', q.number in state.answers && !isRight(q));
    b.classList.toggle('cur', q.number === state.current);
  }
  document.querySelectorAll('#state-filter input').forEach(c => { c.checked = state.states.includes(c.value); });
}

function paintAnswers(q) {
  const chosen = state.answers[q.number];
  const done = chosen !== undefined;
  [...$('answers').querySelectorAll('.ans')].forEach((b, j) => {
    b.disabled = done;
    b.classList.toggle('correct', done && j === q.correct);
    b.classList.toggle('wrong', done && j === chosen && j !== q.correct);
  });
  $('continue').hidden = !(done && nextTarget() !== null);
  $('explanation').hidden = !(done && q.explanation);
  $('explanation').textContent = q.explanation || '';
}

function show(userInitiated) {
  const q = QUESTIONS[idx()];
  state.current = q.number;
  save();
  $('qnum').textContent = ui().qnum(q.number, QUESTIONS[QUESTIONS.length - 1].number) +
    (q.region !== 'de' ? ` · ${STATES[q.region]}` : '');
  const v = view(q);
  $('question').textContent = v.text;
  $('image').hidden = !q.image;
  if (q.image) $('image').src = q.image;
  const ul = $('answers');
  ul.innerHTML = '';
  v.answers.forEach((text, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = text;
    b.className = 'ans';
    b.onclick = () => answer(q, i);
    const s = document.createElement('button');
    s.textContent = '🔊';
    s.className = 'say';
    s.title = s.ariaLabel = ui().sayAnswer;
    s.onclick = () => speak(text);
    li.append(b, s);
    ul.append(li);
  });
  paintAnswers(q);
  $('prev').disabled = neighbour(-1) === null;
  $('next').disabled = neighbour(1) === null;
  renderStats();
  renderGrid();
  renderResetWrong();
  if (state.autoSpeak && userInitiated) speak(v.text);
}

function answer(q, i) {
  if (q.number in state.answers) return;
  state.answers[q.number] = i;
  save();
  paintAnswers(q);
  renderStats();
  renderGrid();
  renderResetWrong();
}

function go(n) {
  if (!byNumber.has(n)) return;
  state.current = n;
  show(true);
  window.scrollTo({ top: 0 });
}
const step = d => {
  const n = neighbour(d);
  if (n !== null) go(n);
};

// --- events ---
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('continue').onclick = () => go(nextTarget());
$('toggle-grid').onclick = () => { $('grid').hidden = !$('grid').hidden; };
$('say-question').onclick = () => speak(view(QUESTIONS[idx()]).text);
$('auto-speak').checked = state.autoSpeak;
$('auto-speak').onchange = e => {
  state.autoSpeak = e.target.checked;
  save();
  if (state.autoSpeak) speak(view(QUESTIONS[idx()]).text);
};
$('reset-wrong').onclick = resetWrong;
$('reset').onclick = () => {
  if (!confirm(ui().confirmReset)) return;
  state.answers = {};
  state.current = QUESTIONS[0].number;
  show(true);
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === ' ') { e.preventDefault(); setLang(state.lang === 'de' ? 'en' : 'de'); }
  else if (/^[1-4]$/.test(e.key)) $('answers').children[+e.key - 1]?.firstChild.click();
});

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('#lang button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = ui()[el.dataset.i18n]; });
}
function setLang(lang) {
  state.lang = lang;
  window.speechSynthesis?.cancel();
  applyLang();
  show(false);
}
document.querySelectorAll('#lang button').forEach(b => { b.onclick = () => setLang(b.dataset.lang); });

buildStateFilter();
applyLang();
// a focused button would otherwise be clicked when space is released
document.addEventListener('keyup', e => { if (e.key === ' ' && e.target.tagName !== 'INPUT') e.preventDefault(); });

show(false); // no auto speech on load: browsers block it until the first user interaction
