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

// ═══════════════════════════════════════════════════════════════
//  FIREBASE
// ═══════════════════════════════════════════════════════════════
firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();

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
    if (target === 'activity') loadActivityFeed();
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
//  Q/A AUTO-COLOR  (Directs and Crosses cards)
// ═══════════════════════════════════════════════════════════════
const Q_COLOR = '#1d4ed8'; // blue — question
const A_COLOR = '#b91c1c'; // red  — answer
let qaColorTimer = null;

function applyQAColors() {
  const text  = quill.getText();
  const lines = text.split('\n');
  let offset  = 0;
  lines.forEach(line => {
    const len = line.length;
    if (len > 0) {
      const first = line.trimStart()[0]?.toUpperCase();
      if (first === 'Q') {
        quill.formatText(offset, len, 'color', Q_COLOR, 'api');
      } else if (first === 'A') {
        quill.formatText(offset, len, 'color', A_COLOR, 'api');
      } else {
        quill.formatText(offset, len, 'color', false, 'api');
      }
    }
    offset += len + 1; // +1 for the \n
  });
}

quill.on('text-change', (delta, oldDelta, source) => {
  if (source !== 'api') isDirty = true;

  // -- expansion: typing `-- ` on a blank line auto-inserts Q: or A:
  // based on the preceding line (Q→A, A→Q, default Q).
  if (source === 'user' && activeIsQA) {
    const ops = delta.ops;
    let insertPos = -1;
    if (ops.length === 1 && ops[0].insert === ' ') insertPos = 0;
    else if (ops.length === 2 && ops[0].retain >= 0 && ops[1].insert === ' ') insertPos = ops[0].retain;

    if (insertPos >= 0) {
      const fullText  = quill.getText();
      const lineStart = fullText.lastIndexOf('\n', insertPos - 1) + 1;
      const lineText  = fullText.substring(lineStart, insertPos);

      if (lineText === '--') {
        const prevLineEnd   = lineStart - 1;
        const prevLineStart = prevLineEnd > 0 ? fullText.lastIndexOf('\n', prevLineEnd - 1) + 1 : 0;
        const prevLine      = prevLineEnd > 0 ? fullText.substring(prevLineStart, prevLineEnd) : '';
        const prevFirst     = prevLine.trimStart()[0]?.toUpperCase();
        const prefix        = prevFirst === 'Q' ? 'A' : 'Q';

        const newPos = lineStart + 3;
        quill.deleteText(lineStart, 3, 'api');
        quill.insertText(lineStart, prefix + ': ', 'api');
        clearTimeout(qaColorTimer);
        applyQAColors();
        setTimeout(() => quill.setSelection(newPos, 0), 0);
        return;
      }
    }
  }

  if (source === 'api' || !activeIsQA) return;
  clearTimeout(qaColorTimer);
  qaColorTimer = setTimeout(applyQAColors, 300);
});

// ═══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════
function formatEmail(email) {
  if (!email) return 'Unknown';
  return email.split('@')[0];
}

function formatEditTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
       + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ── "Last edited by" label on cards ───────────────────────────
function updateCardEditedBy(card, email, ts) {
  let el = card.querySelector('.card-edited-by');
  if (!el) {
    el = document.createElement('div');
    el.className = 'card-edited-by';
    const cardBody = card.querySelector('.card-body');
    if (cardBody) cardBody.appendChild(el);
  }
  el.textContent = formatEmail(email) + ' · ' + formatEditTime(ts);
}

function refreshCardEditedBy() {
  document.querySelectorAll('.card').forEach(card => {
    const key  = card.dataset.cardId;
    if (!key) return;
    const by = cache[key]?.lastEditedBy;
    const at = cache[key]?.lastEditedAt;
    if (by) updateCardEditedBy(card, by, at);
  });
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════
function buildActivityEl(d) {
  const el = document.createElement('div');
  el.className = 'activity-entry';
  el.innerHTML =
    `<div class="activity-main">` +
      `<span class="activity-user">${escapeHtml(formatEmail(d.userEmail))}</span>` +
      ` edited ` +
      `<span class="activity-card">${escapeHtml(d.cardTitle)}</span>` +
    `</div>` +
    `<div class="activity-time">${escapeHtml(formatEditTime(d.timestamp))}</div>`;
  return el;
}

async function loadActivityFeed() {
  const container = document.getElementById('activity-feed');
  if (!container) return;
  container.innerHTML = '<p class="activity-empty">Loading…</p>';
  try {
    const snap = await db.collection('activity')
      .orderBy('timestamp', 'desc').limit(50).get();
    if (snap.empty) {
      container.innerHTML = '<p class="activity-empty">No activity yet. Start editing cards!</p>';
      return;
    }
    container.innerHTML = '';
    snap.forEach(doc => container.appendChild(buildActivityEl(doc.data())));
  } catch (err) {
    container.innerHTML = '<p class="activity-empty">Could not load activity.</p>';
    console.error('Activity load failed:', err);
  }
}

function prependActivityEntry(d) {
  const container = document.getElementById('activity-feed');
  if (!container) return;
  if (!document.getElementById('tab-activity')?.classList.contains('active')) return;
  // Remove placeholder text on first real entry
  if (container.querySelector('.activity-empty')) container.innerHTML = '';
  container.insertBefore(buildActivityEl(d), container.firstChild);
  while (container.children.length > 50) container.removeChild(container.lastChild);
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
let   activeKey   = null;
let   activeIsQA  = false;
let   isDirty     = false;
let   saveTimer   = null;

function openEditor(card) {
  activeKey = getCardKey(card);
  const cat = card.closest('.category-block')?.dataset.category;
  activeIsQA = (cat === 'Directs' || cat === 'Crosses')
            || activeKey.includes(' - Direct') || activeKey.includes(' - Cross');
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

  isDirty = false;
  saveStatus.textContent = '';
  saveStatus.classList.remove('visible');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  if (activeIsQA) applyQAColors();
  setTimeout(() => { if (modal.classList.contains('open')) quill.focus(); }, 150);
}

function closeEditor() {
  document.activeElement?.blur();
  modal.classList.remove('open', 'fullscreen');
  modal.setAttribute('aria-hidden', 'true');
  fsExpandIcon.style.display   = '';
  fsCompressIcon.style.display = 'none';
  activeIsQA = false;
  isDirty    = false;
  activeKey  = null;
}

function tryCloseEditor() {
  if (!isDirty) { closeEditor(); return; }
  if (confirm('You have unsaved changes. Close without saving?')) closeEditor();
}

// Close buttons
document.getElementById('modal-close-btn').addEventListener('click', tryCloseEditor);
modal.addEventListener('click', e => { if (e.target === modal) tryCloseEditor(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') tryCloseEditor(); });

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
  isDirty = false;
  const now       = Date.now();
  const userEmail = auth.currentUser?.email || 'unknown';
  const cardTitle = modalTitle.textContent;

  saveField(activeKey, 'content',      JSON.stringify(quill.getContents()));
  saveField(activeKey, 'lastEditedBy', userEmail);
  saveField(activeKey, 'lastEditedAt', now);

  // Log to activity feed
  db.collection('activity').add({ cardId: activeKey, cardTitle, userEmail, timestamp: now })
    .catch(err => console.error('Activity write failed:', err));

  refreshCardIndicators();

  // Update the "last edited by" label on this card
  const card = document.querySelector(`.card[data-card-id="${CSS.escape(activeKey)}"]`);
  if (card) updateCardEditedBy(card, userEmail, now);

  // Prepend to the feed if the Activity tab is open
  prependActivityEntry({ cardTitle, userEmail, timestamp: now });

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
  refreshCardEditedBy();
  initModalTagRow();
}

function getAuthErrorMessage(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Sign in failed. Check your connection and try again.';
  }
}

function initAuthGate() {
  const overlay    = document.getElementById('pw-overlay');
  const emailInput = document.getElementById('pw-email');
  const passInput  = document.getElementById('pw-input');
  const btn        = document.getElementById('pw-btn');
  const err        = document.getElementById('pw-error');
  const signOutBtn = document.getElementById('signout-btn');
  let   appStarted = false;

  async function launchApp() {
    if (appStarted) return;
    appStarted = true;
    emailInput.style.display = 'none';
    passInput.style.display  = 'none';
    btn.textContent = 'Loading…';
    btn.disabled    = true;
    err.textContent = '';
    try {
      await startApp();
      overlay.remove();
      signOutBtn.style.display = '';
    } catch (e) {
      appStarted = false;
      emailInput.style.display = '';
      passInput.style.display  = '';
      btn.textContent = 'Sign In';
      btn.disabled    = false;
      err.textContent = 'Could not connect. Check your connection and try again.';
      console.error('startApp failed:', e);
      auth.signOut();
    }
  }

  auth.onAuthStateChanged(user => { if (user) launchApp(); });

  async function signIn() {
    const email    = emailInput.value.trim();
    const password = passInput.value;
    if (!email || !password) { err.textContent = 'Please enter your email and password.'; return; }
    btn.textContent      = 'Signing in…';
    btn.disabled         = true;
    emailInput.disabled  = true;
    passInput.disabled   = true;
    err.textContent      = '';
    try {
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged fires → launchApp()
    } catch (e) {
      btn.textContent     = 'Sign In';
      btn.disabled        = false;
      emailInput.disabled = false;
      passInput.disabled  = false;
      err.textContent     = getAuthErrorMessage(e.code);
    }
  }

  btn.addEventListener('click', signIn);
  passInput.addEventListener('keydown',  e => { if (e.key === 'Enter') signIn(); });
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });

  signOutBtn.addEventListener('click', async () => {
    if (isDirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    closeEditor();
    await auth.signOut();
    window.location.reload();
  });
}

initAuthGate();
