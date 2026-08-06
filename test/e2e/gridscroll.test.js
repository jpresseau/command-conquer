/* With honest row heights the build list SCROLLS, so scrolling it with a finger has to work.
   Driven through the real touchscreen, and asserted on outcome: after the drag, tiles that
   were below the fold must be inside the panel. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var b=await chromium.launch();
 var ctx=await b.newContext(Object.assign({},devices['iPhone 13 landscape'],{isMobile:true}));
 var p=await ctx.newPage();
 var errs=[];p.on('pageerror',function(e){errs.push(String(e));});
 await p.goto(PAGE,{waitUntil:'load'});
 await p.waitForFunction(function(){return typeof window.rtsOpen==='function';});
 await p.evaluate(function(){rtsOpen(7);for(var i=0;i<60*30;i++)_rtsTick(1/60);});
 await p.waitForTimeout(400);
 var cdp=await ctx.newCDPSession(p);
 function pt(x,y){return {x:x,y:y,radiusX:12,radiusY:12,force:1};}
 var box=await p.evaluate(function(){
   var r=document.getElementById('rtsList').getBoundingClientRect();
   return {x:r.left+r.width/2,y0:r.top+r.height*0.8,y1:r.top+r.height*0.2};});
 function names(){return p.evaluate(function(){
   var g=document.getElementById('rtsList'),gr=g.getBoundingClientRect(),o=[];
   g.querySelectorAll('.rts-tile').forEach(function(t){
     var r=t.getBoundingClientRect();
     if(r.top>=gr.top-1&&r.bottom<=gr.bottom+1) o.push(t.querySelector('.nm').textContent);});
   return {vis:o,top:Math.round(g.scrollTop),max:Math.round(g.scrollHeight-g.clientHeight)};});}
 var before=await names();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(box.x,box.y0)]});
 for(var s=1;s<=10;s++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',
     touchPoints:[pt(box.x,box.y0+(box.y1-box.y0)*s/10)]});
   await p.waitForTimeout(16);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await p.waitForTimeout(500);
 var after=await names();
 console.log('before: scrollTop '+before.top+'/'+before.max+'  ['+before.vis.join(', ')+']');
 console.log('after : scrollTop '+after.top+'/'+after.max+'  ['+after.vis.join(', ')+']');
 var fails=[];
 if(before.max<=0) fails.push('the list does not scroll at all - nothing below the fold?');
 if(after.top<=before.top) fails.push('a finger drag did not scroll the build list ('+
   before.top+' -> '+after.top+')');
 var fresh=after.vis.filter(function(n){return before.vis.indexOf(n)<0;});
 if(!fresh.length) fails.push('scrolling revealed no new cameos');
 else console.log('revealed: '+fresh.join(', '));
 if(errs.length) fails.push('page errors: '+errs.join(' | '));
 console.log(fails.length?'FAIL\n  '+fails.join('\n  '):'PASS');
 await b.close();srv.close();process.exit(fails.length?1:0);
})();
