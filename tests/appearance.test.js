import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/appearance.js',import.meta.url),'utf8');
const key='tablecraft.appearance.v1';
function setup({saved=null,dark=false,blocked=false}={}){
  const listeners={},windowListeners={},mediaListeners={};
  const stored=new Map(saved===null?[]:[[key,saved]]);
  const buttons=['light','dark'].map(mode=>({dataset:{colorModeChoice:mode},attributes:{},setAttribute(name,value){this.attributes[name]=value;}}));
  const document={documentElement:{dataset:{}},querySelectorAll:()=>buttons,addEventListener:(name,fn)=>listeners[name]=fn};
  const media={matches:dark,addEventListener:(name,fn)=>mediaListeners[name]=fn};
  const window={matchMedia:()=>media,addEventListener:(name,fn)=>windowListeners[name]=fn};
  const localStorage={getItem(name){if(blocked)throw Error('blocked');return stored.get(name)??null;},setItem(name,value){if(blocked)throw Error('blocked');stored.set(name,value);}};
  runInNewContext(source,{window,document,localStorage});
  return {
    mode:()=>document.documentElement.dataset.colorMode,
    selected:()=>buttons.filter(button=>button.attributes['aria-pressed']==='true').map(button=>button.dataset.colorModeChoice),
    saved:()=>stored.get(key),
    ready:()=>listeners.DOMContentLoaded(),
    click(mode){const button=buttons.find(button=>button.dataset.colorModeChoice===mode);listeners.click({target:{closest:()=>button}});},
    system(dark){media.matches=dark;mediaListeners.change();},
    storage(value,eventKey=key){windowListeners.storage({key:eventKey,newValue:value});}
  };
}
test('first visit applies the system palette before DOM ready without saving an explicit preference',()=>{
  const app=setup({dark:true});
  assert.equal(app.mode(),'dark');
  assert.equal(app.saved(),undefined);
  app.ready();assert.deepEqual(app.selected(),['dark']);
  app.system(false);assert.equal(app.mode(),'light');
});
test('saved choice overrides the system, and manual choices persist independently of later system changes',()=>{
  const app=setup({saved:'light',dark:true});
  assert.equal(app.mode(),'light');
  app.click('dark');assert.equal(app.mode(),'dark');assert.equal(app.saved(),'dark');
  assert.deepEqual(app.selected(),['dark']);
  app.system(false);assert.equal(app.mode(),'dark');
});
test('invalid saved values fall back to the system',()=>{
  const app=setup({saved:'invalid',dark:true});
  assert.equal(app.mode(),'dark');
  app.system(false);assert.equal(app.mode(),'light');
});
test('blocked browser storage does not prevent either mode from being selected',()=>{
  const app=setup({blocked:true,dark:true});
  app.click('light');assert.equal(app.mode(),'light');
  app.system(true);assert.equal(app.mode(),'light');
  app.click('dark');assert.deepEqual(app.selected(),['dark']);
});
test('other tabs synchronize choices and clearing the preference restores the system default',()=>{
  const app=setup({saved:'light',dark:false});
  app.storage('dark');assert.equal(app.mode(),'dark');assert.deepEqual(app.selected(),['dark']);
  app.storage('light','unrelated');assert.equal(app.mode(),'dark');
  app.storage(null);assert.equal(app.mode(),'light');
  app.system(true);assert.equal(app.mode(),'dark');
  app.storage('light');app.storage(null,null);assert.equal(app.mode(),'dark');
});
