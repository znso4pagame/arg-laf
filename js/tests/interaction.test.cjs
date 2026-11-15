const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const storageKey = 'zhaohui-story-v1';
const html = fs.readFileSync(path.join(root, 'html/index.html'), 'utf8');
const source = ['js/data.js', 'js/app.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'));

// 离线执行真实 DOM 事件。虚拟时钟让取消请求、逐条建议和转场可确定地验证。
function boot(t, { saved, reduced = false, storageBlocked = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://zhaohui.test/html/index.html', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, errors = [];
  let time = 0, serial = 0;
  const timers = new Map();
  w.setTimeout = (fn, delay = 0) => { const id = ++serial; timers.set(id, { fn, due: time + delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.matchMedia = () => ({ matches: reduced });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.addEventListener('error', event => errors.push(event.error));
  if (saved) w.localStorage.setItem(storageKey, typeof saved === 'string' ? saved : JSON.stringify(saved));
  if (storageBlocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage denied'); } });
  source.forEach(s => w.eval(s));
  t.after(() => { assert.deepEqual(errors, [], '没有未处理的 DOM 异常'); dom.window.close(); });
  const $ = selector => d.querySelector(selector);
  const click = selector => { const target = $(selector); assert.ok(target, `存在控件 ${selector}`); target.click(); };
  const tick = (ms = 3000) => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([,v]) => v.due <= end).sort((a,b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      time = next[1].due; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  };
  const input = (selector, value) => { const el = $(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = selector => $(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const search = (query, flush = true) => { input('#search', query); submit('#search-form'); if (flush) tick(); };
  const state = () => JSON.parse(w.localStorage.getItem(storageKey));
  const route = () => ['钱包','你是谁','我是小鹿','你在哪','B3','入职记录','0002','0003','上一个','他问了什么','我的东西','审核','认领表'].forEach(q => search(q));
  return { w, d, $, click, tick, input, submit, search, state, route };
}

test('初始列表、根入口和文件路径可离线使用', t => {
  const a = boot(t);
  assert.equal(a.d.querySelectorAll('.item').length, 4);
  assert.equal(a.$('#ending').open, false);
  assert.equal(a.$('#history-panel').hidden, true);
  for (const el of a.d.querySelectorAll('link[href],script[src]')) {
    assert.ok(fs.existsSync(path.resolve(root, 'html', el.getAttribute('href') || el.getAttribute('src'))));
  }
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'), /url=html\/index.html/);
});

test('搜索有加载状态，最新请求获胜，旧建议不会迟到', t => {
  const a = boot(t);
  a.search('钱包',false);
  assert.equal(a.$('#results').getAttribute('aria-busy'),'true');
  a.tick(200); a.search('钥匙',false); a.tick(400);
  assert.match(a.$('#result-meta').textContent,/钥匙/);
  assert.doesNotMatch(a.$('#results').textContent,/棕色皮质钱包/);
  assert.equal(a.$('#results').getAttribute('aria-busy'),'false');
  assert.equal(a.state().original,'钥匙');
  a.search('你是谁',false); a.tick(400);
  assert.doesNotMatch(a.$('#suggestions').textContent,/我是小鹿/);
  a.search('天气');
  assert.doesNotMatch(a.$('#suggestions').textContent,/我是小鹿/);
});

test('输入新内容或返回首页能取消检索且不推进故事', t => {
  const a = boot(t);
  a.search('你是谁',false); a.input('#search','尚未提交'); a.tick();
  assert.equal(a.state(),null);
  a.search('B3',false); a.click('[data-nav="home"]'); a.tick();
  assert.equal(a.d.querySelectorAll('.item').length,4);
  assert.equal(a.$('#results-title').textContent,'最近拾获');
});

test('不回应的词保持 404，且不污染最初的失物名称', t => {
  const a = boot(t);
  for (const q of ['你好','天气','系统','工资','救我','谢谢？']) {
    a.search(q); assert.match(a.$('#results').textContent,/404/); assert.equal(a.$('.anomaly'),null);
  }
  a.search('钱包'); assert.equal(a.state().original,'钱包'); assert.match(a.$('#results').textContent,/帮帮我/);
});

test('建议分时出现；同一词条不会重复说话', t => {
  const a = boot(t);
  a.search('你是谁',false); a.tick(400);
  assert.equal(a.$('#suggestions').children.length,1);
  a.tick(520); assert.match(a.$('#suggestions').textContent,/我是小鹿/);
  a.tick(); a.search('你是谁'); assert.equal(a.$('#suggestions').children.length,1);
});

test('完整主线可达；提前搜索终局不会泄露或造成死路', t => {
  const a = boot(t);
  a.search('岗位职责'); assert.doesNotMatch(a.$('#suggestions').textContent,/你就是下一个我/);
  assert.match(a.$('#suggestions').textContent,/你是谁/);
  a.search('b3'); a.search('0003'); a.search('你认领我');
  assert.match(a.$('#suggestions').textContent,/他问了什么/);
  a.search('他问了什么'); assert.match(a.$('#results').textContent,/那你告诉我实话/);
  a.search('认领表'); assert.ok(a.$('#claim-form'));
  a.search('岗位职责'); a.search('为什么'); assert.doesNotMatch(a.$('#suggestions').textContent,/招聘广告/);
  assert.equal(a.$('#return-claim').hidden,false);
  a.click('#return-claim'); a.tick(); assert.ok(a.$('#claim-form'));
});

test('档案支线和时间错位可重访', t => {
  const a = boot(t); a.route();
  a.search('B3'); const first = a.$('#results').textContent;
  a.search('B3'); assert.notEqual(a.$('#results').textContent,first);
  a.search('改分类'); assert.match(a.$('#results').textContent,/以上皆不符合/);
  a.search('elias rook'); assert.match(a.$('#results').textContent,/1974-11-03/);
  a.search('Ｈａｒｒｏｗ　Ｈｏｕｓｅ'); assert.match(a.$('#results').textContent,/建筑结构内部/);
});

test('表单草稿切换档案后恢复，站内首页不触发离开结局', t => {
  const a = boot(t); a.route();
  a.input('[name="claimant"]','测试玩家'); a.input('[name="reason"]','找回一张工牌');
  a.click('.brand'); a.tick(); assert.equal(a.state().ending,'');
  a.click('#return-claim'); a.tick();
  assert.equal(a.$('[name="claimant"]').value,'测试玩家');
  a.search('岗位职责'); a.click('#return-claim'); a.tick();
  assert.equal(a.$('[name="reason"]').value,'找回一张工牌');
});

test('空白姓名不能提交；提交后完整转场且防止双重认领', t => {
  const a = boot(t); a.route();
  a.input('[name="claimant"]','   '); a.input('[name="reason"]','测试认领'); a.submit('#claim-form');
  assert.equal(a.$('#claim-error').hidden,false); assert.equal(a.state().ending,'');
  a.input('[name="claimant"]','玩家 <img src=x onerror=alert(1)>'); a.submit('#claim-form');
  assert.equal(a.state().ending,'claimed'); assert.equal(a.$('#ending').open,true);
  assert.equal(a.$('#ending-reveal').hidden,true); assert.ok(a.$('#claim-form [type="submit"]').disabled);
  a.submit('#claim-form'); a.tick(900); assert.match(a.$('#ending-status').textContent,/移交岗位/);
  a.tick(1500); assert.equal(a.$('#ending-reveal').hidden,false);
  a.click('#return-home'); assert.equal(a.$('#ending').open,false);
  assert.equal(a.$('#search').placeholder,'输入你捡到的东西');
  assert.equal(a.$('#results img'),null); assert.match(a.$('#results').textContent,/玩家 <img/);
  const b = boot(t,{saved:a.state()}); assert.equal(b.$('#search').placeholder,'输入你捡到的东西');
});

test('显式放弃、重开和 BFCache 返回都正确完成离开结局', t => {
  const a = boot(t); a.route(); const saved = a.state();
  a.click('#leave'); assert.equal(a.$('#staff-count').textContent,'本站员工：0');
  a.search('小鹿'); assert.doesNotMatch(a.$('#results').textContent,/帮帮我/);
  const b = boot(t,{saved}); assert.equal(b.$('#staff-count').textContent,'本站员工：0');
  const c = boot(t); c.route();
  c.w.dispatchEvent(new c.w.PageTransitionEvent('pagehide',{persisted:true}));
  c.w.dispatchEvent(new c.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(c.$('#staff-count').textContent,'本站员工：0');
});

test('普通登记与申请回执可跨刷新保留，不触发剧情认领', t => {
  const a = boot(t); a.click('[data-nav="register"]');
  for(const [name,value] of Object.entries({name:'银色戒指',place:'教学楼',description:'内侧有一行字'})) a.input(`#register-form [name="${name}"]`,value);
  a.submit('#register-form'); assert.equal(a.$('#modal').open,false);
  const id=a.state().registrations[0].id; assert.match(a.$('#results').textContent,/银色戒指/);
  a.click(`[data-item="${id}"]`); a.click(`[data-apply="${id}"]`);
  a.input('#ordinary-claim-form [name="name"]','测试失主'); a.input('#ordinary-claim-form [name="proof"]','内侧刻有一行英文'); a.submit('#ordinary-claim-form');
  assert.match(a.$('#modal-body').textContent,/回执编号/); assert.equal(a.state().ending,'');
  const b=boot(t,{saved:a.state()}); assert.match(b.$('#results').textContent,/银色戒指/);
  b.click(`[data-item="${id}"]`); b.click(`[data-apply="${id}"]`); assert.match(b.$('#modal-body').textContent,/ZH-R-/);
});

test('建议键盘操作、Escape 与输入法组合键', t => {
  const a=boot(t); a.search('你是谁'); a.$('#search').focus();
  a.$('#search').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(a.d.activeElement,a.$('#suggestions button'));
  a.d.activeElement.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  assert.equal(a.d.activeElement,a.$('#search'));
  a.$('#search').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); assert.equal(a.$('#suggestions').hidden,true);
  a.$('#search').dispatchEvent(new a.w.CompositionEvent('compositionstart',{bubbles:true}));
  a.input('#search','B3'); a.submit('#search-form'); a.tick(); assert.equal(a.state().level,0);
  a.$('#search').dispatchEvent(new a.w.CompositionEvent('compositionend',{bubbles:true})); a.submit('#search-form'); a.tick(); assert.equal(a.state().level,1);
});

test('跨标签页更新会取消旧请求；清空操作重置本机全部记录', t => {
  const a=boot(t); a.search('B3',false);
  a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:storageKey,newValue:JSON.stringify({seen:[],ending:'left'})})); a.tick();
  assert.equal(a.$('#staff-count').textContent,'本站员工：0'); assert.doesNotMatch(a.$('#results').textContent,/工牌/);
  a.click('#reset'); a.click('#confirm-reset'); a.tick();
  assert.equal(a.state().ending,''); assert.equal(a.state().history.length,0); assert.equal(a.$('#staff-count').textContent,'本站员工：1');
});

test('本地存储受限、损坏数据和减少动态效果均能运行', t => {
  const a=boot(t,{storageBlocked:true}); a.search('钱包'); assert.match(a.$('#results').textContent,/帮帮我/);
  const b=boot(t,{saved:'{broken'}); assert.equal(b.d.querySelectorAll('.item').length,4);
  const c=boot(t,{reduced:true}); c.route(); c.input('[name="claimant"]','测试'); c.input('[name="reason"]','测试理由'); c.submit('#claim-form'); c.tick(0);
  assert.equal(c.$('#ending-reveal').hidden,false);
});
