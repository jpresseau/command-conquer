/* Batch A: the four defects that lose the player's battle.
   Each is driven through the real path and asserted on what a player would see. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var b=await chromium.launch();var fails=[];var errs=[];

 /* ---- 1. the three top-bar buttons are three buttons ---- */
 for (var prof of [['desktop',null],['iPhone 13 portrait',devices['iPhone 13']],
                   ['iPhone 13 landscape',devices['iPhone 13 landscape']]]) {
   var ctx=await b.newContext(prof[1]?Object.assign({},prof[1],{isMobile:true}):{viewport:{width:1280,height:800}});
   var p=await ctx.newPage();
   p.on('pageerror',function(e){errs.push(String(e));});
   await p.goto(PAGE,{waitUntil:'load'});
   await p.waitForFunction(function(){return typeof window.rtsOpen==='function';});
   await p.evaluate(function(){rtsOpen(7);for(var i=0;i<60*20;i++)_rtsTick(1/60);});
   await p.waitForTimeout(250);
   var r=await p.evaluate(function(){
     function box(id){var e=document.getElementById(id),r=e.getBoundingClientRect();
       return {id:id,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
               hit:(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)||{}).id};}
     var ids=['rtsSaveBtn','rtsLoadBtn','rtsMute'];
     var bs=ids.map(box), over=0;
     for(var i=0;i<bs.length;i++)for(var j=i+1;j<bs.length;j++){
       var A=bs[i],B=bs[j];
       if(Math.min(A.x+A.w,B.x+B.w)-Math.max(A.x,B.x)>1 && Math.min(A.y+A.h,B.y+B.h)-Math.max(A.y,B.y)>1) over++;}
     var help=document.querySelector('#rcgRts .rts-help.desk,#rcgRts .rts-help.touch');
     var hr=help&&getComputedStyle(help).display!=='none'?help.getBoundingClientRect():null;
     var helpClash=0;
     if(hr) bs.forEach(function(bb){ if(Math.min(hr.right,bb.x+bb.w)-Math.max(hr.left,bb.x)>1 &&
        Math.min(hr.bottom,bb.y+bb.h)-Math.max(hr.top,bb.y)>1) helpClash++; });
     return {bs:bs,over:over,helpClash:helpClash};
   });
   console.log(prof[0]+':');
   r.bs.forEach(function(x){console.log('  '+x.id.padEnd(11)+' at '+x.x+','+x.y+'  hit test -> '+x.hit);});
   if(r.over) fails.push(prof[0]+': '+r.over+' pairs of top-bar buttons still overlap');
   r.bs.forEach(function(x){ if(x.hit!==x.id) fails.push(prof[0]+': pressing '+x.id+' hits '+x.hit); });
   if(r.helpClash) fails.push(prof[0]+': the hint line overlaps '+r.helpClash+' buttons');
   /* a REAL press on the save button must save */
   var saved=await p.evaluate(function(){return !!localStorage.getItem('rccmd.save1');});
   if(prof[1]){
     var cdp=await ctx.newCDPSession(p);
     var bb=await (await p.$('#rtsSaveBtn')).boundingBox();
     var pt={x:bb.x+bb.width/2,y:bb.y+bb.height/2,radiusX:8,radiusY:8,force:1};
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   } else { await p.click('#rtsSaveBtn'); }
   await p.waitForTimeout(200);
   var after=await p.evaluate(function(){return {saved:!!localStorage.getItem('rccmd.save1'),
     muted:document.getElementById('rtsMute').title};});
   console.log('  real press on 💾: save on disk '+saved+' -> '+after.saved+'   mute says "'+after.muted+'"');
   if(!after.saved) fails.push(prof[0]+': a real press on the save button did not save');
   if(/off/i.test(after.muted)) fails.push(prof[0]+': pressing the save button muted the game');
   await ctx.close();
 }

 /* ---- 2. save version follows the MAP, not the live RTS_N ---- */
 var ctx2=await b.newContext({viewport:{width:1280,height:800}});
 var p2=await ctx2.newPage(); p2.on('pageerror',function(e){errs.push(String(e));});
 await p2.goto(PAGE,{waitUntil:'load'});
 await p2.waitForFunction(function(){return typeof window.rtsOpen==='function';});
 var ver=await p2.evaluate(function(){
   /* stand in for a real map the way the loader does: a map object with n = 96 */
   var boot=_rtsSaveVersion();
   window._RTS_MAP={n:96};
   var withMap=_rtsSaveVersion();
   rtsOpen(7); for(var i=0;i<60*10;i++)_rtsTick(1/60);
   var inBattle=_rtsSaveVersion();
   var ok=rtsSaveGame();
   var stamp=JSON.parse(localStorage.getItem('rccmd.save1.info')).v;
   rtsClose();
   var outside=_rtsSaveVersion();
   return {boot:boot,withMap:withMap,inBattle:inBattle,outside:outside,stamp:stamp,
           saved:ok, resumable:!!rtsSaveInfo(), stale:rtsSaveStale()};
 });
 console.log('\nsave version stamp: boot '+ver.boot+', map loaded '+ver.withMap+
   ', in battle '+ver.inBattle+', back on the title screen '+ver.outside);
 console.log('  saved with stamp '+ver.stamp+' -> resumable outside the battle: '+ver.resumable+
   ', reported stale: '+ver.stale);
 if(ver.withMap!==ver.inBattle) fails.push('the stamp differs between the map being loaded ('+
   ver.withMap+') and the battle running ('+ver.inBattle+')');
 if(ver.outside!==ver.stamp) fails.push('the stamp cannot be recomputed outside a battle ('+
   ver.outside+' vs the saved '+ver.stamp+')');
 if(!ver.resumable) fails.push('a battle saved on a 96-tile map is not resumable');
 if(ver.stale) fails.push('a battle saved on a 96-tile map is reported as from an older build');

 /* ---- 3. a death animation full of canvases must not destroy the save ---- */
 var death=await p2.evaluate(function(){
   rtsOpen(7); for(var i=0;i<60*20;i++)_rtsTick(1/60);
   var first=rtsSaveGame();
   var bytesBefore=(localStorage.getItem('rccmd.save1')||'').length;
   /* exactly what the real _mixDeath returns once artwork is loaded: baked canvases */
   var seq=[];for(var k=0;k<8;k++){var c=document.createElement('canvas');c.width=c.height=8;seq.push(c);}
   var G=window._rtsG;
   G.fx.push({kind:'die',x:0,y:1,z:0,t:0,seq:seq,base:1});
   var second=rtsSaveGame();
   var bytesAfter=(localStorage.getItem('rccmd.save1')||'').length;
   var infoAfter=!!localStorage.getItem('rccmd.save1.info');
   return {first:first,second:second,bytesBefore:bytesBefore,bytesAfter:bytesAfter,
           infoAfter:infoAfter,msg:G.msg};
 });
 console.log('\nsaving with a canvas-bearing death effect on screen:');
 console.log('  first save '+death.first+' ('+death.bytesBefore+' bytes) -> second save '+
   death.second+' ('+death.bytesAfter+' bytes), header still there: '+death.infoAfter);
 if(!death.second) fails.push('saving during a death animation still fails');
 if(!death.bytesAfter) fails.push('saving during a death animation DELETED the save on disk');
 if(!death.infoAfter) fails.push('the save header was deleted');

 /* ---- 4. the army is recorded, and restored ---- */
 var side=await p2.evaluate(function(){
   rtsSetVoxSide('soviet');
   rtsClose(); rtsOpen(7); for(var i=0;i<60*15;i++)_rtsTick(1/60);
   var mineAtSave=rtsHouseSide('player');
   rtsSaveGame();
   var info=JSON.parse(localStorage.getItem('rccmd.save1.info'));
   rtsClose();
   rtsSetVoxSide('allied');                    /* the player changes their mind on the title screen */
   var ok=rtsLoadGame();
   return {recorded:info.side,mineAtSave:mineAtSave,loaded:ok,
           after:rtsHouseSide('player'),vox:rtsVoxSide()};
 });
 console.log('\nfaction across a save: saved as '+side.mineAtSave+', header records "'+side.recorded+
   '", switched to allied, resumed -> '+side.after);
 if(side.recorded!=='soviet') fails.push('the save does not record the army ('+side.recorded+')');
 if(side.after!=='soviet') fails.push('resuming a Soviet battle gave the '+side.after+' roster');

 if(errs.length) fails.push('page errors: '+errs.join(' | '));
 console.log('\n'+(fails.length?'FAIL\n  '+fails.join('\n  '):'PASS'));
 await b.close();srv.close();process.exit(fails.length?1:0);
})();
