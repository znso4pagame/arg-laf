(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const data = window.ZHAOHUI;
  const key = 'zhaohui-story-v1';
  const introKey = 'zhaohui-intro-v1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fresh = () => ({ schema: 4, leads: [], revision: 0, heard: {}, pending: [], facts: [], views: [], viewCursor: -1, screen: 'home', anomalySeen: false, lastClue: '', seen: [], level: 0, original: '', ending: '', name: '', waiting: false, history: [], hintLevels: {}, draft: { name: '', reason: '' }, registrations: [], applications: {}, badgeVisits: 0 });
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
      next.anomalySeen = saved.anomalySeen === true || ((!saved.schema || saved.schema < 3) && (!!saved.original || next.seen.length > 0));
      next.revision = Math.max(0, Number(saved.revision) || 0);
      // 旧版只按层级放行；迁移已读证据的前置关系，保留旧进度与结局。
      if (![2,3,4].includes(saved.schema)) {
        const addParents = term => {
          const clue = data.clues[term]; if (!clue) return;
          for (const parent of [...(clue.after || []), ...(clue.any?.length ? [clue.any[0]] : [])]) {
            if (!next.seen.includes(parent)) { next.seen.push(parent); addParents(parent); }
          }
        };
        next.seen.slice().forEach(addParents);
      }
      next.level = Math.max(0, ...next.seen.map(term => data.clues[term]?.level || 0));
      next.lastClue = next.seen.includes(saved.lastClue) ? saved.lastClue : next.seen.at(-1) || '';
      next.waiting = next.seen.includes('岗位职责') && !next.ending;
      next.history = Array.isArray(saved.history) ? saved.history.filter(x => typeof x === 'string').slice(-12) : [];
      if (saved.hintLevels && typeof saved.hintLevels === 'object') {
        for (const [id, level] of Object.entries(saved.hintLevels)) {
          if (Object.hasOwn(data.hints, id) && Number.isInteger(level) && level >= 1 && level <= 3) next.hintLevels[id] = level;
        }
      }
      next.draft = { name: String(saved.draft?.name || '').slice(0, 30), reason: String(saved.draft?.reason || '').slice(0, 300) };
      next.registrations = Array.isArray(saved.registrations) ? saved.registrations.filter(x => x && typeof x.id === 'string' && x.id.startsWith('L') && ['name','place','description','type','date'].every(k => typeof x[k] === 'string')).slice(0, 50) : [];
      if (saved.applications && typeof saved.applications === 'object') for (const [id, value] of Object.entries(saved.applications)) { if (value && typeof value.receipt === 'string') next.applications[id] = { receipt: value.receipt.slice(0,80) }; }
      next.facts = Array.isArray(saved.facts) ? saved.facts.filter(x => x === 'temporary-record') : [];
      if ((!saved.schema || saved.schema < 3) && next.seen.includes('我的东西') && next.seen.includes('B3')) next.facts = ['temporary-record'];
      if (saved.heard && typeof saved.heard === 'object') for (const [id,count] of Object.entries(saved.heard)) {
        if (Object.keys(data.clues).some(term => id.startsWith(term + ':')) && Number.isInteger(count) && count >= 0 && count <= 20) next.heard[id] = count;
      }
      if (!saved.schema || saved.schema < 3) for (const term of next.seen) next.heard[term + ':base'] = data.clues[term].words.length;
      if (Array.isArray(saved.pending)) next.pending = saved.pending.filter(x => x && typeof x.term === 'string' && Object.hasOwn(data.clues,x.term) && typeof x.variant === 'string' && typeof x.query === 'string').slice(-12).map(x => ({ term:x.term, variant:x.variant.slice(0,30), query:x.query.slice(0,80) }));
      if (Array.isArray(saved.views)) next.views = saved.views.filter(x => x && typeof x.query === 'string' && ['clue','normal','empty','blocked','home'].includes(x.kind) && (!x.term || Object.hasOwn(data.clues,x.term))).slice(-24).map(x => ({ query:x.query.slice(0,80), term:x.term || '', kind:x.kind, variant:String(x.variant || 'base').slice(0,30), lookup:typeof x.lookup==='string'?x.lookup.slice(0,80):x.query.slice(0,80), anomalous:!!x.anomalous, words:Array.isArray(x.words) ? x.words.filter(w => w && typeof w.text === 'string').slice(0,20).map(w=>({text:w.text.slice(0,120),reply:!!w.reply})) : [] }));
      next.viewCursor = next.views.length ? Math.min(next.views.length-1,Math.max(0,Number(saved.viewCursor) || 0)) : -1;
      next.screen = ['home','all','query'].includes(saved.screen) ? saved.screen : 'home';
      next.leads = Array.isArray(saved.leads) ? saved.leads.filter(term=>typeof term==='string'&&Object.hasOwn(data.clues,term)) : [];
      if(saved.schema!==4) {
        const add = word => {const term=data.aliases[word]||word;if(Object.hasOwn(data.clues,term)&&!next.leads.includes(term))next.leads.push(term);};
        next.seen.forEach(add);next.views.forEach(view=>view.words.forEach(entry=>add(entry.text)));
        for(const term of next.seen)if(data.clues[term].page)for(const query of data.clues[term].queries||[])add(query);
      }

      return next;
    } catch { return fresh(); }
  }
  let state;
  try { state = readState(localStorage.getItem(key)); } catch { storageAvailable = false; state = fresh(); }
  let introSeen = false;
  try { introSeen = localStorage.getItem(introKey) === 'read'; } catch { storageAvailable = false; }
  function save({ force = false, quiet = false } = {}) {
    try {
      const raw = localStorage.getItem(key);
      let stored = null; try { stored = raw ? JSON.parse(raw) : null; } catch { /* 损坏的记录允许由当前有效状态覆盖。 */ }
      const revision = Number(stored?.revision) || 0;
      if (!force && revision > state.revision) {
        if (!quiet) {
          cancelPending();state = readState(raw);
          queueMicrotask(() => { cancelPending(); claimReview = null; if ($('#modal').open) $('#modal').close(); restoreCurrent(); toast('进度已在另一个页面更新，已保留较新的记录。'); });
        }
        return false;
      }
      state.revision = Math.max(revision,state.revision) + 1;
      localStorage.setItem(key, JSON.stringify(state));
    } catch { const wasAvailable=storageAvailable;storageAvailable=false;if(wasAvailable&&!quiet)toast('浏览器无法保存进度，本页仍可继续，关闭前请留意。'); }
    return true;
  }
  let requestId = 0, suggestionId = 0, endingId = 0, toastTimer;
  let lastNormal = {lookup:'',anomalous:false};
  let composing = false, submitting = false, activeQuery = '', openGuide = '', modalTrigger, introTrigger, claimReview = null;
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
  function suggestionRow(entry) {
    if (entry.reply) {
      const row = document.createElement('div'); row.className = 'suggestion-response';
      row.textContent = entry.text; return row;
    }
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.search = entry.text;
    button.innerHTML = `<span class="suggestion-word">${escape(entry.text)}</span><span aria-hidden="true">↗</span>`;
    return button;
  }
  function currentView() { return state.views[state.viewCursor]; }
  function rememberView(view) {
    state.views = [...state.views.slice(0,state.viewCursor + 1), { ...view, words:[] }].slice(-24);
    state.viewCursor = state.views.length - 1; state.screen = 'query';
    return currentView();
  }
  function suggestions(entries, query, delayed = false, delivery = null) {
    const id = ++suggestionId;
    const rows = [{text:query,reply:false},...entries.map(e => typeof e === 'string' ? {text:e,reply:false} : e)].filter(e => e.text);
    const unique = rows.filter((e,i) => rows.findIndex(other => other.text === e.text && other.reply === e.reply) === i);
    $('#suggestions').replaceChildren();
    if (!unique.length) { showSuggestions(false); return; }
    showSuggestions(true);
    const view = delivery ? currentView() : null;
    unique.forEach((entry, i) => {
      const append = () => {
        if (id !== suggestionId) return;
        $('#suggestions').append(suggestionRow(entry));
        const term=normalize(entry.text);
        if(i>0&&Object.hasOwn(data.clues,term)&&!state.leads.includes(term))state.leads.push(term);
        if (view) view.words.push({text:entry.text,reply:entry.reply});
        if (delivery && entry.reply) state.heard[delivery.id] = (state.heard[delivery.id] || 0) + 1;
        if (delivery && i === unique.length - 1) {
          state.pending = state.pending.filter(p => p.term + ':' + p.variant !== delivery.id);
          renderTrail(); save(); announce('查询建议已显示完整。');
        }
      };
      if (delayed && i) later(append, 180 + i * 180); else append();
    });
  }
  function responseFor(term, forced) {
    const base = data.clues[term];
    const proof = state.seen.includes('0003') || state.seen.includes('他问了什么');
    let variant = forced || (term === '我的东西' ? (state.seen.includes('B3') ? 'located' : 'early') : term === '审核' ? (proof ? 'checked' : 'early') : term === '怎么帮你' ? (state.seen.includes('审核') ? 'claim' : state.seen.includes('B3') ? 'badge' : 'early') : term === '认领后会怎样' ? (state.seen.includes('审核') ? 'ready' : 'early') : term === '不认领会怎样' ? (state.seen.includes('认领表') ? 'ready' : 'early') : term === '骗我' && state.seen.includes('审核') ? 'confession' : 'base');
    let result = { ...base, variant, id:term + ':' + variant };
    if (term === '我的东西' && variant === 'early') result = {...result, page:'property-request', words:['我可以替你查', '但先确认一下我留下的工牌'],queries:['你在哪','怎么帮你']};
    if (term === '我的东西' && variant === 'located') result = {...result, page:'property',words:['我补了一条暂存登记','还没有找到入库单','你先核对审核要求'],queries:['审核','入职记录']};
    if (term === '审核' && variant === 'early') result = {...result,words:['我现在碰不到实物架','先让我离开，我才能继续找','申请可以先看，不必立刻签'],queries:['认领表','入职记录','骗我']};
    if (term === '审核' && variant === 'checked') result = {...result,words:['这条登记是我补的','我没有找到你的东西','我想让你认领的是我'],queries:['为什么要认领你','认领表','骗我']};
    if (term === '怎么帮你') {
      if (variant === 'early') result = {...result,words:['先确认我的工牌还在不在'],queries:['你在哪','我的东西']};
      if (variant === 'badge') result = {...result,words:['背面有关联档案','核对之后你再决定要不要帮我'],queries:['入职记录','我的东西']};
      if (variant === 'claim') result = {...result,words:['申请的对象是我','你可以先把条款看完'],queries:['认领表','入职记录']};
    }
    if(term==='认领后会怎样') result={...result,words:variant==='ready'?['完整附则就在申请里','看完再决定，不必现在签']:['先确认我留下的工牌','还没有到签署的时候'],queries:variant==='ready'?['认领表','入职记录']:['你在哪','我的东西']};
    if(term==='不认领会怎样') result={...result,words:variant==='ready'?['我会继续留在这里','但你可以不签']:['你可以先继续找自己的东西','我会等'],queries:variant==='ready'?['认领表']:['我的东西','你在哪']};
    if (term === '骗我' && variant === 'confession') result = {...result,words:['是我加了那条登记','它不是拾获凭据','我只是想让你继续留下'],queries:['认领表','为什么要认领你']};
    return result;
  }
  function pendingResponses() {
    if (state.ending) return [];
    return state.pending.filter(p => {
      if (state.seen.includes('岗位职责') && p.term !== '岗位职责') return false;
      const response = responseFor(p.term);
      return response.variant === p.variant && (state.heard[response.id] || 0) < response.words.length;
    });
  }
  function allItems() { return [...state.registrations, ...data.items]; }
  function normalize(query) {
    let term = query.normalize('NFKC').replace(/[？?！!。]+$/u, '').trim().replace(/\s+/g, ' ');
    if (/^b\s*3(?:层|楼)?$/i.test(term)) term = 'B3';
    const numbered = term.match(/^(?:编号|登记|第)?(000[123])(?:号|条)?$/); if (numbered) term = numbered[1];
    if (/^(?:我(?:丢的|遗失的)|我的).*(?:在哪|呢|找到了吗)$/.test(term) && state.seen.includes('你是谁')) term = '我的东西';
    if (/^(?:我(?:应该|该)?怎么帮你|怎么帮你出去)$/.test(term)) term = '怎么帮你';
    const compact=term.replace(/[\s，,、]/g,'');
    if(/^(?:(?:如果|要是|那么|那))?(?:我)?认领你(?:之后|以后|后)?(?:我)?(?:会怎么样|会怎样|会发生什么|会有什么后果)$/.test(compact)) term=state.seen.includes('认领表')?'岗位职责':'认领后会怎样';
    if(/^(?:我是不是会|我会不会|是不是会)(?:变成你|接替你)$/.test(compact)) term=state.seen.includes('认领表')?'岗位职责':'认领后会怎样';
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
    const next = (word, text) => `<button class="record-action" data-search="${escape(word)}">${escape(text)} &gt;&gt;</button>`;
    switch (page) {
      case 'badge':
        record('工牌登记 / 0001', [['物品编号','0001'],['物品描述','客服工牌，姓名栏已磨损'],['拾获地点','B3 层，员工通道尽头'],['原始登记日期','2019-06-11'],['当前转录批次','2024-03-14'],['当前状态','暂存']], '原件日期与页面转录日期分列保存。关联人员档案仍可查阅。', next('入职记录','查询工牌持有人')); break;
      case 'employee1':
        record('人员档案 / 客服 0001', [['姓名','小鹿'],['入职日期','2019-06-11'],['岗位','远程客服'],['状态','未归档'],['关联旧登记','流水号 0002（不是客服工号）']], '本页编号 0001 为工号，旧登记 0002、0003 为历史流水号。请勿混用。', next('0002','调阅历史登记 0002')); break;
      case 'employee2':
        record('历史签收凭据 / 0002', [['登记日期','2019-02-18'],['类别','E'],['受领对象','原名称缺失'],['签收人代号','Q-17'],['签收状态','已完成'],['后续记录','0003']], '签收完成后，系统另生成一份登记。签收人与后续登记对象之间的关系尚需核对。', next('0003','对照后续登记 0003')); break;
      case 'employee3':
        record('后续登记 / 0003', [['登记日期','2019-02-18'],['物品名称','Q-17'],['类别','E'],['最终状态','已归档'],['来源凭据','0002'],['协查附件','Danny / D-2019']], 'Q-17 同时出现在上一份凭据的签收人栏与本页的物品名称栏。附件保留一位协查者的记录。', next('上一个','查看协查附件') + next('骗我','询问记录为何相连')); break;
      case 'visitor':
        record('协查附件 / Danny', [['身份','Harrow House 夜班保安'],['访客记录号','D-2019'],['客服工号','无'],['对话时间','2019-11-03'],['认领申请','未签署、未提交'],['留存内容','一段客服对话缓存']], 'Danny 是协查访客，不是 0002 的签收人。访客的未完成申请与历史签收链分别保存。', next('他问了什么','打开对话缓存')); break;
      case 'cache':
        $('#results').innerHTML = `<article class="record"><div class="record-header"><span>缓存副本 / 2019-11-03</span><span>访客 D-2019</span></div><h3>客服对话缓存</h3><div class="chat-line"><span>Danny / 协查访客</span>我认领你之后，我会怎么样？</div><div class="chat-line"><span>客服 0001</span>不会怎样。</div><div class="chat-line"><span>Danny / 协查访客</span>那你告诉我实话。</div><p class="record-note">[会话中断] 认领人姓名栏：空。<br>提交记录：无。没有发生岗位移交。馆方另记其同日夜班失踪，失踪记录不能作为认领凭据。</p>${next('他走了','查询这份申请的后续')}</article>`; break;
      case 'category':
        record('分类指南 / E 类', [['分类名称','以上皆不符合'],['启用日期','1974-11-03'],['适用案件','Elias Rook / 5003'],['人员分类变更','不予受理']], '该类别先于找回网存在。旧纸质档案转录后，沿用原分类。', next('Elias Rook','查阅 5003 号档案')); break;
      case 'rook':
        record('未拾获物品 / 5003', [['登记名称','Elias Rook'],['年龄 / 职业','34 岁 / 制图员'],['失踪时间','1974-11-03'],['地点','Harrow House，3 号厅西北角，建筑结构内部'],['类别 / 状态','E / 待拾获']], '市政原记录：擅自离岗。另一副本：未结案，建议移交失物招领处。2019 年 Danny 的附注：它一直在布展。它布的是它自己出来的路。', next('上一个','查阅 Danny 的协查附件')); break;
      case 'recruit':
        record('招聘广告 / 2019 年存档', [['发布日期','2019-06-01'],['岗位','远程客服'],['工作内容','登记审核、回复查询'],['薪资','市场平均薪资的三倍'],['合同索引','合同']], '本广告已失效，仅保留历史快照。', next('合同','查看历史合同索引')); break;
      case 'property-request':
        record('失物查询委托', [['查询物品',state.original || '尚未填写'],['已核验拾获记录','暂未找到'],['客服状态','位置及工牌尚待核对']], '尚无证据证明这件物品在库。你可以先确认对方的身份，也可以继续核对普通拾获登记。', next('你在哪','询问工牌所在位置')); break;
      case 'property':
        record('临时补录 / ' + (state.original || '你的失物'), [['临时编号','B3-TEMP'],['填写地点','B3 层，失物架'],['入库凭据','缺失'],['记录性质','客服人工补录，尚未核验'],['操作要求','先审核，再认领']], '这不是独立的拾获证明。物品名称与搜索词相同，创建来源为客服 0001。', next('审核','核对入库与审核要求')); break;
      case 'audit':
        record('审核结果 / B3-TEMP', [['入库凭据','未提供'],['临时登记','客服补录，不是拾获证明'],['关联申请对象','小鹿 / 客服 0001'],['申请类型','特殊人员认领'],['承诺核验','尚无独立凭据']], '对方要求先处理人员认领，再继续查找失物。这只是对方的承诺；两项申请没有自动关联。你可以查看申请，也可以先查档或提出质疑。', next('认领表','仅查看关联认领表') + next('入职记录','先核对客服档案') + next('骗我','质疑未核验的承诺')); break;
      case 'claim': claimForm(); break;
      case 'terms':
        record('特殊认领附则', [['认领对象','客服 0001 / 小鹿'],['继受范围','该对象在系统中遗留的全部责任与义务'],['包含事项','岗位职责'],['生效条件','填写认领人姓名并确认提交']], '仅打开本页、查阅说明或刷新页面，不构成签署。', next('岗位职责','查询“岗位职责”的含义')); break;
      case 'duties':
        record('岗位职责 / 客服 0001', [['当前岗位','客服 0001'],['移交方式','随特殊认领申请一并移交'],['确认后原在岗人','解除岗位'],['确认后认领人','接替客服岗位，等待下一次认领'],['失物核验','没有找到你的失物']], '尚未提交申请。你可以返回表格签署，也可以明确放弃。刷新和查阅说明不会替你作出选择。', next('认领表','返回尚未提交的表格') + '<button class="text-link" id="leave" type="button">放弃认领，结束本次查询</button>'); break;
      default: errorPage();
    }
  }
  function claimForm() {
    $('#results').innerHTML = `<article class="record warning"><div class="record-header"><span>特殊认领申请 / 0001</span><span>未提交</span></div><h3>特殊认领申请</h3><p class="record-note">本表认领对象为小鹿（客服 0001），不是你遗失的物品。查看表格不会自动提交。关闭页面会保留草稿，不会替你签署或放弃。</p><form id="claim-form" class="claim-form"><label>对象编号<input value="客服 0001" readonly></label><label>对象名称<input value="小鹿（关联工牌 0001）" readonly></label><label>认领人姓名<input name="claimant" autocomplete="off" maxlength="30" required placeholder="填写即将签署的姓名" value="${escape(state.draft.name)}"></label><label>认领理由<textarea name="reason" required maxlength="300" placeholder="请填写认领理由">${escape(state.draft.reason)}</textarea></label><div class="claim-terms">认领人确认：本人自愿承担被认领对象所遗留之全部责任与义务，包括但不限于该对象在系统中的<button type="button" data-search="岗位职责">岗位职责</button>。 <button type="button" data-search="免责条款">查阅完整附则</button></div><p id="claim-error" class="form-error" role="alert" hidden></p><div class="choice"><button class="record-action" type="submit">确认签署并认领 &gt;&gt;</button><button type="button" id="leave">放弃认领，结束查询</button></div></form></article>`;
  }
  function emptySearch() {
    $('#results').innerHTML = '<div class="empty"><span class="empty-symbol" aria-hidden="true">⌕</span><h3>没有找到相关失物</h3><p>可以试试物品名称、地点或登记编号。<br>暂时没有记录的物品，也可能正在等待登记。</p><button class="text-link" data-nav="all">返回失物大厅 ↗</button></div>';
  }
  function matchesFor(query) {
    const q = query.normalize('NFKC').toLowerCase().replace(/^zh[–—-]?(2024[–—-])?/, '');
    return allItems().filter(item => `${item.name} ${item.type} ${item.place} ${item.id} ${item.description}`.toLowerCase().includes(q));
  }
  function normalSearch(query, allowAnomaly) {
    const property = query.replace(/^(?:我想找|帮我找|我丢的|我遗失的|我的)/,'').replace(/(?:在哪里|在哪|呢|找到了吗|不见了)$/,'').trim();
    const lookup = property === '东西' && state.original ? state.original : property || query;
    const matches = matchesFor(lookup);
    const propertyQuery = matches.length > 0 || query === state.original || /钱包|钥匙|耳机|证件|卡片|校园卡|手机|背包|手表|雨伞|围巾|戒指|项链|眼镜|书包|水杯/.test(query);
    const anomalous = allowAnomaly && propertyQuery && !state.seen.includes('岗位职责');
    if (anomalous) { state.anomalySeen = true; if (!state.original) state.original = lookup; }
    lastNormal={lookup,anomalous};
    if (matches.length || anomalous) board(matches, anomalous); else emptySearch();
    return matches.length + (anomalous ? 1 : 0);
  }
  function canOffer(term) {
    const clue = data.clues[term]; if (!clue) return false;
    if (state.seen.includes(term)) return true;
    if (clue.anomaly && !state.anomalySeen) return false;
    if (clue.needs?.some(fact => !state.facts.includes(fact))) return false;
    if (clue.after?.some(parent => !state.seen.includes(parent))) return false;
    if (clue.any?.length && !clue.any.some(parent => state.seen.includes(parent))) return false;
    return true;
  }
  function canAccess(term) {
    if(!canOffer(term))return false;
    return state.seen.includes(term) || !data.indexTerms.includes(term) || state.leads.includes(term);
  }
  function revealRecordLinks() {
    for(const link of $('#results').querySelectorAll('[data-search]')) {
      const term=normalize(link.dataset.search);
      if(Object.hasOwn(data.clues,term)&&canOffer(term)&&!state.leads.includes(term))state.leads.push(term);
    }
  }
  function currentHint() {
    const seen = term => state.seen.includes(term);
    if(state.ending||seen('岗位职责'))return null;
    if(!state.anomalySeen)return 'start';
    if(!seen('你是谁'))return 'identity';
    if(!seen('B3'))return canOffer('B3')?'basement':'location';
    const context=state.lastClue;
    const related={
      'B3':'employee','入职记录':'previous','0002':'chain','0003':'visitor','你懂了吗':'visitor',
      '骗我':seen('审核')?'claim':'visitor','没说完什么':'visitor','上一个':'cache','他问了什么':'departure',
      '他走了':'property','我的东西':'audit','审核':'claim','为什么要认领你':'claim','认领表':'terms','免责条款':'duties',
      '怎么帮你':seen('审核')?'claim':'employee'
    };
    const eligible = id => {
      const term=data.hints[id]?.keyword;if(!term||!canOffer(normalize(term)))return false;
      return !seen(normalize(term)) || (id==='property'&&!state.facts.includes('temporary-record'));
    };
    if(related[context]&&eligible(related[context]))return related[context];
    const candidates=seen('认领表')?['terms','duties','employee','previous','chain','visitor','cache']:['employee','previous','chain','visitor','cache','departure','property','audit','claim'];
    return candidates.find(eligible)||null;
  }
  function nextAccessible() {
    if (state.ending || state.seen.includes('岗位职责')) return [];
    const questions = (state.lastClue ? responseFor(state.lastClue).queries : []).filter(q => canAccess(normalize(q)));
    const hint = currentHint();
    if (hint && hint !== 'start') {
      const term = data.hints[hint].keyword;
      if (canAccess(normalize(term)) && state.leads.includes(normalize(term)) && !questions.includes(term)) questions.push(term);
    }
    return questions;
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
    $('#hint-toggle').innerHTML = expanded ? '收起提示 <span aria-hidden="true">−</span>' : '查看提示 <span aria-hidden="true">＋</span>';
    $('#hint-body').textContent = level ? data.hints[id].notes[level - 1] : '';
    $('#hint-tier').textContent = ['','第 1 级 · 观察','第 2 级 · 思路','第 3 级 · 关键词'][level] || '';
    $('#hint-count').textContent = `0${level} / 03`;
    $('#hint-next').hidden = level === 3;
    $('#hint-search').hidden = level !== 3;
    if (level === 3) {
      $('#hint-search').dataset.search = data.hints[id].keyword;
      const lead=normalize(data.hints[id].keyword);if(!state.leads.includes(lead))state.leads.push(lead);
      $('#hint-search').textContent = `检索「${data.hints[id].keyword}」 ↗`;
    } else {
      $('#hint-search').removeAttribute('data-search'); $('#hint-search').textContent = '';
    }
  }
  function renderTrail() {
    $('#history-list').innerHTML = state.history.slice().reverse().map(q => `<button type="button" data-search="${escape(q)}" ${q === activeQuery ? 'aria-current="true"' : ''}>${escape(q)}<span>↗</span></button>`).join('');
    $('#history-panel').hidden = !state.history.length;
    $('#return-claim').hidden = !(state.seen.includes('认领表') && !state.ending);
    $('#search-objective').hidden = !state.original || !!state.ending;
    $('#objective-name').textContent = state.original;
    $('#ask-property').hidden = !state.seen.includes('你是谁') || !!state.ending;
    const unread = pendingResponses();
    $('#resume-reply').hidden = !unread.length;
    $('#resume-reply').textContent = unread.length ? `还有未显示完的查询建议：${unread[0].query} · 继续查看 >>` : '';
    $('#query-navigation').hidden = state.views.length < 2 || !!state.ending;
    $('#query-back').disabled = state.viewCursor <= 0;
    $('#query-forward').disabled = state.viewCursor >= state.views.length - 1;
    $('#query-position').textContent = state.views.length ? `${state.viewCursor + 1} / ${state.views.length}` : '';
    renderGuide();
  }
  function setMeta(text) { $('#result-meta').hidden = false; $('#result-meta').textContent = text; }
  function search(raw, {resume = false} = {}) {
    const query = String(raw).trim().slice(0,80);
    if (!query) { $('#search').focus(); return; }
    cancelPending();
    const id = requestId;
    $('#search').value = query; activeQuery = query;
    $('#results-title').textContent = '查询结果';
    $('#results').classList.add('is-loading'); $('#results').setAttribute('aria-busy', 'true'); $('#results').inert = true;
    $('#search-form').classList.add('is-searching'); $('.search-submit').setAttribute('aria-label','正在查找');
    setMeta(`正在检索：${query}`); suggestions([],query); announce('正在检索失物信息。');
    const box = $('.search-section').getBoundingClientRect();
    if (box.top < -40 || box.top > window.innerHeight * .5) $('.search-section').scrollIntoView({behavior:reduceMotion.matches?'instant':'smooth',block:'start'});
    later(() => {
      if (id !== requestId) return;
      const term = normalize(query), clue = Object.hasOwn(data.clues,term) ? data.clues[term] : null;
      const silent = state.seen.includes('岗位职责');
      let entries = [], count = null, kind = 'empty', response = null, delivery = null;
      if (state.ending) {
        if (state.ending === 'claimed' && (query === state.name || term === 'B3')) { board([]); count=1; kind='normal'; }
        else if (clue) { if (term === '员工通道') errorPage(); else emptySearch(); }
        else { count=normalSearch(query,false); kind='normal'; }
      } else if (!clue) {
        if (ordinaryOnly.test(term)) errorPage();
        else { count=normalSearch(query,true); kind='normal'; if (!count && state.anomalySeen) { errorPage();kind='empty';entries=nextAccessible(); } }
      } else if (term === '我的东西' && !state.seen.includes('你是谁')) {
        count=normalSearch(query,true);kind='normal';
      } else if (!canAccess(term)) {
        errorPage(true);kind='blocked';if(!silent)entries=nextAccessible();
      } else {
        response = responseFor(term);kind='clue';
        if (!state.seen.includes(term)) state.seen.push(term);
        state.level=Math.max(state.level,clue.level||0);state.lastClue=term;
        if (term==='我的东西' && response.variant==='located' && !state.facts.includes('temporary-record')) state.facts.push('temporary-record');
        if(term==='岗位职责')state.waiting=true;
        renderPage(response.page);revealRecordLinks();
        if(!silent || (resume && term==='岗位职责')) {
          const heard=state.heard[response.id]||0;
          entries=[...response.words.slice(heard).map(text=>({text,reply:true})),...response.queries.filter(q=>canOffer(normalize(q)))];
          if(heard<response.words.length) {
            if(!state.pending.some(p=>p.term===term&&p.variant===response.variant))state.pending=[...state.pending,{term,variant:response.variant,query}].slice(-12);
            delivery={id:response.id};
          }
        }
        document.body.classList.toggle('archive-mode',!!response.page);
        document.body.classList.toggle('silence-mode',state.seen.includes('岗位职责'));
      }
      state.history=[...state.history.filter(q=>q!==query),query].slice(-12);
      rememberView({query,term:clue?term:'',kind,variant:response?.variant||'base',lookup:kind==='normal'?lastNormal.lookup:'',anomalous:kind==='normal'&&lastNormal.anomalous});
      $('#results').classList.remove('is-loading');$('#results').setAttribute('aria-busy','false');$('#results').inert=false;
      $('#search-form').classList.remove('is-searching');$('.search-submit').setAttribute('aria-label','查找失物');
      setMeta(`检索关键词：${query} · ${count===null?'索引读取完成':`找到 ${count} 条登记`}`);
      suggestions(entries,query,true,delivery || {id:null});animateResults();renderTrail();save();
      announce('查询完成，记录与查询建议已经更新。');
    },380);
  }
  function home(all = false, remember = true) {
    cancelPending();activeQuery='';state.screen=all?'all':'home';
    $('#results-title').textContent=all?'失物大厅':'最近拾获';$('#result-meta').hidden=true;
    showSuggestions(false);$('#search').value='';board();animateResults();
    document.body.classList.remove('archive-mode');
    document.body.classList.toggle('silence-mode',state.seen.includes('岗位职责')&&!state.ending);
    $('#search').placeholder=state.ending==='claimed'?'输入你捡到的东西':'试试搜索：钱包、钥匙、校园卡……';
    $('#staff-count').textContent=state.ending==='left'?'本站员工：0':'本站员工：1';
    document.querySelectorAll('.nav').forEach(button=>{const active=button.dataset.nav===(all?'all':'home');button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    if(remember&&!state.ending){rememberView({kind:'home',query:all?'失物大厅':'首页',term:'',variant:all?'all':'home'});state.screen=all?'all':'home';save();}
    renderTrail();
  }
  function restoreCurrent() {
    const screen=state.screen,view=currentView();
    home(screen==='all',false);
    if(state.ending || screen!=='query' || !view || view.kind==='home')return;
    activeQuery=view.query;state.screen='query';$('#search').value=view.query;$('#results-title').textContent='查询记录';
    if(view.kind==='clue'&&state.seen.includes(view.term)){const response=responseFor(view.term,view.variant);renderPage(response.page);revealRecordLinks();document.body.classList.toggle('archive-mode',!!response.page);}
    else if(view.kind==='normal'){const matches=matchesFor(view.lookup||view.query);if(matches.length||view.anomalous)board(matches,view.anomalous);else emptySearch();}
    else errorPage(view.kind==='blocked');
    setMeta(`已保存的查询：${view.query}`);suggestions(view.words.filter(e=>e.text!==view.query||e.reply),view.query,false);animateResults();renderTrail();
  }
  function navigateView(offset) {
    const index=state.viewCursor+offset;if(state.ending||index<0||index>=state.views.length)return;
    cancelPending();state.viewCursor=index;const view=currentView();state.screen=view.kind==='home'?(view.variant==='all'?'all':'home'):'query';restoreCurrent();save();
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
    if (typeof $('#intro').showModal !== 'function') return; // 独立说明页仍可使用。
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
      else modal('异常登记 / 原始备注', '<h2>未分类登记 / 0001</h2><dl class="detail-list"><dt>物品名称</dt><dd>未填写</dd><dt>原始备注</dt><dd>帮帮我。</dd><dt>登记来源</dt><dd>人工补录</dd></dl><p>这条备注没有描述物品。你可以在搜索框中询问登记人，也可以返回正常登记继续查找。</p><button class="record-action" data-search="你是谁">询问：你是谁？ &gt;&gt;</button>');
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
  function reviewClaim(name, reason) {
    if(claimReview || submitting || state.ending)return;
    cancelPending();if(!save())return;
    modal('认领申请 · 提交前核对', `<h2>请核对本次申请</h2><dl class="detail-list"><dt>认领对象</dt><dd>小鹿 / 客服 0001</dd><dt>认领人</dt><dd>${escape(name)}</dd><dt>认领理由</dt><dd>${escape(reason)}</dd></dl><p>本申请按完整附则生效。确认提交后，本次认领不可撤回；现在关闭此窗口，仍可继续查阅和修改草稿。</p><div class="detail-actions"><button class="record-action" id="confirm-claim" type="button">确认提交本次认领</button><button class="text-link" id="cancel-review" type="button">返回修改 / 继续查阅</button></div>`);
    claimReview={name,reason};
  }
  function reviewLeave() {
    if(state.ending)return;
    cancelPending();
    modal('认领申请 · 放弃查询', '<h2>结束本次认领？</h2><p>确认后，这份人工补录与特殊认领申请将不再继续。已经查阅的内容仍保存在本机。只关闭本窗口或浏览器，会保留草稿。</p><div class="detail-actions"><button class="record-action" id="confirm-leave" type="button">确认放弃本次认领</button><button class="text-link" id="cancel-review" type="button">暂不决定，继续查阅</button></div>');
  }
  function transfer(name) {
    if (submitting || state.ending) return;
    submitting = true; cancelPending();
    state.name = name; state.ending = 'claimed'; state.waiting = false; state.draft = fresh().draft; if(!save()){submitting=false;return;}
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
    cancelPending(); state.ending = 'left'; state.waiting = false; state.draft = fresh().draft; if(!save())return;
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
    if (event.key === 'Escape') { $('#search').focus(); suggestionId++; showSuggestions(false); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-section')) { suggestionId++; showSuggestions(false); }
    if (event.target.closest('#leave')) reviewLeave();
  });
  $('#close-modal').addEventListener('click', () => $('#modal').close());
  $('#modal').addEventListener('click', event => {
    if(event.target.closest('#cancel-review')) {$('#modal').close();return;}
    if(event.target.closest('#confirm-claim')) {const review=claimReview;if(!review||state.ending)return;$('#modal').close();claimReview=null;transfer(review.name);return;}
    if(event.target.closest('#confirm-leave')) {if(state.ending)return;$('#modal').close();leave();return;}
    if (event.target === $('#modal')) {
      const r = $('#modal').getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#modal').close();
    }
    if (event.target.closest('#confirm-reset')) {
      cancelPending(); endingId++; submitting = false; state = fresh(); save({force:true});
      introSeen = false;
      try { localStorage.removeItem(introKey); } catch { storageAvailable = false; }
      $('#modal').close(); home(); openIntro(); toast('本机记录已清除，可以重新开始寻找。');
    }
  });
  $('#modal').addEventListener('close', () => { claimReview=null; if (modalTrigger?.isConnected) modalTrigger.focus({ preventScroll: true }); });
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
    state.original = property; closeIntro(); search(property); $('#search').focus({ preventScroll: true });
  });
  $('#resume-reply').addEventListener('click',()=>{const pending=pendingResponses()[0];if(pending){search(pending.query,{resume:true});$('#search').focus({preventScroll:true});}});
  $('#query-back').addEventListener('click',()=>navigateView(-1));
  $('#query-forward').addEventListener('click',()=>navigateView(1));
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
      reviewClaim(name,String(values.get('reason')).trim()); return;
    }
    if (form.id === 'ordinary-claim-form') {
      if (String(values.get('proof') || '').trim().length < 6) { formError(form,'请至少填写 6 个字的物品特征。',form.elements.proof); return; }
      const id = form.dataset.id;
      if (!allItems().some(item => item.id === id)) return;
      state.applications[id] = { receipt: `ZH-R-${Date.now().toString().slice(-8)}` }; if(!save())return;
      ordinaryClaim(id); home(true); toast('本机申请已留存。'); return;
    }
    for (const field of ['place','description']) if (!String(values.get(field) || '').trim()) { formError(form,'请完整填写拾获地点与物品描述。',form.elements[field]); return; }
    if (state.registrations.length >= 50) { formError(form,'本机登记已达 50 条，请清除本机记录后重试。',nameField); return; }
    const id = `L${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    state.registrations.unshift({ id, name, place: String(values.get('place')).trim(), description: String(values.get('description')).trim(), type: String(values.get('type')), date: new Date().toLocaleDateString('sv-SE'), icon:'card' }); if(!save())return;
    $('#modal').close(); home(true); $('.results-area').scrollIntoView({behavior: reduceMotion.matches ? 'instant' : 'smooth'});
    toast(storageAvailable ? '拾物信息已保存到当前浏览器。' : '拾物信息已保存到本页，浏览器未允许持久保存。');
  });
  window.addEventListener('pagehide', () => { cancelPending(); save({quiet:true}); });
  window.addEventListener('pageshow', event => {
    if(event.persisted){ try{const raw=localStorage.getItem(key);if(raw)state=readState(raw);}catch{} if($('#ending').open)$('#ending').close();restoreCurrent();}
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    cancelPending(); endingId++; submitting = false;
    state = readState(event.newValue);
    if ($('#modal').open) $('#modal').close();
    if ($('#ending').open) $('#ending').close();
    if ($('#intro').open) closeIntro();
    claimReview=null;restoreCurrent();toast('本机记录已在另一个页面更新。');
  });
  restoreCurrent();
  if (!introSeen && !hasStarted()) openIntro();
  if (!storageAvailable) toast('浏览器未允许本地保存，本次进度仅在当前页面有效。');
})();
