import test from 'node:test';
import assert from 'node:assert/strict';
import {bindModalControls} from '../src/modal-controls.js';

test('modal close and backdrop clicks work without importing the workspace',()=>{
  let click,closed=0,prevented=0,stopped=0;
  const modal={addEventListener(name,handler){assert.equal(name,'click');click=handler;},close(){closed++;},closest(){return null;},getBoundingClientRect:()=>({left:20,right:100,top:30,bottom:120})};
  bindModalControls(modal);
  click({target:{closest:()=>({})},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(closed,1);assert.equal(prevented,1);assert.equal(stopped,1);
  click({target:modal,clientX:50,clientY:60});assert.equal(closed,1);
  click({target:modal,clientX:10,clientY:60});assert.equal(closed,2);
  click({target:{closest:()=>null},clientX:10,clientY:60});assert.equal(closed,2);
});
