import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/project-store.js',import.meta.url),'utf8')
  .replace(/^import[^\n]+\n/,'').replace('export const projectStore=','const projectStore=');
function storage(){
  const requests=[],timers=new Map();let timerId=0,denied=false;
  const context={
    indexedDB:{open(...args){if(denied)throw new Error('Storage denied');const request={args};requests.push(request);return request;}},
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)
  };
  runInNewContext(source+'\nglobalThis.openStore=openDatabase;',context);
  const connection=()=>({closed:false,close(){this.closed=true;}});
  return {open:context.openStore,requests,timers,connection,deny:value=>denied=value};
}

test('project connections reuse the existing database version and concurrent reads share one open',async()=>{
  const s=storage(),first=s.open(),second=s.open();
  assert.equal(first,second);assert.equal(s.requests.length,1);
  assert.deepEqual(s.requests[0].args,['tablecraft.projects']);
  const db=s.connection();s.requests[0].result=db;s.requests[0].onsuccess();
  assert.equal(await first,db);assert.equal(s.timers.size,0);
  s.open('tablecraft.play-sessions');assert.deepEqual(s.requests[1].args,['tablecraft.play-sessions']);
  s.requests[1].result=s.connection();s.requests[1].onsuccess();
});

test('blocked reads reject with actionable advice, allow retry and close late connections',async()=>{
  const s=storage(),pending=s.open(),blocked=s.requests[0];
  blocked.onblocked();await assert.rejects(pending,/其他标签页.*重试/);
  assert.equal(s.timers.size,0);
  const retried=s.open();assert.equal(s.requests.length,2);
  blocked.result=s.connection();blocked.onsuccess();assert.equal(blocked.result.closed,true);
  const db=s.connection();s.requests[1].result=db;s.requests[1].onsuccess();
  assert.equal(await retried,db);assert.equal(await s.open(),db);
});

test('a stalled database open times out and can be retried without reusing a rejected promise',async()=>{
  const s=storage(),pending=s.open();
  [...s.timers.values()][0]();await assert.rejects(pending,/读取超时/);
  const retried=s.open(),request=s.requests[1];request.result=s.connection();request.onsuccess();
  assert.equal(await retried,request.result);
});

test('version changes release connections so another tab can upgrade, then reopen on demand',async()=>{
  const s=storage(),pending=s.open(),db=s.connection();s.requests[0].result=db;s.requests[0].onsuccess();await pending;
  db.onversionchange();assert.equal(db.closed,true);
  const reopened=s.open();assert.equal(s.requests.length,2);
  s.requests[1].result=s.connection();s.requests[1].onsuccess();await reopened;
});

test('both browser storage exceptions and request failures permit a later retry',async()=>{
  const s=storage();s.deny(true);await assert.rejects(s.open(),/存储权限/);
  s.deny(false);const failed=s.open();s.requests[0].onerror();await assert.rejects(failed,/存储权限/);
  const recovered=s.open();s.requests[1].result=s.connection();s.requests[1].onsuccess();await recovered;
});
