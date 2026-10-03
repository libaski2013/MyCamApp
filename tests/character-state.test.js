import test from 'node:test';
import assert from 'node:assert/strict';
import {characterState} from '../public/character-state.js';
test('character editing keeps reference and scene instructions together',()=>{
  const image=new Blob(['reference'],{type:'image/png'});
  const state=characterState({image,instructions:'Wear a red jacket.'});
  assert.equal(state.image,image);assert.equal(state.passthrough,false);
  assert.match(state.prompt.text,/not its background or pose/);
  assert.match(state.prompt.text,/live camera background/);
  assert.match(state.prompt.text,/hand gestures/);
  assert.match(state.prompt.text,/Wear a red jacket/);
  assert.equal('image' in characterState({instructions:'Add sunglasses.'}),false);
});
