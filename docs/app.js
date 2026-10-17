const KEY = 'lid-progress-v2';
const $ = id => document.getElementById(id);

// state: { answers: { [number]: chosenIndex }, current: number, autoSpeak: bool }
const state = Object.assign({ answers: {}, current: QUESTIONS[0].number, autoSpeak: false },
  JSON.parse(localStorage.getItem(KEY) || '{}'));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const byNumber = new Map(QUESTIONS.map((q, i) => [q.number, i]));
const idx = () => byNumber.get(state.current) ?? 0;
const isRight = q => state.answers[q.number] === q.correct;

// --- speech ---
let germanVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const de = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('de'));
  germanVoice = de.find(v => v.lang.toLowerCase().replace('_', '-') === 'de-de') || de[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice); // voices load asynchronously
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  if (germanVoice) u.voice = germanVoice;
  speechSynthesis.speak(u);
}

// --- rendering ---
function renderStats() {
  const answered = Object.keys(state.answers).length;
  const right = QUESTIONS.filter(q => q.number in state.answers && isRight(q)).length;
  $('stats').textContent = `${answered} / ${QUESTIONS.length} beantwortet · ${right} richtig`;
  $('bar-fill').style.width = `${(answered / QUESTIONS.length) * 100}%`;
}

function renderGrid() {
  const g = $('grid');
  if (!g.children.length) {
    QUESTIONS.forEach(q => {
      const b = document.createElement('button');
      b.textContent = q.number;
      b.dataset.n = q.number;
      b.onclick = () => go(q.number);
      g.append(b);
    });
  }
  for (const b of g.children) {
    const q = QUESTIONS[byNumber.get(+b.dataset.n)];
    b.className = (q.number in state.answers ? (isRight(q) ? 'ok' : 'bad') : '') +
      (q.number === state.current ? ' cur' : '');
  }
}

function paintAnswers(q) {
  const chosen = state.answers[q.number];
  const done = chosen !== undefined;
  [...$('answers').querySelectorAll('button')].forEach((b, j) => {
    b.disabled = done;
    b.className = '';
    if (done && j === q.correct) b.className = 'correct';
    else if (done && j === chosen) b.className = 'wrong';
  });
  $('explanation').hidden = !(done && q.explanation);
  $('explanation').textContent = q.explanation || '';
}

function show(userInitiated) {
  const q = QUESTIONS[idx()];
  state.current = q.number;
  save();
  $('qnum').textContent = `Frage ${q.number} von ${QUESTIONS[QUESTIONS.length - 1].number}` +
    (q.region === 'be' ? ' · Berlin' : '');
  $('question').textContent = q.question;
  $('image').hidden = !q.image;
  if (q.image) $('image').src = q.image;
  const ul = $('answers');
  ul.innerHTML = '';
  q.answers.forEach((text, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => answer(q, i);
    li.append(b);
    ul.append(li);
  });
  paintAnswers(q);
  $('prev').disabled = idx() === 0;
  $('next').disabled = idx() === QUESTIONS.length - 1;
  renderStats();
  renderGrid();
  if (state.autoSpeak && userInitiated) speak(q.question);
}

function answer(q, i) {
  if (q.number in state.answers) return;
  state.answers[q.number] = i;
  save();
  paintAnswers(q);
  renderStats();
  renderGrid();
}

function go(n) {
  if (!byNumber.has(n)) return;
  state.current = n;
  show(true);
  window.scrollTo({ top: 0 });
}
const step = d => {
  const i = idx() + d;
  if (i >= 0 && i < QUESTIONS.length) go(QUESTIONS[i].number);
};

// --- events ---
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('toggle-grid').onclick = () => { $('grid').hidden = !$('grid').hidden; };
$('speak').onclick = () => speak(QUESTIONS[idx()].question);
$('auto-speak').checked = state.autoSpeak;
$('auto-speak').onchange = e => {
  state.autoSpeak = e.target.checked;
  save();
  if (state.autoSpeak) speak(QUESTIONS[idx()].question);
};
$('reset').onclick = () => {
  if (!confirm('Fortschritt wirklich zurücksetzen?')) return;
  state.answers = {};
  state.current = QUESTIONS[0].number;
  show(true);
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (/^[1-4]$/.test(e.key)) $('answers').children[+e.key - 1]?.firstChild.click();
});

show(false); // no auto speech on load: browsers block it until the first user interaction
