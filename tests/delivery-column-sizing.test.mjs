import test from "node:test";
import assert from "node:assert/strict";
import {fitDeliveryColumns,resizeDeliveryBoundary} from "../assets/js/delivery-column-sizing.js";

const minimums=[60,82,190,155,140,78,78,65,90,90,113,46];
const weights=[4,7.5,16.5,15,12,7,7,5,6.5,9,7.5,3];
const sum=values=>values.reduce((a,b)=>a+b,0);

test("All 12 columns fit a standard desktop width and Actions stay compact",()=>{
 for(const available of [1250,1360,1600,1920]){
  const widths=fitDeliveryColumns(null,available,minimums,weights,11,46);
  assert.equal(widths.length,12);
  assert.ok(Math.abs(sum(widths)-available)<.001);
  assert.equal(widths[11],46);
  widths.forEach((width,i)=>assert.ok(width>=minimums[i]-0.001));
 }
});
test("At narrow sizes scrolling only begins when minimum widths exceed viewport",()=>{
 const widths=fitDeliveryColumns(null,900,minimums,weights,11,46);
 assert.equal(sum(widths),sum(minimums));
});
test("Right divider grows its own column and borrows space first from its right neighbors",()=>{
 const original=fitDeliveryColumns(null,1600,minimums,weights,11,46);
 const resized=resizeDeliveryBoundary(original,2,35,minimums,11);
 assert.ok(Math.abs(resized[2]-original[2]-35)<.001);
 assert.ok(resized[3]<original[3]);
 assert.equal(resized[0],original[0]);
 assert.ok(Math.abs(sum(resized)-sum(original))<.001);
 assert.equal(resized[11],46);
});
test("Dragging a divider to the left narrows only its preceding column",()=>{
 const original=fitDeliveryColumns(null,1600,minimums,weights,11,46);
 const resized=resizeDeliveryBoundary(original,2,-25,minimums,11);
 assert.ok(Math.abs(resized[2]-original[2]+25)<.001);
 assert.ok(Math.abs(resized[3]-original[3]-25)<.001);
 assert.equal(resized[0],original[0]);
 assert.equal(resized[11],46);
});
test("Notes and Status right dividers work without changing the Actions column",()=>{
 const original=fitDeliveryColumns(null,1600,minimums,weights,11,46);
 for(const index of [9,10]){
  const resized=resizeDeliveryBoundary(original,index,40,minimums,11);
  assert.ok(resized[index]>original[index]);
  assert.ok(Math.abs(sum(resized)-sum(original))<.001);
  assert.equal(resized[11],46);
 }
});
test("Resizing stops at minima instead of hiding any column",()=>{
 const original=fitDeliveryColumns(null,1360,minimums,weights,11,46);
 const resized=resizeDeliveryBoundary(original,9,5000,minimums,11);
 resized.forEach((width,i)=>assert.ok(width>=minimums[i]-0.001));
 assert.ok(Math.abs(sum(resized)-sum(original))<.001);
 const shrink=resizeDeliveryBoundary(original,2,-5000,minimums,11);
 assert.equal(shrink[2],minimums[2]);
 assert.ok(Math.abs(sum(shrink)-sum(original))<.001);
});
test("Previously saved widths are scaled to viewport instead of causing overflow",()=>{
 const old=[60,82,300,250,160,100,100,70,110,350,180,46];
 const fitted=fitDeliveryColumns(old,1360,minimums,weights,11,46);
 assert.ok(Math.abs(sum(fitted)-1360)<.001);
 assert.ok(fitted[9]<350);
 assert.equal(fitted[11],46);
});

test("Default column widths keep Status, Notes and Actions visible at desktop sizes",()=>{
 for(const width of [1250,1360,1536,1600,1920]){
  const available=width-2; // reserve scroll container border
  const fitted=fitDeliveryColumns(null,available,minimums,weights,11,46);
  assert.ok(sum(fitted)<=available+0.001);
  assert.ok(fitted[9]>=minimums[9]);
  assert.ok(fitted[10]>=minimums[10]);
  assert.equal(fitted[11],46);
 }
});
