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
function boot(t, { saved, reduced = false, storageBlocked = false, showOpening = false, introSeen = false, navType = 'navigate', guideReturn = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://zhaohui.test/html/index.html', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, errors = [];
  let time = 0, serial = 0;
  const timers = new Map();
  w.setTimeout = (fn, delay = 0) => { const id = ++serial; timers.set(id, { fn, due: time + delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.matchMedia = () => ({ matches: reduced });
  w.scrollTo = () => {};
  w.performance.getEntriesByType = type => type === 'navigation' ? [{type:navType}] : [];
  if (guideReturn) w.sessionStorage.setItem('zhaohui-guide-return','1');
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.addEventListener('error', event => errors.push(event.error));
  if (saved) w.localStorage.setItem(storageKey, typeof saved === 'string' ? saved : JSON.stringify(saved));
  if (introSeen) w.localStorage.setItem('zhaohui-intro-v1', 'read');
  if (storageBlocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage denied'); } });
  source.forEach(s => w.eval(s));
  // 既有回归用例从自主查档开始；开场用例保留真实首次进入状态。
  if (!showOpening && d.querySelector('#intro').open) d.querySelector('#intro-skip').click();
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
  const route = () => ['钱包','你是谁','小鹿','你在哪','B3','入职记录','0002','0003','骗我','上一个','他问了什么','他走了','我的东西','审核','认领表'].forEach(q => search(q));
  return { w, d, $, click, tick, input, submit, search, state, route };
}

test('入站小记是独立 HTML 链接，禁用脚本也能阅读和返回', t => {
  const a=boot(t);
  assert.equal(a.$('#read-intro').tagName,'A');
  assert.equal(a.$('#read-intro').getAttribute('href'),'guide.html');
  const guide=new JSDOM(fs.readFileSync(path.join(root,'html/guide.html'),'utf8'));
  assert.equal(guide.window.document.querySelectorAll('script').length,0);
  assert.match(guide.window.document.body.textContent,/初次使用须知/);
  assert.ok(guide.window.document.querySelector('a[href="index.html#search"]'));
  assert.doesNotMatch(guide.window.document.body.textContent,/小鹿|B3|岗位职责/);
  guide.window.close();
});

test('首屏和本地资源完整，源码无需构建即可使用',t=>{
  const a=boot(t);assert.equal(a.d.querySelectorAll('.item').length,4);
  for(const el of a.d.querySelectorAll('link[href],script[src]')) assert.ok(fs.existsSync(path.resolve(root,'html',el.getAttribute('href')||el.getAttribute('src'))));
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/url=html\/index.html/);
  assert.ok(a.$('link[href="../css/portal.css"]'));
});

test('最新查询获胜；输入和返回首页会取消未完成的查询',t=>{
  const a=boot(t);a.search('钱包',false);assert.equal(a.$('#results').getAttribute('aria-busy'),'true');
  a.tick(200);a.search('钥匙',false);a.tick(400);
  assert.match(a.$('#result-meta').textContent,/钥匙/);assert.doesNotMatch(a.$('#results').textContent,/棕色皮质钱包/);
  assert.equal(a.state().original,'钥匙');
  a.search('你是谁',false);a.input('#search','未提交');a.tick();assert.equal(a.state().seen.length,0);
  a.search('你是谁',false);a.click('[data-nav="home"]');a.tick();assert.equal(a.d.querySelectorAll('.item').length,4);
});

test('寒暄和任意句子不会生成异常卡或污染失物名称',t=>{
  const a=boot(t);
  for(const q of ['你好','天气','工资','救我','你好？','随便一段话']) {a.search(q);assert.equal(a.$('.anomaly'),null);assert.equal(a.state().original,'');}
  a.search('钱包');assert.ok(a.$('.anomaly'));assert.equal(a.state().original,'钱包');
});

test('异常登记先展示原始备注，玩家再主动询问身份',t=>{
  const a=boot(t);a.search('钱包');a.click('[data-item="0001"]');
  assert.equal(a.$('#modal').open,true);assert.match(a.$('#modal-body').textContent,/帮帮我/);assert.equal(a.state().seen.length,0);
  a.click('#modal [data-search="你是谁"]');a.tick();assert.equal(a.$('#modal').open,false);
  assert.match(a.$('#suggestions').textContent,/我是小鹿/);assert.ok(a.state().seen.includes('你是谁'));
});

test('严格按证据开放深层记录，搜索编号本身不能跳过前置证据',t=>{
  const a=boot(t);
  for(const q of ['你是谁','B3','0003','审核','认领表','岗位职责']) {a.search(q);assert.match(a.$('#results').textContent,/404/);assert.equal(a.state().seen.length,0);}
  a.search('钱包');a.search('你是谁');a.search('0003');assert.match(a.$('#results').textContent,/404/);
  assert.equal(a.state().seen.includes('0003'),false);
  a.search('你在哪');a.search('B3');assert.match(a.$('#results').textContent,/工牌登记/);
  a.search('0003');assert.equal(a.state().seen.includes('0003'),false);
  a.search('入职记录');a.search('0002');a.search('0003');assert.match(a.$('#results').textContent,/后续登记/);
});

test('台词不会偷换成别的问题；重复检索仍有可用的相关查询',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');
  for(const q of ['你丢了什么','我在这里五年了','那是我的工牌','你会变成我']) {
    const before=a.state().seen.slice();a.search(q);assert.deepEqual(a.state().seen,before);assert.match(a.$('#results').textContent,/404/);
  }
  a.search('你是谁');assert.doesNotMatch(a.$('#suggestions').textContent,/我是小鹿/);
  assert.match(a.$('#suggestions').textContent,/你在哪/);
  a.search('小鹿');assert.ok(a.state().seen.includes('我是小鹿'));
});

test('回复逐条出现，改查另一个词后不会混入旧回复',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁',false);a.tick(400);
  assert.equal(a.$('#suggestions').children.length,1);
  a.tick(520);assert.match(a.$('#suggestions').textContent,/我是小鹿/);
  a.search('天气');assert.doesNotMatch(a.$('#suggestions').textContent,/我是小鹿/);
});

test('编号关系只构成疑点，职责移交不会在缓存前被提前解释',t=>{
  const a=boot(t);
  for(const q of ['钱包','你是谁','你在哪','B3','入职记录','0002','0003','骗我']) {
    a.search(q);assert.doesNotMatch(a.$('#results').textContent+a.$('#suggestions').textContent,/你就是下一个|接替客服岗位|你会变成我/);
  }
  a.search('0002');assert.match(a.$('#results').textContent,/Q-17/);assert.doesNotMatch(a.$('#results').textContent,/Danny/);
  a.search('0003');assert.match(a.$('#results').textContent,/物品名称Q-17/);
});

test('Danny 是独立访客；拒签不会又被写成完成了岗位移交',t=>{
  const a=boot(t);a.route();a.search('上一个');
  assert.match(a.$('#results').textContent,/D-2019/);assert.match(a.$('#results').textContent,/不是 0002 的签收人/);
  a.search('他问了什么');assert.match(a.$('#results').textContent,/那你告诉我实话/);
  assert.match(a.$('#results').textContent,/没有发生岗位移交/);assert.match(a.$('#results').textContent,/提交记录：无/);
});

test('从失物暂存到特殊人员申请有明确核验与对象变更',t=>{
  const a=boot(t);a.route();a.search('我的东西');
  assert.match(a.$('#results').textContent,/客服人工补录，尚未核验/);assert.match(a.$('#results').textContent,/钱包/);
  a.search('审核');assert.match(a.$('#results').textContent,/两项申请没有自动关联/);
  a.search('认领表');assert.match(a.$('#results').textContent,/不是你遗失的物品/);
  assert.equal(a.$('#claim-form input[readonly]').value,'客服 0001');assert.equal(a.state().waiting,false);
  a.search('免责条款');assert.match(a.$('#results').textContent,/生效条件/);
  a.search('岗位职责');assert.match(a.$('#results').textContent,/接替客服岗位/);assert.equal(a.state().waiting,true);
});

test('普通导航都保留进度，不会猜测玩家是否决定放弃',t=>{
  const a=boot(t);a.route();a.input('[name="claimant"]','测试玩家');a.input('[name="reason"]','核对后决定');
  const b=boot(t,{saved:a.state(),navType:'reload'});assert.equal(b.state()?.ending||'','');
  b.search('认领表');assert.equal(b.$('[name="claimant"]').value,'测试玩家');
  b.search('岗位职责');const armed=b.state();
  const c=boot(t,{saved:armed,navType:'reload'});assert.equal(c.$('#staff-count').textContent,'本站员工：1');
  const d=boot(t,{saved:armed,navType:'navigate',guideReturn:true});assert.equal(d.$('#staff-count').textContent,'本站员工：1');
  const e=boot(t,{saved:armed,navType:'navigate'});assert.equal(e.$('#staff-count').textContent,'本站员工：1');
});

test('表格草稿与返回入口独立于“已摊牌”状态',t=>{
  const a=boot(t);a.route();a.input('[name="claimant"]','测试玩家');a.input('[name="reason"]','测试理由');
  a.search('免责条款');assert.equal(a.$('#return-claim').hidden,false);assert.equal(a.state().waiting,false);
  a.click('#return-claim');a.tick();assert.equal(a.$('[name="reason"]').value,'测试理由');
  a.click('.brand');a.click('#return-claim');a.tick();assert.equal(a.$('[name="claimant"]').value,'测试玩家');
});

test('浏览器前进后退恢复保持待决定状态',t=>{
  const a=boot(t);a.route();
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:true}));
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(a.$('#staff-count').textContent,'本站员工：1');
  a.search('岗位职责');a.w.sessionStorage.setItem('zhaohui-guide-return','1');
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(a.$('#staff-count').textContent,'本站员工：1');
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide',{persisted:true}));
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(a.$('#staff-count').textContent,'本站员工：1');
});

test('最终沉默不再说话，已开放记录与最终选择仍可访问',t=>{
  const a=boot(t);a.route();a.search('岗位职责');a.search('为什么');
  assert.equal(a.$('#suggestions').children.length,1);assert.equal(a.$('#field-guide').hidden,true);
  a.search('0002');assert.match(a.$('#results').textContent,/Q-17/);
  a.click('#return-claim');a.tick();assert.ok(a.$('#claim-form'));
});

test('认领防止空白和重复提交；转场结束后姓名按文本显示',t=>{
  const a=boot(t);a.route();a.input('[name="claimant"]','  ');a.input('[name="reason"]','测试');a.submit('#claim-form');
  assert.equal(a.$('#claim-error').hidden,false);assert.equal(a.state().ending,'');
  a.input('[name="claimant"]','玩家 <img src=x>');a.submit('#claim-form');a.submit('#claim-form');
  assert.equal(a.state().ending,'');assert.ok(a.$('#confirm-claim'));a.click('#confirm-claim');
  assert.equal(a.state().ending,'claimed');assert.equal(a.$('#ending').open,true);assert.equal(a.$('#ending-reveal').hidden,true);
  a.tick(900);assert.match(a.$('#ending-status').textContent,/移交岗位/);a.tick(1500);assert.equal(a.$('#ending-reveal').hidden,false);
  a.click('#return-home');assert.equal(a.$('#ending').open,false);assert.equal(a.$('#results img'),null);
  assert.match(a.$('#results').textContent,/玩家 <img src=x>/);assert.equal(a.$('#search').placeholder,'输入你捡到的东西');
});

test('显式放弃可在知晓真相之前选择，且终局不再返回异常',t=>{
  const a=boot(t);a.route();a.click('#leave');assert.equal(a.state().ending,'');a.click('#confirm-leave');assert.equal(a.$('#staff-count').textContent,'本站员工：0');
  a.search('钱包');assert.equal(a.$('.anomaly'),null);a.search('小鹿');assert.match(a.$('#results').textContent,/没有找到/);
});

test('提示路线有实际证据支持，能从头到尾走通且没有死循环',t=>{
  const a=boot(t);const visited=[];
  for(let i=0;i<24;i++) {
    if(a.$('#field-guide').hidden)break;
    a.click('#hint-toggle');while(!a.$('#hint-next').hidden)a.click('#hint-next');
    const q=a.$('#hint-search').dataset.search;assert.ok(q);assert.ok(!visited.includes(q),q+' 不重复');
    visited.push(q);a.click('#hint-search');a.tick();
  }
  assert.equal(visited.at(-1),'岗位职责');assert.ok(visited.includes('他走了'));assert.ok(visited.includes('审核'));
  assert.equal(a.$('#field-guide').hidden,true);
});

test('拒绝提前词条和重复查询不会推进提示层级',t=>{
  const a=boot(t);a.search('钱包');a.click('#hint-toggle');a.click('#hint-next');a.click('#hint-toggle');
  a.search('岗位职责');assert.equal(a.$('#field-guide').dataset.hint,'identity');assert.equal(a.$('#hint-content').hidden,true);
  a.click('#hint-toggle');assert.match(a.$('#hint-tier').textContent,/第 2 级/);
  a.search('你是谁');assert.equal(a.$('#hint-content').hidden,true);assert.equal(a.$('#hint-search').hasAttribute('data-search'),false);
});

test('招聘与 E 类支线可从实际线索到达，不会绕过主线证据',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');a.search('为什么');a.search('招聘广告');a.search('合同');a.search('B3');
  assert.match(a.$('#results').textContent,/原始登记日期2019-06-11/);
  for(const q of ['入职记录','0002','0003','别的办法','改分类','elias rook','Ｈａｒｒｏｗ　Ｈｏｕｓｅ'])a.search(q);
  assert.match(a.$('#results').textContent,/1974-11-03/);
  a.search('认领表');assert.equal(a.$('#claim-form'),null);
});

test('普通拾物登记与申请可保存，不改变特殊认领进度',t=>{
  const a=boot(t);a.click('[data-nav="register"]');
  for(const [name,value]of Object.entries({name:'银色戒指',place:'教学楼',description:'内侧刻有一行字'}))a.input(`#register-form [name="${name}"]`,value);
  a.submit('#register-form');const id=a.state().registrations[0].id;
  a.click(`[data-item="${id}"]`);a.click(`[data-apply="${id}"]`);a.input('#ordinary-claim-form [name="name"]','测试失主');a.input('#ordinary-claim-form [name="proof"]','内侧刻有一行英文');a.submit('#ordinary-claim-form');
  assert.match(a.$('#modal-body').textContent,/回执编号/);assert.equal(a.state().ending,'');
  const b=boot(t,{saved:a.state()});assert.match(b.$('#results').textContent,/银色戒指/);
});

test('输入法组合输入、方向键和 Escape 不误触剧情',t=>{
  const a=boot(t);a.search('钱包');a.$('#search').dispatchEvent(new a.w.CompositionEvent('compositionstart',{bubbles:true}));
  a.input('#search','你是谁');a.submit('#search-form');a.tick();assert.equal(a.state().seen.length,0);
  a.$('#search').dispatchEvent(new a.w.CompositionEvent('compositionend',{bubbles:true}));a.submit('#search-form');a.tick();
  a.$('#search').focus();a.$('#search').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(a.d.activeElement,a.$('#suggestions button'));
  a.d.activeElement.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(a.$('#suggestions').hidden,true);
});

test('旧版存档迁移不清除数据，也不因旧的 waiting 标志误结局',t=>{
  const a=boot(t,{saved:{seen:['认领表'],waiting:true,level:3,original:'钥匙',draft:{name:'旧玩家',reason:'保留'}}});
  assert.equal(a.$('#staff-count').textContent,'本站员工：1');a.search('认领表');
  assert.equal(a.$('[name="claimant"]').value,'旧玩家');assert.equal(a.state().schema,4);assert.equal(a.state().waiting,false);
  assert.ok(a.state().seen.includes('审核'));assert.equal(a.state().original,'钥匙');
});

test('跨页更新取消旧请求，清除记录恢复初次进入',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁',false);
  a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:storageKey,newValue:JSON.stringify({schema:2,seen:[],ending:'left'})}));a.tick();
  assert.equal(a.$('#staff-count').textContent,'本站员工：0');a.click('#reset');a.click('#confirm-reset');
  assert.equal(a.$('#intro').open,true);assert.equal(a.state().ending,'');
});

test('开场可以开始实际查询、略过与恢复；不泄露反转',t=>{
  const a=boot(t,{showOpening:true});assert.equal(a.$('#intro').open,true);assert.doesNotMatch(a.$('#intro').textContent,/小鹿|B3|岗位职责/);
  a.input('#intro-item','  ');a.submit('#intro-form');assert.equal(a.$('#intro-error').hidden,false);
  a.input('#intro-item','围巾');a.submit('#intro-form');a.tick();assert.equal(a.state().original,'围巾');assert.ok(a.$('.anomaly'));
  const b=boot(t,{showOpening:true,introSeen:true});assert.equal(b.$('#intro').open,false);
  const c=boot(t,{showOpening:true});c.$('#intro').dispatchEvent(new c.w.Event('cancel',{cancelable:true}));assert.equal(c.$('#intro').open,false);
});

test('存储受限、坏存档和减少动效设置均可继续',t=>{
  const a=boot(t,{storageBlocked:true});a.search('钱包');assert.ok(a.$('.anomaly'));
  const b=boot(t,{saved:'{broken'});assert.equal(b.d.querySelectorAll('.item').length,4);
  const c=boot(t,{reduced:true});c.route();c.input('[name="claimant"]','测试');c.input('[name="reason"]','测试理由');c.submit('#claim-form');c.click('#confirm-claim');c.tick(0);assert.equal(c.$('#ending-reveal').hidden,false);
});

test('玩家可先追问失物，再自行选择调查档案或查看申请',t=>{
  const a=boot(t);a.search('我的钱包在哪');assert.equal(a.state().original,'钱包');assert.ok(a.$('.anomaly'));
  a.search('你是谁');assert.equal(a.$('#ask-property').hidden,false);a.click('#ask-property');a.tick();
  assert.match(a.$('#results').textContent,/失物查询委托/);assert.equal(a.state().facts.includes('temporary-record'),false);
  a.search('审核');assert.equal(a.state().seen.includes('审核'),false);
  a.search('你在哪');assert.equal(a.$('#field-guide').hidden,false);a.search('b 3');
  a.search('我的钱包呢');assert.match(a.$('#results').textContent,/临时补录/);
  a.search('审核');assert.match(a.$('#suggestions').textContent,/我现在碰不到实物架/);
  assert.equal(a.state().seen.includes('0002'),false);a.search('认领表');assert.ok(a.$('#claim-form'));
  a.search('入职记录');a.search('编号0002');a.search('0003');a.search('审核');
  assert.match(a.$('#suggestions').textContent,/我没有找到你的东西/);
  assert.equal(a.state().original,'钱包');
});

test('询问怎么帮忙会按工牌和申请情境回答，而非跳到无关查询',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');a.search('我该怎么帮你');
  assert.match(a.$('#suggestions').textContent,/先确认我的工牌/);
  a.search('你在哪');a.search('B3');a.search('我应该怎么帮你');
  assert.match(a.$('#suggestions').textContent,/核对之后你再决定/);
  a.search('我的东西');a.search('审核');a.search('怎么帮你');
  assert.match(a.$('#suggestions').textContent,/申请的对象是我/);
});

test('回话是可阅读文本，真正的问题与索引才是可点击项',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');
  assert.match(a.$('.suggestion-response').textContent,/我是小鹿/);
  assert.equal(a.d.querySelectorAll('#suggestions button[data-search="我是小鹿"]').length,0);
  assert.ok(a.$('#suggestions button[data-search="小鹿"]'));
  a.click('#suggestions button[data-search="小鹿"]');a.tick();assert.ok(a.state().seen.includes('我是小鹿'));
});

test('打断一半的回复可以续读，已显示过的句子不会再次发出',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁',false);a.tick(750);
  assert.equal(a.d.querySelectorAll('.suggestion-response').length,1);
  assert.match(a.$('.suggestion-response').textContent,/我是小鹿/);
  a.input('#search','先想一想');a.tick();assert.equal(a.$('#resume-reply').hidden,false);
  a.click('#resume-reply');a.tick();
  assert.doesNotMatch(a.$('#suggestions').textContent,/我是小鹿/);
  assert.match(a.$('#suggestions').textContent,/我只能在这里写字/);
  assert.equal(a.state().heard['你是谁:base'],2);
  a.search('你是谁');assert.equal(a.d.querySelectorAll('.suggestion-response').length,0);
});

test('刷新保留已显示的记录和未读提示，恢复本身不推进剧情',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁',false);a.tick(750);
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide'));
  const saved=a.state();const b=boot(t,{saved,navType:'reload'});
  assert.equal(b.$('#search').value,'你是谁');assert.match(b.$('#suggestions').textContent,/我是小鹿/);
  assert.equal(b.$('#resume-reply').hidden,false);b.click('#resume-reply');b.tick();
  assert.match(b.$('#suggestions').textContent,/我只能在这里写字/);
  assert.deepEqual(b.state().seen,saved.seen);
  b.search('你在哪');b.search('B3');const before=b.state();
  const c=boot(t,{saved:before,navType:'navigate'});
  assert.match(c.$('#results').textContent,/工牌登记/);assert.equal(c.$('#search').value,'B3');
  assert.equal(c.$('#staff-count').textContent,'本站员工：1');
});

test('上一条和下一条查询恢复缓存，不重播回应、不改变已知证据',t=>{
  const a=boot(t);a.route();const before=a.state();
  a.click('#query-back');assert.equal(a.$('#search').value,'审核');
  assert.match(a.$('#results').textContent,/审核结果/);
  a.click('#query-forward');assert.ok(a.$('#claim-form'));
  assert.deepEqual(a.state().seen,before.seen);assert.deepEqual(a.state().heard,before.heard);
  a.click('#query-back');a.search('入职记录');assert.equal(a.$('#query-forward').disabled,true);
});

test('最终回应被打断仍可续读，沉默不会吞掉还未显示的最后几句',t=>{
  const a=boot(t);a.route();a.search('岗位职责',false);a.tick(400);
  a.search('为什么');assert.equal(a.$('#resume-reply').hidden,false);
  a.click('#resume-reply');a.tick();assert.match(a.$('#suggestions').textContent,/你自己选/);
  assert.equal(a.state().heard['岗位职责:base'],4);
  a.search('为什么');assert.equal(a.d.querySelectorAll('.suggestion-response').length,0);
});

test('提交前可返回修改，放弃前可取消，两种操作都不会误入结局',t=>{
  const a=boot(t);a.route();a.input('[name="claimant"]','测试玩家');a.input('[name="reason"]','先核对');a.submit('#claim-form');
  assert.equal(a.state().ending,'');assert.match(a.$('#modal-body').textContent,/测试玩家/);
  a.click('#cancel-review');assert.equal(a.$('[name="claimant"]').value,'测试玩家');
  a.click('#leave');a.click('#cancel-review');assert.equal(a.state().ending,'');
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide'));
  const b=boot(t,{saved:a.state(),navType:'navigate'});assert.ok(b.$('#claim-form'));assert.equal(b.state().ending,'');
  b.click('#leave');b.click('#confirm-leave');assert.equal(b.$('#staff-count').textContent,'本站员工：0');
});

test('旧页面离开时不能覆盖另一个页面已经完成的结局或重置',async t=>{
  const a=boot(t);a.route();const old=a.state();
  const newer={...old,revision:old.revision+5,ending:'left',waiting:false};
  a.w.localStorage.setItem(storageKey,JSON.stringify(newer));a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide'));
  assert.equal(a.state().ending,'left');assert.equal(a.state().revision,newer.revision);
  a.input('[name="claimant"]','旧页面');await Promise.resolve();
  assert.equal(a.$('#staff-count').textContent,'本站员工：0');assert.equal(a.state().ending,'left');
  const reset={...newer,revision:newer.revision+1,ending:'',original:'',seen:[],views:[],pending:[],heard:{},facts:[],leads:[],screen:'home'};
  a.w.localStorage.setItem(storageKey,JSON.stringify(reset));a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide'));
  assert.equal(a.state().ending,'');assert.equal(a.state().original,'');assert.equal(a.state().revision,reset.revision);
});

test('提交核对窗口打开后，旧页面也不能覆盖另一页新完成的决定',async t=>{
  const a=boot(t);a.route();a.input('[name="claimant"]','旧页面');a.input('[name="reason"]','测试');a.submit('#claim-form');
  const newer={...a.state(),revision:a.state().revision+1,ending:'left',waiting:false};
  a.w.localStorage.setItem(storageKey,JSON.stringify(newer));a.click('#confirm-claim');await Promise.resolve();
  assert.equal(a.state().ending,'left');assert.equal(a.$('#ending').open,false);assert.equal(a.$('#staff-count').textContent,'本站员工：0');
});

test('尚未返回的首次物品搜索不构成发现异常，损坏存档仍能重新保存',t=>{
  const a=boot(t,{showOpening:true});a.input('#intro-item','围巾');a.submit('#intro-form');
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pagehide'));const b=boot(t,{saved:a.state()});
  assert.equal(b.$('#field-guide').dataset.hint,'start');b.search('你是谁');assert.equal(b.state().seen.length,0);
  const c=boot(t,{saved:'{broken'});c.search('钱包');assert.equal(c.state().anomalySeen,true);
});

test('只提交地点问题不算看到楼层线索，用户输入不能自己变成证据',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');a.search('你在哪',false);a.tick(400);
  assert.equal(a.state().leads.includes('B3'),false);
  a.search('B3');assert.equal(a.state().seen.includes('B3'),false);assert.equal(a.state().leads.includes('B3'),false);
  a.click('#resume-reply');a.tick();assert.equal(a.state().leads.includes('B3'),true);
  a.click('#suggestions button[data-search="B3"]');a.tick();assert.match(a.$('#results').textContent,/工牌登记/);
});

test('玩家可以直接追问认领代价，不必猜中“岗位职责”这个词',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');a.search('如果我认领你会怎样');
  assert.match(a.$('#suggestions').textContent,/先确认我留下的工牌/);assert.equal(a.state().seen.includes('岗位职责'),false);
  a.search('你在哪');a.search('B3');a.search('我的东西');a.search('审核');a.search('我认领你之后会怎么样');
  assert.match(a.$('#suggestions').textContent,/完整附则就在申请里/);
  a.search('认领表');a.search('我认领你之后，我会怎么样？');
  assert.match(a.$('#results').textContent,/接替客服岗位/);assert.equal(a.state().seen.includes('岗位职责'),true);
});

test('搜索“不签”或离开相关措辞只是提问，不会替玩家触发放弃',t=>{
  const a=boot(t);a.search('钱包');a.search('你是谁');a.search('不签');
  assert.match(a.$('#suggestions').textContent,/我会等/);assert.equal(a.state().ending,'');
  a.route();a.search('不填');assert.equal(a.state().ending,'');
  a.search('我要关了');assert.equal(a.state().ending,'');
  a.search('认领表');a.click('#leave');assert.equal(a.state().ending,'');a.click('#cancel-review');assert.equal(a.state().ending,'');
});

test('线上打包包含独立说明页和内容指纹，所有引用都能解析',()=>{
  const os=require('node:os');const crypto=require('node:crypto');const {buildSite}=require('../build-pages.cjs');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhaohui-build-'));const out=path.join(temp,'site');
  try {
    const manifest=buildSite(out);const built=fs.readFileSync(path.join(out,'html/index.html'),'utf8');
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'js/app.js'))).digest('hex').slice(0,12);
    assert.equal(manifest['js/app.js'],`js/app.${digest}.js`);
    assert.ok(built.includes(`../${manifest['js/app.js']}`));assert.ok(fs.existsSync(path.join(out,'html/guide.html')));
    const doc=new JSDOM(built);
    for(const el of doc.window.document.querySelectorAll('link[href],script[src]'))assert.ok(fs.existsSync(path.resolve(out,'html',el.getAttribute('href')||el.getAttribute('src'))));
    assert.equal(fs.existsSync(path.join(out,'js/tests')),false);assert.equal(fs.existsSync(path.join(out,'ARG storyline.docx')),false);
    doc.window.close();
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
