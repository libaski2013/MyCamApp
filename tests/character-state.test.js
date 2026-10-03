import test from 'node:test';
import assert from 'node:assert/strict';
import {characterState,applyCharacter,transformationError} from '../public/character-state.js';
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

test('character application waits for provider acknowledgment and reports failure',async()=>{
 const image=new Blob(['reference']);const state=characterState({image});let received;
 await applyCharacter({set:async data=>{received=data}},state);
 assert.equal(received.image,image);assert.equal(received.prompt,state.prompt.text);
 await assert.rejects(applyCharacter({set:async()=>{throw Error('rejected')}},state),/rejected/);
 const error=transformationError({code:'INSUFFICIENT_CREDITS',message:'secret-token https://provider/'},'Applying character reference');
 assert.match(error,/billing/);assert.ok(!error.includes('secret-token'));assert.ok(!error.includes('https://'));
});
