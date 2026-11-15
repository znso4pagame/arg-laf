(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const data = window.ZHAOHUI;
  const key = 'zhaohui-story-v1';
  const introKey = 'zhaohui-intro-v1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fresh = () => ({ seen: [], level: 0, original: '', ending: '', name: '', waiting: false, history: [], hintLevels: {}, draft: { name: '', reason: '' }, registrations: [], applications: {}, badgeVisits: 0 });
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let storageAvailable = true;
  function readState(raw) {
    try {
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.seen)) return fresh();
      const next = fresh();
      next.seen = saved.seen.filter(x => typeof x === 'string' && Object.hasOwn(data.clues, x));
      next.level = Math.min(3, Math.max(0, Number(saved.level) || 0));
      next.ending = ['left', 'claimed'].includes(saved.ending) ? saved.ending : '';
      next.name = typeof saved.name === 'string' ? saved.name.slice(0, 30) : '';
      next.original = typeof saved.original === 'string' ? saved.original.slice(0, 80) : '';
      next.waiting = saved.waiting === true;
      next.history = Array.isArray(saved.history) ? saved.history.filter(x => typeof x === 'string').slice(-12) : [];
      if (saved.hintLevels && typeof saved.hintLevels === 'object') {
        for (const [id, level] of Object.entries(saved.hintLevels)) {
          if (Object.hasOwn(data.hints, id) && Number.isInteger(level) && level >= 1 && level <= 3) next.hintLevels[id] = level;
        }
      }
      next.draft = { name: String(saved.draft?.name || '').slice(0, 30), reason: String(saved.draft?.reason || '').slice(0, 300) };
      next.registrations = Array.isArray(saved.registrations) ? saved.registrations.filter(x => x && typeof x.id === 'string' && x.id.startsWith('L') && ['name','place','description','type','date'].every(k => typeof x[k] === 'string')).slice(0, 50) : [];
      if (saved.applications && typeof saved.applications === 'object') for (const [id, value] of Object.entries(saved.applications)) { if (value && typeof value.receipt === 'string') next.applications[id] = { receipt: value.receipt.slice(0,80) }; }
      next.badgeVisits = Math.max(0, Number(saved.badgeVisits) || 0);
      return next;
    } catch { return fresh(); }
  }
  let state;
  try { state = readState(localStorage.getItem(key)); } catch { storageAvailable = false; state = fresh(); }
  let introSeen = false;
  try { introSeen = localStorage.getItem(introKey) === 'read'; } catch { storageAvailable = false; }
  const save = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { storageAvailable = false; } };
  function resolveDeparture() {
    if (state.waiting && !state.ending) { state.ending = 'left'; state.waiting = false; state.draft = fresh().draft; save(); }
  }
  resolveDeparture();
  let requestId = 0, suggestionId = 0, endingId = 0, toastTimer;
  let composing = false, submitting = false, activeQuery = '', openGuide = '', modalTrigger, introTrigger;
  const pendingTimers = new Set();
  function later(callback, delay) {
    const id = setTimeout(() => { pendingTimers.delete(id); callback(); }, reduceMotion.matches ? 0 : delay);
    pendingTimers.add(id);
    return id;
  }
  function cancelPending() {
    requestId++; suggestionId++;
    pendingTimers.forEach(clearTimeout); pendingTimers.clear();
    $('#results').classList.remove('is-loading');
    $('#results').inert = false;
    $('#results').setAttribute('aria-busy', 'false');
    $('#search-form').classList.remove('is-searching');
    $('.search-submit').setAttribute('aria-label', '查找失物');
  }
  function announce(text) { $('#live-status').textContent = text; }
  function toast(text) {
    clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3600);
  }
  function animateResults() {
    const targets = $('#results').querySelectorAll('.item, .record, .empty');
    targets.forEach((node, i) => { node.style.setProperty('--order', Math.min(i, 6)); node.classList.add('result-enter'); });
    $('#results').querySelectorAll('.chat-line').forEach((node, i) => node.style.setProperty('--order', i));
  }
  function showSuggestions(show) {
    $('#suggestions').hidden = !show;
    $('#search').setAttribute('aria-expanded', String(show));
  }
  function suggestionButton(word) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.search = word;
    button.innerHTML = `<span class="suggestion-word">${escape(word)}</span><span aria-hidden="true">↗</span>`;
    return button;
  }
  function suggestions(words, query, delayed = false) {
    const id = ++suggestionId;
    const list = [...new Set([query, ...words])].filter(Boolean);
    $('#suggestions').replaceChildren();
    if (!list.length) { showSuggestions(false); return; }
    showSuggestions(true);
    list.forEach((word, i) => {
      const append = () => { if (id !== suggestionId) return; const button = suggestionButton(word); $('#suggestions').append(button); };
      if (delayed && i) later(append, 280 + i * 230); else append();
    });
    if (delayed && words.length) later(() => { if (id === suggestionId) announce('搜索建议已更新。'); }, 400 + list.length * 230);
  }
  function allItems() { return [...state.registrations, ...data.items]; }
  function normalize(query) {
    let term = query.normalize('NFKC').replace(/[？?！!。]+$/u, '').trim().replace(/\s+/g, ' ');
    const canonical = Object.keys(data.clues).concat(Object.keys(data.aliases)).find(x => x.toLowerCase() === term.toLowerCase());
    term = canonical || term;
    return Object.hasOwn(data.aliases, term) ? data.aliases[term] : term;
  }
  const ordinaryOnly = /^(你好|你好吗|嗨|谢谢|对不起|天气|今天|明天|钱|工资|系统|网站|算法|救我|谁在找我|你是谁家的|你是谁歌词)$/;
  const icon = (type) => {
    const paths = {
      wallet: '<rect x="13" y="18" width="74" height="48" rx="5" fill="#9d9077" stroke="none"/><path d="M17 23h65M17 59h65" stroke="#bbad91" stroke-dasharray="2 3"/><path d="M70 35h20v17H70a8 8 0 010-17" fill="#8b7b62" stroke="none"/><circle cx="76" cy="43" r="2" fill="#c7b594" stroke="none"/>',
      keys: '<circle cx="41" cy="21" r="14" stroke="#b2b096"/><path d="M31 31L16 61l8 4 4-8 5 3 5-8-5-3 5-10M48 33l13 30 9-3-3-8 7-2-3-8-8 3-6-15" stroke="#a1a18b" stroke-width="7"/><circle cx="42" cy="20" r="9" stroke="#d1cfba"/>',
      earbuds: '<rect x="16" y="27" width="69" height="42" rx="15" fill="#fafbf4" stroke="#d0d6cb"/><path d="M18 40h65" stroke="#d7dccf"/><circle cx="51" cy="56" r="1.5" fill="#b2bba5"/><path d="M30 23v-9q0-6 8-6t8 6v9M58 23v-9q0-6 8-6t8 6v9" stroke="#fdfdf7" stroke-width="9"/>',
      card: '<path d="M43 19Q22-14 26 14l17 24M59 19Q80-14 75 14L59 38" stroke="#9ba9a6" stroke-width="5"/><rect x="24" y="23" width="55" height="49" rx="3" fill="#a7bbb9" stroke="none"/><path d="M24 35h55" stroke="#e2e8df" stroke-width="5"/><rect x="31" y="45" width="13" height="16" fill="#dfe6dc" stroke="none"/><path d="M50 47h20M50 53h15M50 59h20" stroke="#dfe6dc" stroke-width="2"/>',
      badge: '<path d="M41 19L30 0M59 19L70 0" stroke-width="5"/><rect x="24" y="17" width="53" height="59" rx="2" fill="#d2d8c9"/><rect x="43" y="22" width="15" height="4" fill="#969e8b" stroke="none"/><text x="50" y="52" text-anchor="middle" font-family="monospace" font-size="15" fill="#69775e" stroke="none">0001</text><path d="M35 62h29"/>'
    };
    return `<svg class="item-icon" viewBox="0 0 100 85" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${paths[type] || paths.badge}</svg>`;
  };
  function renderCard(item, anomaly = false) {
    const pending = Object.hasOwn(state.applications, item.id);
    return `<button class="item ${anomaly ? 'anomaly' : ''}" data-item="${escape(item.id)}"><span class="item-image"><span class="item-code">ZH / ${escape(item.id)}</span>${icon(item.icon)}<span class="item-view">查看登记 ↗</span></span><span class="item-body"><span class="item-title"><strong>${escape(item.name)}</strong><span class="badge">${pending ? '审核中' : anomaly && !state.ending ? '信息不全' : '待认领'}</span></span><span class="item-description">${escape(item.description)}</span><span class="item-meta"><span>⌖ ${escape(item.place)}</span><time>${escape(item.date)}</time></span></span></button>`;
  }
  function board(items = allItems(), anomalous = false) {
    let cards = items.map(item => renderCard(item)).join('');
    if (anomalous) cards += renderCard({ id: '0001', name: '未分类物品', description: '帮帮我。', place: '地点信息缺失', date: '2019-06-11', icon: 'badge' }, true);
    if (state.ending === 'claimed') cards = renderCard({ id: '0001', name: state.name, description: '岗位：客服。等待下一位认领人。', place: 'B3 · 员工通道', date: '2024-03-14', icon: 'badge' }, true) + cards;
    $('#results').innerHTML = `<div class="items">${cards}</div>`;
  }
  function record(title, fields, note, action = '') {
    $('#results').innerHTML = `<article class="record"><div class="record-header"><span>ZHAOHUI / INTERNAL ARCHIVE</span><span>记录留存 · 只读</span></div><h3>${escape(title)}</h3><dl>${fields.map(([k,v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl><p class="record-note">${escape(note)}</p>${action}</article>`;
  }
  function errorPage(blocked = false) {
    $('#results').innerHTML = `<div class="empty"><span class="error-number">404</span><h3>未找到对应记录</h3><p>${blocked ? '当前索引中没有可供访问的信息。' : '该信息可能已被移交、归档，或从未存在。'}<br>请检查关键词，或尝试其他搜索建议。</p></div>`;
  }
  function renderPage(page) {
    const next = (word, text) => `<button class="record-action" data-search="${word}">${text} ↗</button>`;
    switch (page) {
      case 'badge': record('工牌 / 0001', [['物品编号','0001'],['物品描述','客服工牌，姓名栏已磨损。'],['拾获地点','找回网总部，B3 层，员工通道尽头'],['拾获时间',state.badgeVisits++ % 2 ? '2019-06-11' : '2024-03-14'],['当前状态','待认领']], '背面有一行字：请勿将工牌带离工作区域。', next('入职记录','查询关联记录')); break;
      case 'employee1': record('员工记录 / 0001', [['姓名','小鹿'],['入职时间','2024-03-14'],['岗位','远程客服'],['当前状态','未归档'],['身份信息','未检索到有效身份']], '此记录与招聘日期不一致。系统时间校验已停用。', next('0002','查看上一条记录')); break;
      case 'employee2': case 'employee3': { const n = page === 'employee2' ? '0002' : '0003'; record(`归档员工记录 / ${n}`, [['姓名',n === '0002' ? 'Danny' : '信息缺失'],['入职时间','2019-06-11'],['当前状态','已归档'],['认领人编号',n === '0002' ? '0003' : '0004']], '该员工已被认领。原岗位职责已转移至认领人。', next(n === '0002' ? '0003' : '你懂了吗','继续查询')); break; }
      case 'category': record('分类指南 / 类别 E', [['分类名称','E — 以上皆不符合'],['启用时间','1974-11-03'],['公开状态','不对外公开'],['适用案件','Elias Rook / 5003']], '无法确定其属于人或物品时，请勿自行更改分类。建议移交失物招领处处理。', next('Elias Rook','调阅 5003 号档案')); break;
      case 'rook': record('未拾获物品 / 5003', [['登记名称','Elias Rook'],['年龄 / 职业','34 岁 / 制图员'],['失踪时间','1974-11-03'],['地点','Harrow House，3 号厅西北角，建筑结构内部'],['类别 / 状态','E / 待拾获']], '市政档案原结论：擅自离岗。另存版本：未结案，建议移交失物招领处处理。附注（2019 / Danny）：它一直在布展。它布的是它自己出来的路。', next('上一个','查询相关人员')); break;
      case 'recruit': record('远程客服招聘 / 历史快照', [['发布日期','2019-06-11'],['岗位','失物登记审核、用户查询回复'],['薪酬','市场平均薪资的三倍'],['办公地点','远程 / 以实际分配为准']], '入职后领取工牌。签署合同即视为同意全部岗位安排。', next('合同','查看合同索引')); break;
      case 'cache': $('#results').innerHTML = `<article class="record"><div class="record-header"><span>CACHE / 2019-11-03</span><span>恢复片段 04</span></div><h3>客服对话缓存</h3><div class="chat-line"><span>Danny / 0002</span>我认领你之后，我会怎么样？</div><div class="chat-line"><span>小鹿 / 0001</span>不会怎样。</div><div class="chat-line"><span>Danny / 0002</span>那你告诉我实话。</div><p class="record-note">[对话中断] 客服已离线。<br>0003 关联认领申请：认领人姓名栏为空。</p>${next('他走了','继续查询')}</article>`; break;
      case 'property': record(state.original || '你的失物', [['物品编号','B3-0000'],['拾获地点','B3 层，失物架'],['当前状态','待认领'],['放行条件','需客服 0001 审核']], '记录来源无法验证。请联系当前客服完成审核。', next('审核','查询审核要求')); break;
      case 'claim': claimForm(); break;
      default: errorPage();
    }
  }
  function claimForm() {
    state.waiting = true;
    $('#results').innerHTML = `<article class="record warning"><div class="record-header"><span>CLAIM APPLICATION / 0001</span><span>最后一步</span></div><h3>物品认领申请</h3><form id="claim-form" class="claim-form"><label>物品编号<input value="0001" readonly></label><label>物品描述<input value="工牌 / 客服 0001" readonly></label><label>认领人姓名<input name="claimant" autocomplete="off" maxlength="30" required placeholder="请填写你的姓名" value="${escape(state.draft.name)}"></label><label>认领理由<textarea name="reason" required maxlength="300" placeholder="请填写认领理由">${escape(state.draft.reason)}</textarea></label><div class="claim-terms">认领人确认：本人自愿承担被认领物品所遗留之全部责任与义务，包括但不限于该物品在系统中的<button type="button" data-search="岗位职责">岗位职责</button>。</div><p id="claim-error" class="form-error" role="alert" hidden></p><div class="choice"><button class="record-action" type="submit">确认认领 ↗</button><button type="button" id="leave">放弃认领，离开此处</button></div></form></article>`;
  }
  function emptySearch() {
    $('#results').innerHTML = '<div class="empty"><span class="empty-symbol" aria-hidden="true">⌕</span><h3>没有找到相关失物</h3><p>可以试试物品名称、地点或登记编号。<br>暂时没有记录的物品，也可能正在等待登记。</p><button class="text-link" data-nav="all">返回失物大厅 ↗</button></div>';
  }
  function matchesFor(query) {
    const q = query.normalize('NFKC').toLowerCase().replace(/^zh[–—-]?(2024[–—-])?/, '');
    return allItems().filter(item => `${item.name} ${item.type} ${item.place} ${item.id} ${item.description}`.toLowerCase().includes(q));
  }
  function normalSearch(query, allowAnomaly) {
    const matches = matchesFor(query);
    const anomalous = allowAnomaly && !ordinaryOnly.test(query) && !state.seen.includes('岗位职责') && query.length > 0;
    if (anomalous && !state.original) state.original = query;
    if (matches.length || anomalous) board(matches, anomalous); else emptySearch();
    return matches.length + (anomalous ? 1 : 0);
  }
  function nextAccessible() {
    if (state.level === 0) return state.seen.includes('你是谁') ? ['你在哪', 'B3'] : ['你是谁'];
    if (state.level === 1) return ['入职记录', '0002', '0003'];
    if (state.level === 2) return ['上一个', '他问了什么'];
    return state.seen.includes('岗位职责') ? [] : ['我的东西', '认领表'];
  }
  function currentHint() {
    const seen = word => state.seen.includes(word);
    // 最后的沉默和已完成的结局不再追加指引，选择留给玩家。
    if (state.ending || seen('岗位职责')) return null;
    if (state.level === 0) {
      if (seen('你在哪')) return 'basement';
      if (seen('我是小鹿')) return 'location';
      if (seen('你是谁')) return 'name';
      return state.original ? 'identity' : 'start';
    }
    if (state.level === 1) {
      if (!seen('入职记录')) return 'employee';
      return seen('0002') ? 'chain' : 'previous';
    }
    if (state.level === 2) return seen('上一个') ? 'cache' : 'visitor';
    if (!seen('我的东西')) return 'property';
    if (!seen('审核')) return 'audit';
    if (!seen('认领表')) return 'claim';
    return seen('免责条款') ? 'duties' : 'terms';
  }
  function renderGuide() {
    const id = currentHint();
    const panel = $('#field-guide');
    panel.hidden = !id;
    document.body.dataset.archiveLevel = String(state.level);
    const status = $('#service-state');
    status.textContent = state.ending ? 'INDEX / ONLINE' : state.level > 0 ? 'LEGACY INDEX / LINKED' : 'INDEX / ONLINE';
    if (!id) {
      openGuide = '';
      if (panel.contains(document.activeElement)) $('#search').focus({ preventScroll: true });
      panel.removeAttribute('data-hint');
      $('#hint-content').hidden = true; $('#hint-body').textContent = '';
      $('#hint-search').hidden = true; $('#hint-search').removeAttribute('data-search');
      $('#hint-toggle').setAttribute('aria-expanded','false');
      return;
    }
    panel.dataset.hint = id;
    if (openGuide !== id) openGuide = '';
    const level = state.hintLevels[id] || 0;
    const expanded = openGuide === id && level > 0;
    $('#hint-content').hidden = !expanded;
    $('#hint-toggle').setAttribute('aria-expanded', String(expanded));
    $('#hint-toggle').innerHTML = expanded ? '合上手记 <span aria-hidden="true">−</span>' : '翻阅提示 <span aria-hidden="true">＋</span>';
    $('#hint-body').textContent = level ? data.hints[id].notes[level - 1] : '';
    $('#hint-tier').textContent = ['','第一札 · 观察','第二札 · 思路','第三札 · 索引'][level] || '';
    $('#hint-count').textContent = `0${level} / 03`;
    $('#hint-next').hidden = level === 3;
    $('#hint-search').hidden = level !== 3;
    if (level === 3) {
      $('#hint-search').dataset.search = data.hints[id].keyword;
      $('#hint-search').textContent = `检索「${data.hints[id].keyword}」 ↗`;
    } else {
      $('#hint-search').removeAttribute('data-search'); $('#hint-search').textContent = '';
    }
  }
  function renderTrail() {
    $('#history-list').innerHTML = state.history.slice().reverse().map(q => `<button type="button" data-search="${escape(q)}" ${q === activeQuery ? 'aria-current="true"' : ''}>${escape(q)}<span>↗</span></button>`).join('');
    $('#history-panel').hidden = !state.history.length;
    $('#return-claim').hidden = !(state.waiting && !state.ending);
    $('#search-objective').hidden = !state.original || !!state.ending;
    $('#objective-name').textContent = state.original;
    renderGuide();
  }
  function setMeta(text) { $('#result-meta').hidden = false; $('#result-meta').textContent = text; }
  function search(raw) {
    const query = String(raw).trim().slice(0,80);
    if (!query) { $('#search').focus(); return; }
    cancelPending();
    const id = requestId;
    $('#search').value = query; activeQuery = query;
    $('#results-title').textContent = '查询结果';
    $('#results').classList.add('is-loading'); $('#results').setAttribute('aria-busy', 'true');
    $('#results').inert = true;
    $('#search-form').classList.add('is-searching'); $('.search-submit').setAttribute('aria-label', '正在查找，输入新关键词可重新查询');
    setMeta(`正在检索：${query}`); suggestions([],query);
    announce('正在检索失物信息。');
    const box = $('.search-section').getBoundingClientRect();
    if (box.top < -40 || box.top > window.innerHeight * .5) $('.search-section').scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' });
    later(() => {
      if (id !== requestId) return;
      const term = normalize(query), clue = Object.hasOwn(data.clues, term) ? data.clues[term] : null;
      const silent = state.seen.includes('岗位职责');
      let words = [], count = null;
      if (state.ending) {
        if (state.ending === 'claimed' && (query === state.name || term === 'B3')) { board([]); count = 1; }
        else if (clue) { if (term === '员工通道') errorPage(); else { emptySearch(); count = 0; } }
        else count = normalSearch(query, false);
      } else if (!clue) {
        // 普通寒暄、系统词与“救我”不触发异常，也不会污染最初失物名称。
        if (ordinaryOnly.test(normalize(query))) { errorPage(); } else count = normalSearch(query, true);
      } else if (clue.level > state.level) {
        errorPage(true); if (!silent) words = nextAccessible();
      } else {
        const repeated = state.seen.includes(term);
        if (!repeated) state.seen.push(term);
        if (term === 'B3') state.level = Math.max(state.level,1);
        if (term === '0003' || term === '你懂了吗') state.level = Math.max(state.level,2);
        if (term === '他问了什么' || term === '我的东西' || term === '审核') state.level = Math.max(state.level,3);
        renderPage(clue.page);
        if (!repeated && !silent) words = clue.words;
        document.body.classList.toggle('archive-mode', !!clue.page);
        document.body.classList.toggle('silence-mode', state.seen.includes('岗位职责'));
      }
      state.history = [...state.history.filter(q => q !== query), query].slice(-12);
      $('#results').classList.remove('is-loading'); $('#results').setAttribute('aria-busy', 'false');
      $('#results').inert = false;
      $('#search-form').classList.remove('is-searching'); $('.search-submit').setAttribute('aria-label', '查找失物');
      setMeta(`检索关键词：${query} · ${count === null ? '索引读取完成' : `找到 ${count} 条登记`}`);
      suggestions(words, query, true); animateResults(); renderTrail(); save();
      announce(count === null ? '查询完成，请留意搜索建议与记录。' : `查询完成，找到 ${count} 条登记。`);
    }, 380);
  }
  function home(all = false) {
    cancelPending(); activeQuery = '';
    $('#results-title').textContent = all ? '失物大厅' : '最近拾获'; $('#result-meta').hidden = true;
    showSuggestions(false); $('#search').value = ''; board(); animateResults();
    document.body.classList.remove('archive-mode');
    document.body.classList.toggle('silence-mode', state.seen.includes('岗位职责') && !state.ending);
    $('#search').placeholder = state.ending === 'claimed' ? '输入你捡到的东西' : '试试搜索：钱包、钥匙、校园卡……';
    $('#staff-count').textContent = state.ending === 'left' ? '本站员工：0' : '本站员工：1';
    document.querySelectorAll('.nav').forEach(button => {
      const active = button.dataset.nav === (all ? 'all' : 'home');
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    renderTrail();
  }
  function modal(title, html) {
    modalTrigger = document.activeElement;
    $('#modal-label').textContent = title; $('#modal-body').innerHTML = html;
    if (!$('#modal').open) $('#modal').showModal();
    const firstField = $('#modal-body').querySelector('input:not([readonly])');
    if (firstField) firstField.focus();
  }
  function hasStarted() { return !!(state.original || state.seen.length || state.history.length || state.ending); }
  function openIntro(replay = false) {
    if ($('#intro').open) return;
    introTrigger = document.activeElement;
    $('#intro').dataset.replay = String(replay);
    $('#intro-form').hidden = replay;
    $('#intro-skip').hidden = replay;
    $('#intro-return').hidden = !replay;
    if (!replay) $('#intro-item').value = '钱包';
    $('#intro-error').hidden = true;
    $('#intro-item').removeAttribute('aria-invalid');
    $('#close-intro').setAttribute('aria-label', replay ? '关闭入站小记，回到当前查档' : '略过引子，进入页面');
    $('#intro').showModal();
    $('#intro-title').focus({ preventScroll: true });
    $('#intro').scrollTop = 0;
  }
  function closeIntro() {
    if (!$('#intro').open) return;
    $('#intro').close();
  }
  function rememberIntro() {
    introSeen = true;
    try { localStorage.setItem(introKey, 'read'); } catch { storageAvailable = false; }
    const parentDialog = introTrigger?.closest?.('dialog');
    if (introTrigger?.isConnected && introTrigger !== document.body && (!parentDialog || parentDialog.open)) introTrigger.focus({ preventScroll: true });
    else $('#search').focus({ preventScroll: true });
  }
  function showItem(id) {
    if (id === '0001') {
      if (state.ending === 'claimed') modal('找回网 · 员工记录', `<h2>${escape(state.name)}</h2><p>工号：0001<br>岗位：远程客服<br>状态：待认领<br>工作地点：B3 层，员工通道尽头。</p>`);
      else search('你是谁');
      return;
    }
    const item = allItems().find(item => item.id === id); if (!item) return;
    const pending = Object.hasOwn(state.applications, id);
    modal('找回网 · 失物详情', `<h2>${escape(item.name)}</h2><dl class="detail-list"><dt>登记编号</dt><dd>ZH–${escape(item.id)}</dd><dt>拾获地点</dt><dd>${escape(item.place)}</dd><dt>拾获日期</dt><dd>${escape(item.date)}</dd><dt>物品描述</dt><dd>${escape(item.description)}</dd></dl><p>状态：${pending ? '认领申请已在本机留存，等待审核。' : '待认领。请核对物品细节后提交归属证明。'}</p><div class="detail-actions"><button class="record-action" data-apply="${escape(id)}">${pending ? '查看申请回执' : '申请认领'} ↗</button><button class="text-link" data-search="${escape(item.type)}">查找关联登记 ↗</button></div>`);
  }
  function ordinaryClaim(id) {
    const item = allItems().find(item => item.id === id); if (!item) return;
    if (Object.hasOwn(state.applications,id)) {
      modal('找回网 · 申请回执', `<div class="receipt-mark" aria-hidden="true">✓</div><h2>认领申请已留存</h2><p>物品：${escape(item.name)}<br>回执编号：${escape(state.applications[id].receipt)}<br>状态：待审核</p><p class="local-note">本地模拟申请，仅保存在当前浏览器，没有发送到服务器。</p>`); return;
    }
    modal('找回网 · 认领申请', `<h2>${escape(item.name)}</h2><form id="ordinary-claim-form" class="register-form" data-id="${escape(id)}"><label>称呼<input name="name" required maxlength="30" autocomplete="off"></label><label>归属证明<textarea name="proof" required minlength="6" maxlength="200" placeholder="描述只有失主知道的特征（至少 6 个字）"></textarea></label><p class="local-note">本地模拟申请，请勿填写证件号码或联系方式。提交后不会发送到服务器。</p><p class="form-error" role="alert" hidden></p><button class="record-action" type="submit">提交本机申请 ↗</button></form>`);
  }
  function navigate(where) {
    if (where === 'home' || where === 'all') { home(where === 'all'); if (where === 'all') $('.results-area').scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth' }); return; }
    if (where === 'guide') modal('找回网 · 认领须知','<h2>让物品回到它的主人身边。</h2><ol><li>使用物品名称、拾获地点或编号查询登记信息。</li><li>核对物品特征，准备能证明归属的信息。</li><li>在物品详情中提交认领申请，保留登记编号。</li></ol><p>请勿在登记中公开证件号码、住址等个人信息。平台不收取认领费用。</p>');
    if (where === 'register') modal('找回网 · 拾物登记','<h2>谢谢你，让等待有了回应。</h2><form id="register-form" class="register-form"><label>物品名称<input name="name" required maxlength="40" placeholder="如：一串家门钥匙"></label><label>物品类别<select name="type"><option>其他</option><option>钱包</option><option>钥匙</option><option>证件</option><option>耳机</option></select></label><label>拾获地点<input name="place" required maxlength="60"></label><label>物品描述<textarea name="description" required maxlength="200" placeholder="描述外观特征，请勿填写个人敏感信息"></textarea></label><p class="local-note">仅登记到当前浏览器，不向服务器发送数据。刷新后仍可查看；清除本机记录后删除。</p><p class="form-error" role="alert" hidden></p><button class="record-action" type="submit">保存本机登记 ↗</button></form>');
  }
  function finishEnding() {
    $('#ending').close(); home(); $('#search').focus();
  }
  function transfer(name) {
    if (submitting || state.ending) return;
    submitting = true; cancelPending();
    state.name = name; state.ending = 'claimed'; state.waiting = false; state.draft = fresh().draft; save();
    $('#claim-form button[type="submit"]').disabled = true;
    $('#ending-name').textContent = `员工 0001 / ${name} / 待认领`;
    $('#ending-reveal').hidden = true; $('#ending-status').textContent = '正在审核 / VERIFYING';
    $('#ending').classList.remove('is-complete'); $('#ending').showModal();
    const id = ++endingId;
    later(() => { if (id === endingId) $('#ending-status').textContent = '正在移交岗位职责 / TRANSFERRING'; }, 900);
    later(() => {
      if (id !== endingId) return;
      $('#ending-status').textContent = '认领完成 / TRANSFER COMPLETE';
      $('#ending').classList.add('is-complete'); $('#ending-reveal').hidden = false; $('#return-home').focus();
    }, 2400);
  }
  function leave() {
    cancelPending(); state.ending = 'left'; state.waiting = false; state.draft = fresh().draft; save();
    home(); document.body.classList.add('departure');
    later(() => document.body.classList.remove('departure'), 1000);
    $('#search').focus(); announce('认领已取消。');
  }
  function formError(form, text, field) {
    const error = form.querySelector('.form-error'); error.textContent = text; error.hidden = false;
    field.setAttribute('aria-invalid','true'); field.focus();
  }
  // 搜索、卡片、导航统一委托，动态插入的内容也支持相同交互。
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-search],[data-nav],[data-item],[data-apply]');
    if (!action) return;
    event.preventDefault();
    if ($('#modal').open && !action.dataset.apply) $('#modal').close();
    if (action.dataset.search) { search(action.dataset.search); $('#search').focus({ preventScroll: true }); return; }
    if (action.dataset.nav) { navigate(action.dataset.nav); return; }
    if (action.dataset.apply) { ordinaryClaim(action.dataset.apply); return; }
    showItem(action.dataset.item);
  });
  $('.brand').addEventListener('click', event => { event.preventDefault(); home(); window.scrollTo({ top:0, behavior: reduceMotion.matches ? 'instant' : 'smooth' }); });
  $('#search-form').addEventListener('submit', event => { event.preventDefault(); if (!composing) search($('#search').value); });
  const inputSuggestions = () => {
    // 编辑输入立即使旧请求失效，避免迟到的响应覆盖新的搜索词。
    const interrupted = $('#results').classList.contains('is-loading');
    cancelPending();
    if (interrupted) { setMeta('旧查询已取消，请提交新的关键词。'); announce('旧查询已取消。'); }
    const q = $('#search').value.trim();
    if (!q) { showSuggestions(false); return; }
    suggestions(matchesFor(q).slice(0,4).map(item => item.name),q);
  };
  $('#search').addEventListener('compositionstart', () => { composing = true; cancelPending(); showSuggestions(false); });
  $('#search').addEventListener('compositionend', () => { composing = false; inputSuggestions(); });
  $('#search').addEventListener('input', () => { if (!composing) inputSuggestions(); });
  $('#search').addEventListener('focus', () => { if ($('#suggestions').children.length && $('#search').value.trim() && !composing) showSuggestions(true); });
  $('#search').addEventListener('keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape') { suggestionId++; showSuggestions(false); }
    if (event.key === 'ArrowDown' && !$('#suggestions').hidden) { event.preventDefault(); $('#suggestions button')?.focus(); }
  });
  $('#suggestions').addEventListener('keydown', event => {
    const buttons = [...$('#suggestions').querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (event.key === 'ArrowUp' && i === 0) $('#search').focus();
      else buttons[(i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'Escape') { suggestionId++; showSuggestions(false); $('#search').focus(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-section')) { suggestionId++; showSuggestions(false); }
    if (event.target.closest('#leave')) leave();
  });
  $('#close-modal').addEventListener('click', () => $('#modal').close());
  $('#modal').addEventListener('click', event => {
    if (event.target === $('#modal')) {
      const r = $('#modal').getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#modal').close();
    }
    if (event.target.closest('#confirm-reset')) {
      cancelPending(); endingId++; submitting = false; state = fresh(); save();
      introSeen = false;
      try { localStorage.removeItem(introKey); } catch { storageAvailable = false; }
      $('#modal').close(); home(); openIntro(); toast('本机记录已清除，可以重新开始寻找。');
    }
  });
  $('#modal').addEventListener('close', () => { if (modalTrigger?.isConnected) modalTrigger.focus({ preventScroll: true }); });
  $('#read-intro').addEventListener('click', () => openIntro(true));
  $('#close-intro').addEventListener('click', closeIntro);
  $('#intro-skip').addEventListener('click', closeIntro);
  $('#intro-return').addEventListener('click', closeIntro);
  $('#intro').addEventListener('close', rememberIntro);
  $('#intro').addEventListener('cancel', event => { event.preventDefault(); closeIntro(); });
  $('#intro-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('#intro').open || $('#intro').dataset.replay === 'true') return;
    const property = $('#intro-item').value.trim().slice(0,40);
    if (!property) { $('#intro-error').hidden = false; $('#intro-item').setAttribute('aria-invalid','true'); $('#intro-item').focus(); return; }
    closeIntro(); search(property); $('#search').focus({ preventScroll: true });
  });
  $('#show-all').addEventListener('click', () => home(true));
  $('#hint-toggle').addEventListener('click', () => {
    const id = currentHint(); if (!id) return;
    // 合上只收起界面，不遗忘已翻阅的页数。再次翻阅从原处继续。
    if (!$('#hint-content').hidden) {
      openGuide = ''; renderGuide();
    } else {
      openGuide = id; state.hintLevels[id] ||= 1; renderGuide(); save();
    }
  });
  $('#hint-next').addEventListener('click', () => {
    const id = currentHint(); if (!id) return;
    state.hintLevels[id] = Math.min(3, (state.hintLevels[id] || 0) + 1);
    renderGuide(); save();
    if (state.hintLevels[id] === 3) $('#hint-search').focus({ preventScroll: true });
  });
  $('#return-claim').addEventListener('click', () => { search('认领表'); $('#search').focus({ preventScroll: true }); });
  $('#return-home').addEventListener('click', finishEnding);
  $('#ending').addEventListener('cancel', event => { event.preventDefault(); if ($('#ending').classList.contains('is-complete')) finishEnding(); });
  $('#reset').addEventListener('click', () => modal('找回网 · 本机记录','<h2>清除本机记录？</h2><p>这会清除搜索进度、表单草稿、拾物登记、认领申请与结局，让你重新开始寻找。</p><button id="confirm-reset" class="record-action">清除并重新开始 ↗</button>'));
  document.addEventListener('input', event => {
    const form = event.target.closest('form'); if (!form) return;
    event.target.removeAttribute('aria-invalid');
    const error = form.querySelector('.form-error'); if (error) error.hidden = true;
    if (form.id === 'claim-form' && !state.ending) {
      state.draft = { name: form.elements.claimant.value.slice(0,30), reason: form.elements.reason.value.slice(0,300) }; save();
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['claim-form','register-form','ordinary-claim-form'].includes(form.id)) return;
    event.preventDefault();
    const values = new FormData(form);
    const nameField = form.elements[form.id === 'claim-form' ? 'claimant' : 'name'];
    const name = String(values.get(nameField.name) || '').trim();
    if (!name) { formError(form,'请填写有效的姓名或物品名称。',nameField); return; }
    if (form.id === 'claim-form') {
      if (state.ending) return;
      if (!String(values.get('reason') || '').trim()) { formError(form,'请填写认领理由。',form.elements.reason); return; }
      transfer(name); return;
    }
    if (form.id === 'ordinary-claim-form') {
      if (String(values.get('proof') || '').trim().length < 6) { formError(form,'请至少填写 6 个字的物品特征。',form.elements.proof); return; }
      const id = form.dataset.id;
      if (!allItems().some(item => item.id === id)) return;
      state.applications[id] = { receipt: `ZH-R-${Date.now().toString().slice(-8)}` }; save();
      ordinaryClaim(id); home(true); toast('本机申请已留存。'); return;
    }
    for (const field of ['place','description']) if (!String(values.get(field) || '').trim()) { formError(form,'请完整填写拾获地点与物品描述。',form.elements[field]); return; }
    if (state.registrations.length >= 50) { formError(form,'本机登记已达 50 条，请清除本机记录后重试。',nameField); return; }
    const id = `L${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    state.registrations.unshift({ id, name, place: String(values.get('place')).trim(), description: String(values.get('description')).trim(), type: String(values.get('type')), date: new Date().toLocaleDateString('sv-SE'), icon:'card' }); save();
    $('#modal').close(); home(true); $('.results-area').scrollIntoView({behavior: reduceMotion.matches ? 'instant' : 'smooth'});
    toast(storageAvailable ? '拾物信息已保存到当前浏览器。' : '拾物信息已保存到本页，浏览器未允许持久保存。');
  });
  window.addEventListener('pagehide', () => { cancelPending(); save(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { resolveDeparture(); if ($('#ending').open) $('#ending').close(); home(); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    cancelPending(); endingId++; submitting = false;
    state = readState(event.newValue);
    if ($('#modal').open) $('#modal').close();
    if ($('#ending').open) $('#ending').close();
    if ($('#intro').open) closeIntro();
    home(); toast('本机记录已在另一个页面更新。');
  });
  home();
  if (!introSeen && !hasStarted()) openIntro();
  if (!storageAvailable) toast('浏览器未允许本地保存，本次进度仅在当前页面有效。');
})();
