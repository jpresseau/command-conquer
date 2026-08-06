/* PORTRAIT: how much of the screen is the game, and how much is the panel beside it?
   Measured across several real phone profiles rather than one, because a rule tuned to a single
   width is a rule that breaks on the next handset. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');


var PHONES=[['iPhone SE',375,667],['iPhone 13',390,664],['iPhone 14 Pro Max',430,739],
            ['Pixel 7',412,732],['small android',360,640]];
(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var b=await chromium.launch();var fails=[];
 for (var ph of PHONES){
   var ctx=await b.newContext({viewport:{width:ph[1],height:ph[2]},deviceScaleFactor:3,
     isMobile:true,hasTouch:true});
   var p=await ctx.newPage();
   await p.goto(PAGE,{waitUntil:'load'});
   await p.waitForFunction(function(){return typeof window.rtsOpen==='function';});
   await p.evaluate(function(){rtsOpen(7);for(var i=0;i<60*25;i++)_rtsTick(1/60);});
   await p.waitForTimeout(350);
   var r=await p.evaluate(function(){
     function bx(s){var e=document.querySelector(s);return e?e.getBoundingClientRect():null;}
     var st=bx('#rcgRts .rts-stage'),bar=bx('#rcgRts .rts-bar');
     var g=document.getElementById('rtsList'),gr=g.getBoundingClientRect();
     var ts=g.querySelectorAll('.rts-tile'),whole=0,B=[];
     for(var i=0;i<ts.length;i++){var t=ts[i].getBoundingClientRect();B.push(t);
       if(t.top>=gr.top-1&&t.bottom<=gr.bottom+1)whole++;}
     var ov=0;for(var i=0;i<B.length;i++)for(var j=i+1;j<B.length;j++){
       var ox=Math.min(B[i].right,B[j].right)-Math.max(B[i].left,B[j].left);
       var oy=Math.min(B[i].bottom,B[j].bottom)-Math.max(B[i].top,B[j].top);
       if(ox>1&&oy>1)ov++;}
     var tabs=document.querySelector('#rcgRts .rts-tabs');
     /* THE HINT MUST NOT SIT ON THE BUTTONS. It used to share one 34px line with the title and
        four buttons, wrapped to three lines on a phone and ran under the close button. Checked
        against every button in the top bar, and against the stage it is supposed to live in. */
     var help=document.querySelector('#rcgRts .rts-help.touch');
     var hr=help?help.getBoundingClientRect():null, clash=[];
     if(hr&&hr.width>0){
       document.querySelectorAll('#rcgRts .rts-top button').forEach(function(bt){
         var br2=bt.getBoundingClientRect();
         if(Math.min(hr.right,br2.right)-Math.max(hr.left,br2.left)>1 &&
            Math.min(hr.bottom,br2.bottom)-Math.max(hr.top,br2.top)>1)
           clash.push(bt.textContent.trim()||bt.id||'button');
       });
     }
     return {
       help:hr?{w:Math.round(hr.width),h:Math.round(hr.height),
                inStage:hr.top>=st.top-1&&hr.bottom<=st.bottom+1&&
                        hr.left>=st.left-1&&hr.right<=st.right+1,
                lines:Math.round(hr.height/14)}:null,
       helpClash:clash,vw:window.innerWidth,vh:window.innerHeight,
       stage:Math.round(st.width),stageH:Math.round(st.height),
       bar:Math.round(bar.width),barH:Math.round(bar.height),
       radar:Math.round(document.getElementById('rtsMini').getBoundingClientRect().height),
       grid:Math.round(gr.height),whole:whole,total:ts.length,ov:ov,
       tabOver:Math.round(tabs.scrollWidth-tabs.clientWidth)};
   });
   /* The bar is horizontal now, so a share of WIDTH says nothing. Measure the axis-free thing:
      how much of the screen the battlefield actually occupies, and whether it spans the full
      width - an isometric map is far more usable wide-and-short than tall-and-thin. */
   var area=(r.stage*r.stageH)/(r.vw*r.vh), wide=r.stage/r.vw;
   console.log(ph[0].padEnd(20)+r.vw+'x'+r.vh+'  battlefield '+r.stage+'x'+r.stageH+
     ' = '+Math.round(area*100)+'% of screen, '+Math.round(wide*100)+'% of its width'+
     '   bar '+r.bar+'x'+r.barH+'  radar '+r.radar+
     '  grid '+r.grid+'  '+r.whole+'/'+r.total+' cameos  overlaps '+r.ov);
   if(area<0.55) fails.push(ph[0]+': the battlefield is only '+Math.round(area*100)+'% of the screen');
   if(wide<0.9) fails.push(ph[0]+': the battlefield is '+Math.round(wide*100)+'% of the screen width');
   if(r.whole<6) fails.push(ph[0]+': only '+r.whole+' of '+r.total+' cameos are readable');
   if(r.ov) fails.push(ph[0]+': '+r.ov+' overlapping tile pairs');
   if(r.tabOver>0) fails.push(ph[0]+': the tab row overflows by '+r.tabOver+'px');
   if(r.radar<60) fails.push(ph[0]+': the radar shrank to '+r.radar+'px');
   if(!r.help) fails.push(ph[0]+': the touch hint is not shown at all');
   else {
     console.log('  '.repeat(0)+'                    hint '+r.help.w+'x'+r.help.h+
       ' ('+r.help.lines+' line(s)), inside the battlefield '+r.help.inStage+
       (r.helpClash.length?'   CLASHES WITH: '+r.helpClash.join(', '):'   clear of the buttons'));
     if(r.helpClash.length) fails.push(ph[0]+': the hint overlaps '+r.helpClash.join(', '));
     if(!r.help.inStage) fails.push(ph[0]+': the hint spills outside the battlefield');
     if(r.help.lines>2) fails.push(ph[0]+': the hint wraps onto '+r.help.lines+' lines');
   }
   await ctx.close();
 }
 console.log(fails.length?'FAIL\n  '+fails.join('\n  '):'PASS');
 await b.close();srv.close();process.exit(fails.length?1:0);
})();
