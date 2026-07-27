/* Which land type is under every tile of every temperate template.

   map.bin says a cell is 'template 42, tile 3'. To know whether you can drive on it, or
   whether it is the sea, something has to classify it - and the .tem art files do not: they
   hold pixels and a position index and nothing else. RA keeps the classification in
   TEMPLATE.CPP's TemplateTypeClass table, compiled into the game, which is why this table
   has to exist as data here.

   It is rules metadata, the same category as the unit costs and weapon damage tables in
   rts.rules.js - ~300 rows of integers and one letter per cell. It is also inert on its own:
   without the player's own temperat.mix there are no pixels for it to describe.

   Each record is  id image w h classes category  and the classes string is one character per
   tile of the template, in position order:

     c clear    r rough     d road      b beach/sand   g bridge     <- driveable
     k rock     w water     i river                                 <- not
     - no tile here at all (templates have holes; see _mixTiles)

   The trailing category letter is the tileset's own EditorTemplateOrder grouping, and exists
   for the map editor's palette: 308 templates in one flat list is not a palette, it is a
   haystack.
     T terrain  D debris  R road  C cliffs  W water cliffs  B beach  V river  G bridge

   Rock and Rough are separate on purpose. They look alike and RA colours them identically,
   but world.yaml's ground locomotors list Rough among the terrain they have a speed for and
   omit Rock entirely - so rough ground is slow going and rock is a wall. Merging them turns
   660 cells of the tileset into obstacles that should be driveable.

   Trees, ore, gems and walls are NOT here - they are overlay, stored per cell in the map
   rather than baked into a terrain template. */
var RA_TILETAB_SRC = `1 w1 1 1 w T|2 w2 2 2 wwww T|3 sh01 4 5 ---k-ccbbwwiww--w--- B|4 sh02 5 5 ----c---bbbcbbbbrri-wwk-- B|5 sh03 3 5 --c-bbbbbww-w-- B|6 sh04 3 3 bbbbbbwww B|7 sh05 3 3 bkbbkkkii B|8 sh06 3 3 bbbbbbwww B|9 sh07 3 3 bbbbbbwww B|10 sh08 1 2 bb B|11 sh09 3 3 cikcibwww B|12 sh10 5 6 c----bc---wbbw---wbb--kkk---ww B|13 sh11 4 5 bc--bwb-wwbb--bb--wb B|14 sh12 3 5 bc-bbbwbb-wb--w B|15 sh13 6 5 wkb----bbb---wbbc--wwrbc---bbb B|16 sh14 4 4 bbc-ibb-rbb--wbb B|17 sh15 5 3 wwbc--wbb---wbb B|18 sh16 3 3 wbcwbcwbc B|19 sh17 2 1 bc B|20 sh18 3 3 wwrwiiwbr B|21 sh19 4 5 -wbc-bbcwbb-wbb-wbc- B|22 sh20 5 4 --wbbwbbb-wbb--wbb-- B|23 sh21 5 3 -wbbcwbbc-wbb-- B|24 sh22 6 5 w-----ww----bbwwww-cbbwb---bbb B|25 sh23 5 5 bww--bbwww-cbiw--cbb--bbb B|26 sh24 3 4 bw-bww-cb--c B|27 sh25 3 3 wwwkkbkkb B|28 sh26 3 3 wwwbbrbbb B|29 sh27 3 3 kkkbbbbbr B|30 sh28 3 3 -kkbkkbrr B|31 sh29 1 2 bc B|32 sh30 3 2 biicir B|33 sh31 6 5 ---wwb--wwbbwwwbc-bbwbc-ccbbc- B|34 sh32 4 4 --wwwwbbbbb-cc-- B|35 sh33 3 4 -wbwbcbr-bb- B|36 sh34 6 5 ---cbw-bbbb--bbw---bbw--bbw--- B|37 sh35 4 4 --bw-cbr-bbwcbw- B|38 sh36 4 3 -bbwbbw-bww- B|39 sh37 3 3 -bwcbwrbw B|40 sh38 2 1 cb B|41 sh39 3 3 kbwiiwcbw B|42 sh40 5 5 cbw---bw---bww--cbbw--bbw B|43 sh41 4 4 bw--bbw-bbww-cbw B|44 sh42 4 3 bbw--bbi-cbw B|45 sh43 3 3 bbbbbbbww B|46 sh44 2 2 wbiw B|47 sh45 3 3 wbwwrbwib B|48 sh46 2 2 wiib B|49 sh47 3 3 w--bw-bbw B|50 sh48 2 2 wwcb B|51 sh49 3 3 bwwkkiikk B|52 sh50 2 2 bbbw B|53 sh51 3 3 cbb-bb-rc B|54 sh52 3 3 -cccbb-bw B|55 sh53 3 3 bc-bbcwbc B|56 sh54 3 3 wbcbb-c-- B|57 sh55 1 1 k D|58 sh56 2 1 kk D|59 wc01 2 2 kkkk W|60 wc02 2 3 krkkkk W|61 wc03 2 2 kkkk W|62 wc04 2 2 kkkk W|63 wc05 2 2 kkkk W|64 wc06 2 3 rkkkk- W|65 wc07 2 2 kkkk W|66 wc08 2 2 kkkk W|67 wc09 3 2 kkkikk W|68 wc10 2 2 kkkk W|69 wc11 2 2 kkkk W|70 wc12 2 2 kkkk W|71 wc13 3 2 kkrkkc W|72 wc14 2 2 kbbb W|73 wc15 2 2 kkkk W|74 wc16 2 3 w-kk-k W|75 wc17 2 2 kkkk W|76 wc18 2 2 kkkk W|77 wc19 2 2 kkkk W|78 wc20 2 3 -ikkkr W|79 wc21 1 2 kk W|80 wc22 2 2 kkkk W|81 wc23 3 2 kkikkw W|82 wc24 2 2 kkkk W|83 wc25 2 2 kkkk W|84 wc26 2 2 kkkk W|85 wc27 3 2 kkwckk W|86 wc28 2 2 kk-k W|87 wc29 2 2 kkkk W|88 wc30 2 2 kkkk W|89 wc31 2 2 kikk W|90 wc32 2 2 kkw- W|91 wc33 2 2 kkkk W|92 wc34 2 2 kkkk W|93 wc35 2 2 kkkk W|94 wc36 2 2 kkkk W|95 wc37 2 2 kkkk W|96 wc38 2 2 kkkk W|97 b1 1 1 k D|98 b2 2 1 kk D|99 b3 3 1 kkk D|103 p01 1 1 k D|104 p02 1 1 k D|105 p03 1 1 k D|106 p04 1 1 k D|107 p07 4 2 rccccccc D|108 p08 3 2 cccccc D|109 p13 3 2 kkkkkk D|110 p14 2 1 kk D|112 rv01 5 4 kk---kiiiikkkkk-kr-- V|113 rv02 5 3 kkkrriiiiikkk-- V|114 rv03 4 4 kr--kkkckkii-cck V|115 rv04 4 4 --kr-rkiiiiikkk- V|116 rv05 3 3 cikkikkik V|117 rv06 3 2 kikkik V|118 rv07 3 2 kkikki V|119 rv08 2 2 kiii V|120 rv09 2 2 ccii V|121 rv10 2 2 iiki V|122 rv11 2 2 iiik V|123 rv12 3 4 cikkikiikrik V|124 rv13 4 4 --criiiiikikckir V|125 falls1 3 3 kkkikkrkk V|126 falls1a 3 3 wikwkkwik W|127 falls2 3 2 kkkikk V|128 falls2a 3 2 kkkiii W|129 ford1 3 3 rirdrdcrr G|130 ford2 3 3 rrrkrrcdc G|131 bridge1 5 3 -kggkkggkk--k-- G|132 bridge1d 5 3 -kkkkkkkkk--k-- G|133 bridge2 5 2 kggk-kkggk G|134 bridge2d 5 2 kkkk-kkkkk G|135 s01 2 2 kkkk C|136 s02 2 3 krkkkk C|137 s03 2 2 kkkk C|138 s04 2 2 kkkk C|139 s05 2 2 kkkk C|140 s06 2 3 rkkkk- C|141 s07 2 2 kkkk C|142 s08 2 2 kkkk C|143 s09 3 2 kkkkkk C|144 s10 2 2 kkkk C|145 s11 2 2 kkkk C|146 s12 2 2 kkkk C|147 s13 3 2 kkrkkr C|148 s14 2 2 krk- C|149 s15 2 2 kkkk C|150 s16 2 3 r-kk-k C|151 s17 2 2 kkkk C|152 s18 2 2 kkkk C|153 s19 2 2 kkkk C|154 s20 2 3 -kkkkr C|155 s21 1 2 kk C|156 s22 2 1 kk C|157 s23 3 2 kkkkkr C|158 s24 2 2 kkkk C|159 s25 2 2 kkkk C|160 s26 2 2 kkkk C|161 s27 3 2 kkrrkk C|162 s28 2 2 kk-k C|163 s29 2 2 kkkk C|164 s30 2 2 kkkk C|165 s31 2 2 krkk C|166 s32 2 2 kkr- C|167 s33 2 2 kkkk C|168 s34 2 2 kkkk C|169 s35 2 2 kkkk C|170 s36 2 2 kkkk C|171 s37 2 2 kkkk C|172 s38 2 2 kkkk C|173 d01 2 2 -dcc R|174 d02 2 2 cdcc R|175 d03 1 2 cd R|176 d04 2 2 -cdc R|177 d05 3 4 -dcdd-dd-dd- R|178 d06 2 3 d-dddc R|179 d07 3 2 cdc-dc R|180 d08 3 2 -d-cdc R|181 d09 4 3 ccccdddd--cc R|182 d10 4 2 ck--dddd R|183 d11 2 3 -cddc- R|184 d12 2 2 c-dd R|185 d13 4 3 ddc-cddk--kd R|186 d14 3 3 -cdckdddd R|187 d15 3 3 dddddcdc- R|188 d16 3 3 cdddddddk R|189 d17 3 2 dddcdc R|190 d18 3 3 cdcddccdk R|191 d19 3 3 cdcdddcdc R|192 d20 3 3 dc-ddccdd R|193 d21 3 2 kddcdr R|194 d22 3 3 -c-ddccdc R|195 d23 3 3 -dccdcdd- R|196 d24 3 3 dd-ddd-dd R|197 d25 3 3 dd-ddd-dd R|198 d26 2 2 -dd- R|199 d27 2 2 -dd- R|200 d28 2 2 ddr- R|201 d29 2 2 ddd- R|202 d30 2 2 ddd- R|203 d31 2 2 -ddd R|204 d32 2 2 -cdc R|205 d33 2 2 -ddd R|206 d34 3 3 -ddddddd- R|207 d35 3 3 -ddddddd- R|208 d36 2 2 d--d R|209 d37 2 2 d--d R|210 d38 2 2 dd-d R|211 d39 2 2 dd-d R|212 d40 2 2 dd-d R|213 d41 2 2 k-dd R|214 d42 2 2 d-dd R|215 d43 2 2 c-dd R|216 rf01 1 1 k D|217 rf02 1 1 k D|218 rf03 1 1 k D|219 rf04 1 1 k D|220 rf05 1 1 k D|221 rf06 1 1 k D|222 rf07 1 1 k D|223 rf08 1 2 kk D|224 rf09 1 2 kk D|225 rf10 2 1 rr D|226 rf11 2 1 kk D|227 d44 1 1 d R|228 d45 1 1 d R|229 rv14 1 2 ki V|230 rv15 2 1 ki V|231 rc01 2 2 kkkk V|232 rc02 2 2 kkkk V|233 rc03 2 2 kkkk V|234 rc04 2 2 kkkk V|235 br1a 4 3 -kg-kggk-gkk G|236 br1b 4 3 -kr-krrk-rkk G|237 br1c 4 3 -kk-kkkk-kkk G|238 br2a 5 3 -kg--kggkk-gkk- G|239 br2b 5 3 -kr--krrkk-rkk- G|240 br2c 5 3 -ww--kkkkk-kkk- G|241 br3a 4 2 kg---gkk G|242 br3b 4 2 kg---gkk G|243 br3c 4 2 kk---kkk G|244 br3d 4 2 ik---iii G|245 br3e 4 2 ww---kww G|246 br3f 4 2 ww---www G|247 f01 3 3 rddbbbbbb G|248 f02 3 3 bbbbbbbbb G|249 f03 3 3 bbbbbbcdc G|250 f04 3 3 cbbdbbcbb G|251 f05 3 3 bbbbbbbbb G|252 f06 3 3 bbcbbdbbc G|255 clear1 1 1 c T|378 bridge1h 5 3 -krrkkrrkk--r-- G|379 bridge2h 5 2 krrk-kkrrk G|380 br1x 5 3 k--dc----k----w G|381 br2x 5 1 d---b G|382 bridge1x 5 4 --cggk---------gg-kk G|383 bridge2x 5 5 ggrcr----i-----kkrgg---gg G|400 hill01 4 3 rkkkkkrrkkrc D|401 cliffsl1 1 2 kk C|402 cliffsl2 1 2 kk C|403 cliffsl3 2 1 kk C|404 cliffsl4 2 1 kk C|405 cliffsw1 1 2 kk W|406 cliffsw2 1 2 kk W|407 cliffsw3 2 1 kk W|408 cliffsw4 2 1 kk W|500 sh57 1 1 k D|502 sh58 2 1 kk D|503 sh59 2 1 kk D|504 sh60 1 2 kk D|505 sh61 1 1 k D|506 sh62 1 1 k D|507 sh63 2 2 kkkk D|508 sh64 1 1 k D|519 sbridge1x 3 4 cdc------cdc G|520 sbridge1 3 2 igiigi G|521 sbridge1h 3 2 igiigi G|522 sbridge1d 3 2 ikiiki G|523 sbridge3 4 2 -kgkigki G|524 sbridge3h 4 2 -kgkigki G|525 sbridge3d 4 2 -kkkiiki G|526 sbridge3x 4 4 -ccdi-------dcii G|527 sbridge4 4 2 kgk-ikgk G|528 sbridge4h 4 2 kgk-ikgk G|529 sbridge4d 4 2 kkk-ikkk G|530 sbridge4x 5 5 dcc-i---ii----iiicdc---cd G|531 sbridge2 2 3 iiggkk G|532 sbridge2h 2 3 iiggkk G|533 sbridge2d 2 3 iiiiii G|534 sbridge2x 4 4 r--rd--dr--rciic G|550 sccnr 2 3 kkkkkk W|551 sccnl 2 3 kkkkkk W|552 sccsr 2 3 kkkkkk W|553 sccsl 2 3 kkkkkk W|554 sccln 3 2 kkkkkk W|555 sccls 3 2 kkkkkk W|556 sccrn 3 2 kkkkkk W|557 sccrs 3 2 kkkkkk W|580 deca 1 1 r D|581 decb 1 1 r D|582 decc 1 1 r D|583 decc 1 1 r D|584 decd 1 1 r D|585 dece 1 1 r D|586 decf 1 1 r D|587 decg 1 1 r D|588 dech 1 1 r D|590 fjord1 1 2 rr G|591 fjord2 2 1 rr G|65535 clear1 1 1 c T`;

/* id -> {img, w, h, t} , parsed once. */
var RA_TILETAB = (function () {
  var out = {}, recs = RA_TILETAB_SRC.split('|');
  for (var i = 0; i < recs.length; i++) {
    var f = recs[i].split(' ');
    if (f.length < 5) continue;
    out[f[0] | 0] = { img: f[1], w: f[2] | 0, h: f[3] | 0, t: f[4], cat: f[5] || 'T' };
  }
  return out;
})();

/* ------------------------------------------------------------------ snow --
   The snow theatre needs almost none of its own table. Comparing OpenRA's snow.yaml against
   temperat.yaml: all 264 snow templates exist in the temperate set under the SAME image name,
   and 261 of them classify identically. Snow is a repaint of the same tile geometry, which is
   why a snow map can be read with the table above and only the artwork swapped.

   Three disagree, and they are listed rather than waved away because one of them changes what
   you can drive on:

     124  rv13      a cell that is river in temperate is rough in snow - a frozen riverbank is
                    walkable where the flowing one is not
     382  bridge1x  bridge cells classify as plain road in snow
     383  bridge2x  likewise

   The 44 templates in the temperate table but not in snow are left alone: a snow map cannot
   reference one, having been authored in the snow editor, and if a hand-edited map somehow does
   then classifying it from the temperate row beats refusing to classify it at all. */
var RA_TILETAB_SNOW = {
  124: '--criiiirkikckir',
  382: '--cddk---------dd-kk',
  383: 'ddrcr----i-----kkrdd---dd'
};

/* The table as a given theatre sees it: the shared object for temperate - the common case, and
   no copy is made - and a patched view for snow, built once and cached. */
function raTileTab(theatre) {
  if (String(theatre || '').toUpperCase() !== 'SNOW') return RA_TILETAB;
  if (raTileTab._snow) return raTileTab._snow;
  var out = {}, id;
  for (id in RA_TILETAB) out[id] = RA_TILETAB[id];
  for (id in RA_TILETAB_SNOW) {
    if (!out[id]) continue;
    out[id] = { img: out[id].img, w: out[id].w, h: out[id].h,
                t: RA_TILETAB_SNOW[id], cat: out[id].cat };
  }
  return (raTileTab._snow = out);
}

/* Dual-mode: a CommonJS module for the test suite, a plain global for the browser bundle,
   which has no loader at all and never will.

   Wrapped rather than assigned to a `var _exp` first, because every file in ra/ used that same
   name and the browser bundle concatenates them all into ONE global scope - ten declarations of
   _exp, each overwriting the last. It happened to work only because each is consumed on the
   very next line, which is the kind of accident that stops being an accident the moment
   somebody reorders the script tags. */
(function (exp) {
  if (typeof module !== 'undefined' && module.exports) module.exports = exp;
  /* The browser gets the TABLE, not a wrapper around it - every consumer indexes
     window.RA_TILETAB directly. CommonJS gets the wrapper because require() callers
     destructure it. The two are deliberately different shapes. */
  else if (typeof window !== 'undefined') {
    window.RA_TILETAB = exp.RA_TILETAB;
    window.raTileTab = exp.raTileTab;
  }
})({ RA_TILETAB: RA_TILETAB, RA_TILETAB_SNOW: RA_TILETAB_SNOW, raTileTab: raTileTab });
