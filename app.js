// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBq_WwYY5u1Wql_CWSRsk-ojFfv6c7RAgA',
  authDomain:        'polymocktrial-77905.firebaseapp.com',
  projectId:         'polymocktrial-77905',
  storageBucket:     'polymocktrial-77905.firebasestorage.app',
  messagingSenderId: '805880145342',
  appId:             '1:805880145342:web:0f2eade31f2d221fef45ef',
};

const APP_PASSWORD = 'signsofashovel'; // shared team password

// ═══════════════════════════════════════════════════════════════
//  FIREBASE
// ═══════════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// ── In-memory data cache ──────────────────────────────────────
// Populated once on startup; all reads are synchronous via cache.
// Writes update cache immediately and sync to Firestore async.
const cache = {}; // { [cardId]: { content?, title?, tags? } }

async function loadAllData() {
  const snap = await db.collection('cards').get();
  snap.forEach(d => { cache[d.id] = d.data(); });
}

function saveField(cardId, field, value) {
  if (!cache[cardId]) cache[cardId] = {};
  cache[cardId][field] = value;
  db.collection('cards').doc(cardId)
    .set({ [field]: value }, { merge: true })
    .catch(err => console.error('Firestore write failed:', err));
}

// ═══════════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');
  });
});

// ═══════════════════════════════════════════════════════════════
//  ACCORDION
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.accordion-header').forEach(header => {
  header.addEventListener('click', () => {
    const block = header.closest('.accordion-block');
    const body  = block.querySelector('.accordion-body');
    const arrow = header.querySelector('.accordion-arrow');
    const isOpen = block.classList.contains('open');
    if (isOpen) {
      block.classList.remove('open');
      body.style.display = 'none';
      arrow.textContent = '▼';
    } else {
      block.classList.add('open');
      body.style.display = 'block';
      arrow.textContent = '▲';
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  FOOTER
// ═══════════════════════════════════════════════════════════════
document.getElementById('footer-year').textContent = new Date().getFullYear();

// ═══════════════════════════════════════════════════════════════
//  QUILL
// ═══════════════════════════════════════════════════════════════
const quill = new Quill('#quill-editor', {
  theme: 'snow',
  placeholder: 'Start typing your document here…',
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      ['clean']
    ]
  }
});

// ═══════════════════════════════════════════════════════════════
//  STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════
function getCardKey(card) {
  return card.dataset.cardId;
}

function hasContent(cardId) {
  const saved = cache[cardId]?.content;
  if (!saved) return false;
  try {
    const delta = JSON.parse(saved);
    return delta.ops && delta.ops.some(op => op.insert && op.insert.trim && op.insert.trim() !== '');
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
//  CARD INITIALISATION
// ═══════════════════════════════════════════════════════════════
const TAG_DEFS = [
  { name: 'Prosecution', cls: 'tag-toggle--prosecution', tagCls: 'tag--green'  },
  { name: 'Defense',     cls: 'tag-toggle--defense',     tagCls: 'tag--purple' },
  { name: 'Reference',   cls: 'tag-toggle--reference',   tagCls: 'tag--orange' },
];

function setupCard(card, cardId) {
  card.dataset.cardId = cardId;

  const titleEl    = card.querySelector('.card-title');
  const savedTitle = cache[cardId]?.title;
  if (savedTitle) titleEl.textContent = savedTitle;

  buildTitleEdit(card, titleEl);
  buildCardTagDisplay(card, cardId);
  card.addEventListener('click', () => openEditor(card));
}

function initCards() {
  document.querySelectorAll('.card').forEach(card => {
    const origTitle = card.querySelector('.card-title').textContent.trim();
    const accordion = card.closest('.accordion-block');
    let cardId;
    if (accordion) {
      const season = accordion.querySelector('.accordion-title').textContent.trim().replace(/\s+/g, ' ');
      cardId = 'mt::past::' + season + '::' + origTitle;
    } else {
      cardId = 'mt::current::' + origTitle;
    }
    setupCard(card, cardId);
  });
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOM CARDS
// ═══════════════════════════════════════════════════════════════
function buildCustomCardElement(id) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-icon card-icon--blue">📄</div>
    <div class="card-body">
      <div class="card-title">New Card</div>
      <div class="card-meta">Custom</div>
      <div class="card-tags"></div>
    </div>
  `;
  setupCard(card, id);
  return card;
}

function getGridForCategory(category) {
  const block = document.querySelector(`#tab-current .category-block[data-category="${CSS.escape(category)}"]`);
  return block ? block.querySelector('.card-grid') : null;
}

function initCustomCards() {
  Object.keys(cache).forEach(id => {
    if (!id.startsWith('mt::current::custom::')) return;
    const category = cache[id]?.category;
    const grid = category ? getGridForCategory(category) : null;
    if (grid) grid.appendChild(buildCustomCardElement(id));
  });
}

function addCustomCard(category) {
  const id = 'mt::current::custom::' + Date.now();
  cache[id] = { title: 'New Card', category };
  saveField(id, 'title', 'New Card');
  saveField(id, 'category', category);

  const grid = getGridForCategory(category);
  if (!grid) { console.warn('addCustomCard: no grid found for category:', category); return; }
  const card = buildCustomCardElement(id);
  grid.appendChild(card);
  refreshCardIndicators();
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildTitleEdit(card, titleEl) {
  const wrap = document.createElement('div');
  wrap.className = 'card-title-wrap';
  titleEl.parentNode.insertBefore(wrap, titleEl);
  wrap.appendChild(titleEl);

  const editBtn = document.createElement('button');
  editBtn.className   = 'card-edit-btn';
  editBtn.title       = 'Edit title';
  editBtn.setAttribute('aria-label', 'Edit title');
  editBtn.textContent = '✏';
  wrap.appendChild(editBtn);

  editBtn.addEventListener('click', e => {
    e.stopPropagation();
    startTitleEdit(card, titleEl, editBtn, wrap);
  });
}

function startTitleEdit(card, titleEl, editBtn, wrap) {
  const currentTitle = titleEl.textContent.trim();
  const input = document.createElement('input');
  input.className = 'card-title-input';
  input.value     = currentTitle;
  input.setAttribute('aria-label', 'Card title');

  wrap.replaceChild(input, titleEl);
  editBtn.style.display = 'none';
  input.focus();
  input.select();

  function finish() {
    const newTitle = input.value.trim() || currentTitle;
    titleEl.textContent = newTitle;
    wrap.replaceChild(titleEl, input);
    editBtn.style.display = '';
    saveField(card.dataset.cardId, 'title', newTitle);
  }

  input.addEventListener('blur',    finish);
  input.addEventListener('click',   e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
  });
}

function buildCardTagDisplay(card, cardId) {
  const tagsEl = card.querySelector('.card-tags');
  if (!tagsEl) return;

  // Seed from existing HTML tags
  const htmlActive = new Set();
  tagsEl.querySelectorAll('.tag').forEach(tag => {
    const t = tag.textContent.trim();
    if (t === 'Prosecution' || t === 'Defense' || t === 'Reference') htmlActive.add(t);
  });

  // Override with cached value (already a native array, no JSON.parse needed)
  let activeTags = htmlActive;
  const savedTags = cache[cardId]?.tags;
  if (savedTags !== undefined) activeTags = new Set(savedTags);

  renderCardTags(tagsEl, activeTags);
}

function renderCardTags(tagsEl, activeTags) {
  const colorMap = Object.fromEntries(TAG_DEFS.map(({ name, tagCls }) => [name, tagCls]));
  tagsEl.innerHTML = '';
  activeTags.forEach(name => {
    const span = document.createElement('span');
    span.className   = 'tag ' + (colorMap[name] || 'tag--gray');
    span.textContent = name;
    tagsEl.appendChild(span);
  });
}

// ═══════════════════════════════════════════════════════════════
//  CARD INDICATORS
// ═══════════════════════════════════════════════════════════════
function refreshCardIndicators() {
  document.querySelectorAll('.card').forEach(card => {
    const key = getCardKey(card);
    if (hasContent(key)) {
      card.classList.add('has-content');
    } else {
      card.classList.remove('has-content');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  MODAL TAG ROW
// ═══════════════════════════════════════════════════════════════
function initModalTagRow() {
  const row = document.getElementById('modal-tag-row');
  const label = document.createElement('span');
  label.className   = 'modal-tag-label';
  label.textContent = 'Tags';
  row.appendChild(label);

  TAG_DEFS.forEach(({ name, cls }) => {
    const btn = document.createElement('button');
    btn.className   = 'tag-toggle ' + cls;
    btn.textContent = name;
    btn.dataset.tag = name;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      saveModalTags();
    });
    row.appendChild(btn);
  });
}

function saveModalTags() {
  if (!activeKey) return;
  const active = [...document.querySelectorAll('#modal-tag-row .tag-toggle.active')]
    .map(b => b.dataset.tag);
  saveField(activeKey, 'tags', active); // store as native array

  const card = document.querySelector(`.card[data-card-id="${CSS.escape(activeKey)}"]`);
  if (card) {
    const tagsEl = card.querySelector('.card-tags');
    if (tagsEl) renderCardTags(tagsEl, new Set(active));
  }
}

// ═══════════════════════════════════════════════════════════════
//  MODAL OPEN / CLOSE
// ═══════════════════════════════════════════════════════════════
const modal      = document.getElementById('editor-modal');
const modalTitle = document.getElementById('modal-card-title');
const saveStatus = document.getElementById('modal-save-status');
let   activeKey  = null;
let   saveTimer  = null;

function openEditor(card) {
  activeKey = getCardKey(card);
  modalTitle.textContent = card.querySelector('.card-title').textContent.trim();

  // Sync tag toggles from cache (native array, no JSON.parse)
  const savedTags = cache[activeKey]?.tags;
  let activeTags = new Set();
  if (savedTags !== undefined) {
    activeTags = new Set(savedTags);
  } else {
    card.querySelectorAll('.card-tags .tag').forEach(t => activeTags.add(t.textContent.trim()));
  }
  document.querySelectorAll('#modal-tag-row .tag-toggle').forEach(btn => {
    btn.classList.toggle('active', activeTags.has(btn.dataset.tag));
  });

  // Load editor content from cache (stored as JSON string, needs JSON.parse)
  const saved = cache[activeKey]?.content;
  if (saved) {
    try { quill.setContents(JSON.parse(saved)); }
    catch { quill.setText(''); }
  } else {
    quill.setText('');
  }

  saveStatus.textContent = '';
  saveStatus.classList.remove('visible');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => quill.focus(), 150);
}

function closeEditor() {
  modal.classList.remove('open', 'fullscreen');
  modal.setAttribute('aria-hidden', 'true');
  fsExpandIcon.style.display   = '';
  fsCompressIcon.style.display = 'none';
  activeKey = null;
}

// Close buttons
document.getElementById('modal-close-btn').addEventListener('click', closeEditor);
modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditor(); });

// Fullscreen toggle
const fsBtn          = document.getElementById('modal-fullscreen-btn');
const fsExpandIcon   = document.getElementById('fs-expand-icon');
const fsCompressIcon = document.getElementById('fs-compress-icon');

fsBtn.addEventListener('click', () => {
  const isFullscreen = modal.classList.toggle('fullscreen');
  fsExpandIcon.style.display   = isFullscreen ? 'none' : '';
  fsCompressIcon.style.display = isFullscreen ? ''     : 'none';
  fsBtn.title = isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen';
});

// ═══════════════════════════════════════════════════════════════
//  SAVE
// ═══════════════════════════════════════════════════════════════
function saveContent() {
  if (!activeKey) return;
  saveField(activeKey, 'content', JSON.stringify(quill.getContents()));
  refreshCardIndicators();

  saveStatus.textContent = 'Saved ✓';
  saveStatus.classList.add('visible');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStatus.classList.remove('visible'), 2500);
}

document.getElementById('modal-save-btn').addEventListener('click', saveContent);

// ── Replace w/ Clipboard ──────────────────────────────────────
document.getElementById('modal-paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    quill.setText(text);
    quill.setSelection(quill.getLength(), 0);
  } catch {
    alert('Could not read clipboard. Make sure the page has clipboard permission.');
  }
});

// Ctrl/Cmd + S to save
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && modal.classList.contains('open')) {
    e.preventDefault();
    saveContent();
  }
});

// ═══════════════════════════════════════════════════════════════
//  APP STARTUP
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('#tab-current .btn-add-to-category').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const category = btn.closest('.category-block').dataset.category;
    addCustomCard(category);
  });
});

// ═══════════════════════════════════════════════════════════════
//  APP STARTUP
// ═══════════════════════════════════════════════════════════════
async function startApp() {
  await loadAllData();
  initCards();
  initCustomCards();
  refreshCardIndicators();
  initModalTagRow();
}

function initPasswordGate() {
  const overlay = document.getElementById('pw-overlay');
  const input   = document.getElementById('pw-input');
  const btn     = document.getElementById('pw-btn');
  const err     = document.getElementById('pw-error');

  async function proceed() {
    btn.textContent  = 'Loading…';
    btn.disabled     = true;
    input.disabled   = true;
    err.textContent  = '';
    try {
      await startApp();
      overlay.remove();
    } catch (e) {
      btn.textContent = 'Enter';
      btn.disabled    = false;
      input.disabled  = false;
      err.textContent = 'Could not connect. Check your connection and try again.';
      console.error('startApp failed:', e);
    }
  }

  // Already authenticated this session — skip password, go straight to loading
  if (sessionStorage.getItem('mt::auth') === 'ok') {
    input.style.display = 'none';
    btn.textContent     = 'Loading…';
    btn.disabled        = true;
    proceed();
    return;
  }

  btn.addEventListener('click', async () => {
    if (input.value === APP_PASSWORD) {
      sessionStorage.setItem('mt::auth', 'ok');
      await proceed();
    } else {
      err.textContent = 'Incorrect password.';
      input.value = '';
      input.focus();
    }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
}

initPasswordGate();
