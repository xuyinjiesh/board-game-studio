import test from 'node:test';
import assert from 'node:assert/strict';
import {SHORTCUT_STORAGE,defaultShortcuts,eventShortcut,bindingError,loadShortcuts,shortcutAction} from '../src/shortcuts.js';
const event=(key,extra={})=>({key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra});
test('keyboard matching supports modifiers, Command, symbols and existing aliases',()=>{
  const b=defaultShortcuts();
  assert.equal(shortcutAction(b,event('e',{metaKey:true})),'mode');
  assert.equal(shortcutAction(b,event('R',{shiftKey:true})),'rotateBack');
  assert.equal(shortcutAction(b,event('+',{shiftKey:true})),'zoomIn');
  assert.equal(shortcutAction(b,event('?',{shiftKey:true})),'help');
  assert.equal(shortcutAction(b,event('y',{ctrlKey:true})),'redo');
  assert.equal(shortcutAction(b,event('Backspace')),'remove');
  assert.equal(shortcutAction(b,event('f',{altKey:true})),null);
  assert.equal(eventShortcut(event('Shift',{shiftKey:true})),null);
});
test('custom bindings replace defaults and survive browser storage reloads',()=>{
  const b={...defaultShortcuts(),flip:'H',mode:'Ctrl+M',remove:'Ctrl+Delete'};
  const storage={getItem:key=>key===SHORTCUT_STORAGE?JSON.stringify(b):null};
  const loaded=loadShortcuts(storage);
  assert.deepEqual(loaded,b);
  assert.equal(shortcutAction(loaded,event('h')),'flip');
  assert.equal(shortcutAction(loaded,event('f')),null);
  assert.equal(shortcutAction(loaded,event('m',{ctrlKey:true})),'mode');
  assert.equal(shortcutAction(loaded,event('Backspace')),null);
});
test('conflicting and reserved keys are rejected, with safe defaults for invalid storage',()=>{
  const b=defaultShortcuts();
  assert.match(bindingError(b,'flip','R'),/顺时针/);
  for(const key of ['Escape','Tab','Enter',' ','1','Ctrl+Escape'])assert.ok(bindingError(b,'flip',key));
  assert.equal(bindingError(b,'flip','Ctrl+1'),null);
  assert.equal(bindingError(b,'flip','H'),null);
  assert.deepEqual(loadShortcuts({getItem:()=>'{broken'}),b);
  assert.deepEqual(loadShortcuts({getItem:()=>JSON.stringify({...b,flip:'R'})}),b);
  assert.deepEqual(loadShortcuts({getItem:()=>{throw new Error('unavailable');}}),b);
});
