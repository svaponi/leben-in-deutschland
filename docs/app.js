const KEY = 'lid-progress-v1';
const $ = id => document.getElementById(id);

// state: { stats: { [number]: { right, wrong, last } }, berlin: bool, current: number|null }
const state = Object.assign({ stats: {}, berlin: false, current: null },
  JSON.parse(localStorage.getItem(KEY) || '{}'));
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const pool = () => QUESTIONS.filter(q => q.region === 'de' || state.berlin);
const mastered = q => state.stats[q.number]?.last === true;

function pickNext() {
  const open = pool().filter(q => !mastered(q));
  if (!open.length) return null;
  // prefer questions never seen, then previously wrong ones
  const fresh = open.filter(q => !state.stats[q.number]);
  const src = fresh.length && Math.random() < 0.7 ? fresh : open;
  const candidates = src.length > 1 ? src.filter(q => q.number !== state.current) : src;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function renderStats() {
  const p = pool();
  const done = p.filter(mastered).length;
  const seen = p.filter(q => state.stats[q.number]).length;
  $('stats').textContent = `${done} / ${p.length} richtig beantwortet · ${seen} gesehen`;
  $('bar-fill').style.width = `${(done / p.length) * 100}%`;
}

function show(q) {
  $('card').hidden = !q;
  $('done').hidden = !!q;
  renderStats();
  if (!q) { state.current = null; save(); return; }
  state.current = q.number;
  save();
  $('qnum').textContent = `Frage ${q.number}`;
  $('question').textContent = q.question;
  $('image').hidden = !q.image;
  if (q.image) $('image').src = q.image;
  $('explanation').hidden = true;
  $('next').hidden = true;
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
}

function answer(q, i) {
  const ok = i === q.correct;
  const s = state.stats[q.number] ||= { right: 0, wrong: 0, last: false };
  s[ok ? 'right' : 'wrong']++;
  s.last = ok;
  save();
  [...$('answers').querySelectorAll('button')].forEach((b, j) => {
    b.disabled = true;
    if (j === q.correct) b.classList.add('correct');
    else if (j === i) b.classList.add('wrong');
  });
  if (q.explanation) {
    $('explanation').textContent = q.explanation;
    $('explanation').hidden = false;
  }
  $('next').hidden = false;
  $('next').focus();
  renderStats();
}

$('next').onclick = () => show(pickNext());
$('berlin').checked = state.berlin;
$('berlin').onchange = e => { state.berlin = e.target.checked; show(pickNext()); };
$('reset').onclick = () => {
  if (!confirm('Fortschritt wirklich zurücksetzen?')) return;
  state.stats = {}; state.current = null; save();
  show(pickNext());
};

// resume the question that was open before reload (if still in pool and unanswered state is lost, that's fine)
const resume = QUESTIONS.find(q => q.number === state.current);
show(resume && pool().includes(resume) && !mastered(resume) ? resume : pickNext());
