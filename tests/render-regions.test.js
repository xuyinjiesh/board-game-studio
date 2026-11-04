import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderGate,updateRegion} from '../src/render-regions.js';

test('library dependencies ignore movement and detect import, rename, tab and image changes',()=>{
  const changed=createRenderGate(),provider={},asset={id:'a',type:'card',name:'牌',front:'data:image/png;base64,AAAA',number:1};
  const values=(tab='cards',a=asset)=>[provider,'桌面',tab,'all',a.id,a.type,a.name,a.front,a.number];
  assert.equal(changed(values()),true);
  assert.equal(changed(values()),false);
  assert.equal(changed(values('cards',{...asset})),false);
  assert.equal(changed(values('cards',{...asset,name:'新名称'})),true);
  assert.equal(changed(values('cards',{...asset,front:'new image'})),true);
  assert.equal(changed(values('boards')),true);
  assert.equal(changed([...values('boards'),'imported asset']),true);
});

// A small DOM adapter records destructive replacements and their effects on
// focus/scroll, without introducing a browser dependency to the node test suite.
function region(){
  const doc={activeElement:null};let writes=0;
  const element={ownerDocument:doc,children:[],scrollTop:80,scrollLeft:12,
    contains(node){return this.children.includes(node);},
    set innerHTML(html){
      writes++;this.html=html;this.scrollTop=this.scrollLeft=0;
      this.children=[input(this,html==='different'?'other':'name')];doc.activeElement=null;
    }
  };
  function input(parent,key){return {parentElement:parent,tagName:'INPUT',id:'',type:'text',name:'',dataset:{meta:key},selectionStart:2,selectionEnd:4,
    focus(options){assert.equal(options.preventScroll,true);doc.activeElement=this;},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  };}
  return {element,doc,writes:()=>writes};
}

test('unchanged panel markup retains nodes, focus, typed values and scroll',()=>{
  const {element,doc,writes}=region();updateRegion(element,'first');
  const field=element.children[0];field.value='尚未提交';doc.activeElement=field;element.scrollTop=123;
  assert.equal(updateRegion(element,'first'),false);
  assert.equal(writes(),1);assert.equal(element.children[0],field);
  assert.equal(doc.activeElement,field);assert.equal(field.value,'尚未提交');assert.equal(element.scrollTop,123);
});

test('changed panels restore matching input focus, selection and scroll; forced updates reset invalid values',()=>{
  const {element,doc,writes}=region();updateRegion(element,'first');
  doc.activeElement=element.children[0];element.scrollTop=145;
  assert.equal(updateRegion(element,'updated'),true);
  assert.equal(doc.activeElement,element.children[0]);
  assert.equal(doc.activeElement.selectionStart,2);assert.equal(doc.activeElement.selectionEnd,4);
  assert.equal(element.scrollTop,145);assert.equal(element.scrollLeft,12);
  element.children[0].value='invalid';updateRegion(element,'updated',{force:true});
  assert.equal(writes(),3);assert.equal(element.children[0].value,undefined);
  updateRegion(element,'different');assert.equal(doc.activeElement,null);
});
