const state = { folders: [], files: [], activeFileId: null, mode: 'learn' };
const $ = s => document.querySelector(s);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toggleLibrary(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#scrim').classList.toggle('open', open);
}

async function refresh() {
  const s = await api('/api/state');
  state.folders = s.folders;
  state.files = s.files;
  renderTree();
  fillFolderSelect();
}

function renderTree() {
  const tree = $('#tree');
  tree.innerHTML = '';

  const chatRow = (file, depth) => {
    const row = el('div', 'chat-item' + (file.id === state.activeFileId ? ' active' : ''), file.name);
    row.style.marginLeft = (depth * 14) + 'px';
    row.onclick = () => { toggleLibrary(false); openFile(file.id); };
    tree.appendChild(row);
  };

  const walk = (parentId, depth) => {
    state.folders.filter(f => (f.parentId || null) === parentId).forEach(folder => {
      const row = el('div', 'folder', folder.name);
      row.style.marginLeft = (depth * 14) + 'px';
      row.onclick = () => { $('#folderSelect').value = folder.id; };
      tree.appendChild(row);
      state.files.filter(f => f.folderId === folder.id).forEach(f => chatRow(f, depth + 1));
      walk(folder.id, depth + 1);
    });
  };
  walk(null, 0);
  state.files.filter(f => !f.folderId).forEach(f => chatRow(f, 0));
}

function fillFolderSelect() {
  const select = $('#folderSelect');
  const current = select.value;
  select.innerHTML = '';
  select.appendChild(new Option('Unsorted', ''));
  state.folders.forEach(f => select.appendChild(new Option(f.name, f.id)));
  select.value = current;
}

function renderWelcome() {
  const thread = $('#thread');
  thread.innerHTML = '';
  const inner = el('div', 'thread-inner');
  const w = el('div', 'welcome');
  w.appendChild(el('div', 'welcome-mark', '✦'));
  w.appendChild(el('h2', null, 'What are we studying today?'));
  w.appendChild(el('p', null, 'Upload a lecture and Medboard turns it into study notes, flashcards, and practice questions, using the lecture\'s own words.'));
  inner.appendChild(w);
  thread.appendChild(inner);
}

async function openFile(id) {
  state.activeFileId = id;
  const file = await api('/api/files/' + id);
  $('#title').textContent = file.name;
  $('#modes').hidden = false;
  renderThread(file);
  renderTree();
  if (file.status === 'processing') {
    setTimeout(() => { if (state.activeFileId === id) openFile(id); }, 2000);
  }
}

function botMessage(content) {
  const msg = el('div', 'msg bot');
  msg.appendChild(el('div', 'avatar', '✦'));
  const body = el('div', 'body');
  body.appendChild(content);
  msg.appendChild(body);
  return msg;
}

function sectionView(s, i) {
  const wrap = el('div', 'section');
  wrap.appendChild(el('div', 'label', `Section ${i + 1}`));

  if (state.mode === 'learn') {
    wrap.appendChild(el('p', 'summary', s.summary));
    s.terms.forEach(t => {
      const row = el('div', 'term');
      row.appendChild(el('strong', null, t.term));
      row.appendChild(el('span', null, t.simple));
      wrap.appendChild(row);
    });
  } else if (state.mode === 'recall') {
    const grid = el('div', 'cards');
    s.flashcards.forEach(c => {
      const box = el('div', 'flash');
      box.tabIndex = 0;
      box.appendChild(el('div', 'front', c.front));
      const back = el('div', 'back', c.back);
      back.hidden = true;
      box.appendChild(back);
      box.onclick = () => { back.hidden = !back.hidden; };
      grid.appendChild(box);
    });
    wrap.appendChild(grid);
  } else {
    s.questions.forEach(q => {
      const block = el('div', 'q');
      block.appendChild(el('p', 'qtext', q.question));
      const answer = el('p', 'ans', q.answer);
      answer.hidden = true;
      const btn = el('button', 'reveal', 'Show answer');
      btn.onclick = () => { answer.hidden = false; btn.remove(); };
      block.appendChild(answer);
      block.appendChild(btn);
      wrap.appendChild(block);
    });
  }
  return wrap;
}

function renderThread(file) {
  const thread = $('#thread');
  thread.innerHTML = '';
  const inner = el('div', 'thread-inner');

  const userMsg = el('div', 'msg user');
  userMsg.appendChild(el('div', 'bubble', '📄 ' + file.name));
  inner.appendChild(userMsg);

  if (file.status === 'error') {
    $('#subtitle').textContent = 'Something went wrong';
    inner.appendChild(botMessage(el('div', 'note', file.error)));
    thread.appendChild(inner);
    return;
  }

  const n = file.sections.length;
  $('#subtitle').textContent = file.status === 'ready'
    ? `${n} section${n === 1 ? '' : 's'} · in the lecture's own wording`
    : `Reading your file… ${n} section${n === 1 ? '' : 's'} ready`;

  if (!n) {
    inner.appendChild(botMessage(el('div', 'note', 'Reading your file…')));
  } else {
    file.sections.forEach((s, i) => inner.appendChild(botMessage(sectionView(s, i))));
  }
  if (file.status === 'processing' && n) {
    inner.appendChild(botMessage(el('div', 'note', 'Working on the next section…')));
  }
  thread.appendChild(inner);
  thread.scrollTop = thread.scrollHeight;
}

document.querySelectorAll('#modes button').forEach(btn => {
  btn.onclick = () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b === btn));
    if (state.activeFileId) openFile(state.activeFileId);
  };
});

$('#menu').onclick = () => toggleLibrary(!$('#sidebar').classList.contains('open'));
$('#scrim').onclick = () => toggleLibrary(false);
$('#plus').onclick = () => $('#fileInput').click();

$('#fileInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  form.append('folderId', $('#folderSelect').value);
  try {
    const res = await api('/api/files', { method: 'POST', body: form });
    await refresh();
    openFile(res.id);
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
};

$('#newFolder').onclick = async () => {
  const name = prompt('Folder name');
  if (!name) return;
  const parentId = $('#folderSelect').value || null;
  try {
    await api('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId })
    });
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

renderWelcome();
refresh();
