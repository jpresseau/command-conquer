/* RC COMMAND - a Command & Conquer-style real-time strategy game.
   Build a base, mine Scrap with harvesters, produce units, and fight the Redline faction.
   Standalone: the only outside dependency in the whole app is three.js.

   This file is the RULES layer - every balance number lives here, nothing else. The
   structure/unit tables are deliberately data-only so the whole game can be re-tuned by
   editing this one file (the way RULES.INI worked in the classic RTS games).

   Grid: the battlefield is RTS_N x RTS_N tiles of RTS_TILE world units each, centred on
   the origin, so tile (tx,tz) has its centre at ((tx-RTS_N/2+0.5)*RTS_TILE, ...). */

var RTS_TILE = 4;      /* world units per tile */
var RTS_N = 112;       /* tiles per side. Red Alert maps run to 128 - a big map with small
                          buildings on it is a large part of why the original reads the way
                          it does, and why an early pass here looked like a diorama. */

var RTS_SIDES = {
  player: { key:'player', name:'Vanguard', color:0x4a8ff0, glow:0xa8d4ff, tag:'VGD' },
  enemy:  { key:'enemy',  name:'Redline',  color:0xe0503c, glow:0xffb49f, tag:'RDL' }
};

/* ---------------------------------------------------------------- structures --
   The 3D model for each key is built by _rtsBuild() in rts.buildings.js.
   w,h  : footprint in tiles
   cost : credits
   build: seconds to construct at full power
   power: + supplies, - draws
   needs: structure keys that must already be built and alive
   Numbers are ours, but the shape of the tech tree is the classic one:
   power -> refinery/barracks -> factory -> defences. */
var RTS_STRUCTS = [
  { key:'yard',     name:'Command Yard',  w:3, h:3, cost:0,    build:0,  hp:1400, power:0,    sight:16,
    desc:'The heart of your base. Everything you build must sit near it.' },
  { key:'power',    name:'Power Plant',   w:2, h:2, cost:300,  build:7,  hp:500,  power:100,  sight:10,
    desc:'Supplies 100 power. Low power slows every production line.' },
  { key:'refinery', name:'Scrap Refinery',w:3, h:3, cost:1400, build:18, hp:950,  power:-30,  sight:12,
    needs:['power'], freeUnit:'harvester',
    desc:'Harvesters unload here. Ships with one free Harvester.' },
  { key:'barracks', name:'Barracks',      w:2, h:2, cost:400,  build:9,  hp:650,  power:-20,  sight:12,
    needs:['power'], produces:'infantry',
    desc:'Trains infantry.' },
  { key:'factory',  name:'War Factory',   w:3, h:2, cost:1600, build:20, hp:900,  power:-30,  sight:12,
    needs:['refinery'], produces:'vehicle',
    desc:'Builds RC combat vehicles and Harvesters.' },
  { key:'turret',   name:'Gun Turret',    w:1, h:1, cost:500,  build:10, hp:520,  power:-20,  sight:18,
    needs:['barracks'], weapon:'turretgun',
    desc:'Automated base defence. Needs power to fire.' }
];

/* ------------------------------------------------------------------- units --
   kind   : 'infantry' | 'vehicle'  (also picks the producing structure)
   speed  : world units / second
   turn   : radians / second
   r      : collision radius (world units)
   weapon : key into RTS_WEAPONS (null = unarmed) */
var RTS_UNITS = [
  { key:'rifle',    name:'Rifle Squad',   kind:'infantry', cost:100,  build:3,  hp:60,   speed:7,   turn:6,  r:1.1, sight:16, weapon:'rifle',
    desc:'Cheap infantry. Good against other infantry.' },
  { key:'rocket',   name:'Rocket Squad',  kind:'infantry', cost:300,  build:6,  hp:50,   speed:6,   turn:6,  r:1.1, sight:18, weapon:'rocket',
    desc:'Slow-firing missiles. Tears up vehicles and buildings.' },
  { key:'buggy',    name:'Scout Buggy',   kind:'vehicle',  cost:500,  build:7,  hp:170,  speed:16,  turn:3.2,r:1.6, sight:22, weapon:'mg',
    desc:'Fast RC scout. Shreds infantry, folds against tanks.' },
  { key:'tank',     name:'Battle Tank',   kind:'vehicle',  cost:800,  build:11, hp:460,  speed:9,   turn:1.8,r:2.0, sight:18, weapon:'cannon',
    desc:'The backbone of any serious attack.' },
  { key:'harvester',name:'Harvester',     kind:'vehicle',  cost:1200, build:14, hp:700,  speed:7.5, turn:1.6,r:2.2, sight:14, weapon:null,
    harvest:true, capacity:700,
    desc:'Mines Scrap fields and unloads at a refinery.' }
];

/* --------------------------------------------------------------- weapons --
   dmg      : damage per shot
   range    : world units
   cool     : seconds between shots
   shot     : 'tracer' | 'shell' | 'missile'  (visual)
   speed    : projectile speed (0 = hitscan tracer)
   splash   : blast radius, 0 = single target
   vs       : damage multipliers by armour class */
var RTS_WEAPONS = {
  rifle:     { dmg:7,  range:15, cool:0.55, shot:'tracer',  speed:0,   splash:0, vs:{ infantry:1.0, vehicle:0.35, building:0.25 } },
  mg:        { dmg:9,  range:16, cool:0.35, shot:'tracer',  speed:0,   splash:0, vs:{ infantry:1.0, vehicle:0.4,  building:0.3  } },
  rocket:    { dmg:26, range:20, cool:2.1,  shot:'missile', speed:34,  splash:2, vs:{ infantry:0.5, vehicle:1.3,  building:1.2  } },
  cannon:    { dmg:38, range:18, cool:1.5,  shot:'shell',   speed:60,  splash:3, vs:{ infantry:0.7, vehicle:1.0,  building:1.0  } },
  turretgun: { dmg:22, range:22, cool:0.9,  shot:'shell',   speed:70,  splash:1, vs:{ infantry:1.0, vehicle:0.9,  building:0.6  } }
};

/* ------------------------------------------------------------------ anims --
   AnimTypeClass from ANIM.CPP, trimmed to what this game uses.

   biggest : the stage at which the animation covers the most ground. Ground-altering side
             effects fire THERE, not at the start - ANIM.CPP does this so a crater or scorch
             appears under the fireball rather than popping into view in plain sight.
   chain   : ChainTo. The animation metamorphoses into this one instead of ending.
   damage  : an attached animation applies this per second to whatever it is riding on
             (WARHEAD_FIRE in the original). This is what makes a burning unit burn down. */
var RTS_ANIMS = {
  boom: { dur:0.75, biggest:0.34, scorch:true,  crater:true,  chain:'fire', loops:1 },
  hit:  { dur:0.50, biggest:0.30, scorch:true,  crater:false, chain:null,   loops:1 },
  pop:  { dur:0.40, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  fire: { dur:1.10, biggest:0,    scorch:true,  crater:false, chain:null,   loops:2, damage:9 }
};
var RTS_CRATER_ORE = 6;   /* ANIM.CPP: a crater calls Reduce_Tiberium(6) */

/* ------------------------------------------------------------- infantry --
   INFANTRY.CPP. Fear is a counter that decays one step per frame; taking a hit slams it to
   SCARED, and otherwise it climbs by ANXIOUS halved once for each health threshold the
   soldier is still above - so wounded infantry panic much faster than fresh ones. At
   ANXIOUS they lie down; below it they get up. */
var RTS_FEAR = { NONE:0, ANXIOUS:10, SCARED:50, PANIC:100, MAXIMUM:255 };
var RTS_FEAR_DECAY = 15;        /* per second; the original decays 1 per frame at 15 FPS */
var RTS_COND_YELLOW = 0.66, RTS_COND_RED = 0.33;
var RTS_PRONE_DAMAGE = 0.5;     /* Rule.ProneDamageBias */
var RTS_PRONE_SPEED = 0.5;      /* prone infantry crawl at half pace */

/* Armour class per thing, used with weapon.vs above. */
function rtsArmour(e) {
  if (e.type === 'struct') return 'building';
  var d = rtsUnitDef(e.def);
  return (d && d.kind === 'infantry') ? 'infantry' : 'vehicle';
}

/* ------------------------------------------------------------- economy --
   A harvester holds `capacity` scrap; unloading converts it 1:1 to credits.
   Each scrap tile starts with RTS_SCRAP_TILE and is mined at RTS_HARVEST_RATE/s. */
var RTS_START_CREDITS = 3000;   /* RULES.CPP: MPDefaultMoney */
var RTS_SCRAP_TILE = 500;
var RTS_HARVEST_RATE = 190;
var RTS_UNLOAD_RATE = 700;      /* scrap/second poured into the refinery */
var RTS_LOW_POWER_MIN = 0.28;   /* worst-case build-speed multiplier when browned out */
var RTS_BUILD_RADIUS = 9;       /* tiles: how far from an existing structure you may build */

/* Ore regrows and spreads, as it does in the original (RULES.CPP: IsTGrowth, IsTSpread,
   GrowthRate). A field you have worked out slowly comes back, so a long game does not
   grind to a halt on a dead map. */
var RTS_ORE_GROW_EVERY = 6;     /* seconds between growth passes */
var RTS_ORE_GROW_AMT = 26;      /* added to an existing non-full tile each pass */
var RTS_ORE_SPREAD_CHANCE = 0.10; /* chance a rich tile seeds an empty neighbour */

/* Enemy waves: every RTS_WAVE_EVERY seconds the AI throws a group at you, growing
   over time. Kept intentionally readable so it is easy to tune. */
var RTS_WAVE_EVERY = 85;
var RTS_WAVE_FIRST = 150;   /* a refinery costs 1400 and takes 18s - the first wave must not
                               land before a new player has had time to stand up an economy */

function rtsStructDef(k) { for (var i=0;i<RTS_STRUCTS.length;i++) if (RTS_STRUCTS[i].key===k) return RTS_STRUCTS[i]; return null; }
function rtsUnitDef(k)   { for (var i=0;i<RTS_UNITS.length;i++)   if (RTS_UNITS[i].key===k)   return RTS_UNITS[i];   return null; }
