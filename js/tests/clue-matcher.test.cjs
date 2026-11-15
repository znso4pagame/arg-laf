const {test}=require('node:test');
const assert=require('node:assert/strict');
const matcher=require('../clue-matcher.js');

test('50%、70%、完整匹配严格进入三个等级',()=>{
  assert.equal(matcher.similarity('AB','ABCD'),.5);
  assert.equal(matcher.reveal('ABC',.4999).stage,'');
  assert.deepEqual(matcher.reveal('ABC',.5),{level:1,stage:'A',text:'A□□'});
  assert.deepEqual(matcher.reveal('ABC',.7),{level:2,stage:'AB',text:'AB□'});
  assert.deepEqual(matcher.reveal('ABC',1),{level:3,stage:'ABC',text:'ABC'});
});

test('漏字、错字、相邻交换可提示，但不被当成完整匹配',()=>{
  for(const input of ['入职记','入职纪录','入职录记']) {
    const score=matcher.similarity(input,'入职记录');assert.equal(score,.75);
    assert.equal(matcher.reveal('入职记录',score).stage,'AB');
  }
});

test('字符标准化兼容全角、大小写、空格与标点',()=>{
  assert.equal(matcher.similarity(' Ｂ — ３？','B3'),1);
  assert.equal(matcher.similarity('HARROW  HOUSE','Harrow House'),1);
  assert.equal(matcher.similarity('入，职 记录','入职记录'),1);
  assert.equal(matcher.similarity('','ABC'),0);
  assert.equal(matcher.similarity('？　','ABC'),0);
});

test('部分匹配的短词仍保留遮挡，只有完整匹配才全部显示',()=>{
  assert.equal(matcher.reveal('B3',.7).text,'B□');
  assert.equal(matcher.reveal('审核',.99).text,'审□');
  assert.equal(matcher.reveal('B3',1).text,'B3');
});

test('只比较传入候选，相同分数保留多个方向',()=>{
  const candidates=[{key:'a',label:'ABC'},{key:'b',label:'ABD'}];
  const result=matcher.rank('AB',candidates);
  assert.equal(result.length,2);assert.ok(result.every(x=>x.stage==='A'));
  assert.deepEqual(matcher.rank('完全无关',candidates),[]);
  assert.equal(matcher.rank('ABC',candidates)[0].key,'a');
});

test('同义写法匹配同一候选，不修改传入数据且限制输入规模',()=>{
  const candidate={key:'name',label:'小鹿',forms:['我是小鹿']};
  const before=JSON.stringify(candidate);
  assert.equal(matcher.rank('我是小鹿',[candidate])[0].stage,'ABC');
  assert.equal(JSON.stringify(candidate),before);
  assert.equal(Array.from(matcher.fold('入'.repeat(10000))).length,80);
});

test('部分别名沿用别名片段，避免无关规范名称泄露；纠错区分相邻交换',()=>{
 const candidates=[{key:'draft',label:'未发送的草稿',forms:['danny-note']}];
 const partial=matcher.rank('danny-not',candidates)[0];
 assert.match(partial.text,/^dan/);assert.ok(partial.text.includes('□'));
 assert.equal(matcher.rank('danny-note',candidates)[0].text,'未发送的草稿');
 assert.equal(matcher.difference('入职录记','入职记录'),'order');
});
