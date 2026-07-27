/* RC COMMAND - a Command & Conquer-style real-time strategy game.
   Build a base, mine Scrap with harvesters, produce units, and fight the Redline faction.
   Standalone: the only outside dependency in the whole app is three.js.

   This file is the RULES layer - every balance number lives here, nothing else. The
   structure/unit tables are deliberately data-only so the whole game can be re-tuned by
   editing this one file (the way RULES.INI worked in the classic RTS games).

   Grid: the battlefield is RTS_N x RTS_N tiles of RTS_TILE world units each, centred on
   the origin, so tile (tx,tz) has its centre at ((tx-RTS_N/2+0.5)*RTS_TILE, ...). */

var RTS_TILE = 4;      /* world units per tile */
var RTS_N = 128;       /* DEFINES.H MAP_CELL_W. This was 112, chosen by eye with a comment
                          saying "Red Alert maps run to 128" - so the right number was known and
                          not used. A big map with small
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
   storage: BDATA.CPP's `Capacity` (RULES.INI `Storage`) - how much HARVESTED scrap this
            building can hold. See rtsCapacity/_rtsHarvested in rts.core.js: ore unloaded
            above the sum of these is spilled on the ground and lost.
   Numbers are ours, but the shape of the tech tree is the classic one:
   power -> refinery/barracks -> factory -> defences. */
var RTS_STRUCTS = [
  { key:'yard',     name:'Command Yard',  w:3, h:3, cost:0,    build:0,  hp:1400, power:0,    sight:16,
    armour:'concrete',
    desc:'The heart of your base. Everything you build must sit near it.' },
  { key:'power',    name:'Power Plant',   w:2, h:2, cost:300,  build:7,  hp:500,  power:100,  sight:10,
    armour:'concrete',
    desc:'Supplies 100 power. Low power slows every production line.' },
  { key:'refinery', name:'Scrap Refinery',w:3, h:3, cost:2000, build:18, hp:950,  power:-30,  sight:12,
    needs:['power'], freeUnit:'harvester', storage:2000,
    armour:'concrete',
    desc:'Harvesters unload here, and it stores 2000 of scrap. Ships with one free Harvester.' },
  { key:'barracks', name:'Barracks',      w:2, h:2, cost:400,  build:9,  hp:650,  power:-20,  sight:12,
    needs:['power'], produces:'infantry',
    armour:'wood',
    desc:'Trains infantry.' },
  { key:'factory',  name:'War Factory',   w:3, h:2, cost:1600, build:20, hp:900,  power:-30,  sight:12,
    needs:['refinery'], produces:'vehicle',
    armour:'concrete',
    desc:'Builds RC combat vehicles and Harvesters.' },
  { key:'turret',   name:'Gun Turret',    w:1, h:1, cost:500,  build:10, hp:520,  power:-20,  sight:18,
    needs:['barracks'], weapon:'turretgun',
    side:'allied', armour:'concrete',
    desc:'Automated base defence. Needs power to fire.' },
  /* --- the tier the roster was missing. `needs` already gated everything, so these are data. --- */
  { key:'radar',    name:'Radar Dome',    w:2, h:2, cost:1000, build:14, hp:600,  power:-40,  sight:26,
    needs:['refinery'], radar:true,
    armour:'wood',
    desc:'Switches the radar on. Without one the map panel stays dark.' },
  /* Cost, power and prerequisites here are the reference's own: Tech Center $1500 / -200 /
     War Factory + Radar Dome. -200 is two whole power plants, which is the point - the tech
     tier is supposed to cost you an economy, not a line item. */
  { key:'lab',      name:'Tech Center',   w:2, h:2, cost:1500, build:22, hp:600,  power:-200, sight:14,
    needs:['radar', 'factory'],
    armour:'wood',
    desc:'Unlocks Artillery and the Heavy Tank. Draws as much power as two plants.' },
  { key:'rocketpit',name:'Rocket Turret', w:1, h:1, cost:800,  build:14, hp:480,  power:-30,  sight:22,
    needs:['factory'], weapon:'turretrocket',
    side:'soviet', armour:'concrete',
    desc:'Long-range base defence. Tears up armour, poor against infantry.' },
  /* --- defence you can afford early, and the two structures that do something other than
     shoot. `wall` and `pillbox` are pure data; `depot` carries the repair field below. --- */
  /* Concrete Wall $50, no power, no prerequisite - the reference's numbers exactly. It is the
     one thing in the game you can build from the first second of a match. */
  { key:'wall',     name:'Concrete Wall', w:1, h:1, cost:50,   build:2,  hp:400,  power:0,    sight:0,
    wall:true, capturable:false,
    armour:'concrete',
    desc:'A metre of concrete. Blocks movement, absorbs a lot, shoots at nothing.' },
  /* Pillbox $400 / -15 / needs Barracks, again straight from the reference. */
  { key:'pillbox',  name:'Pillbox',      w:1, h:1, cost:400,  build:6,  hp:420,  power:-15,  sight:15,
    needs:['barracks'], weapon:'pillboxgun',
    side:'allied', armour:'concrete',
    desc:'Cheap early defence. Shreds infantry, barely scratches armour.' },
  { key:'depot',    name:'Service Depot',w:2, h:2, cost:1200, build:16, hp:700,  power:-30,  sight:12,
    needs:['factory'], repairs:RTS_TILE * 3.2, repairRate:22,
    armour:'wood',
    desc:'Park damaged vehicles on it and they are patched up, free of charge.' },
  /* Advanced Power Plant $500 / +200 / needs Power Plant. Twice the output for well under
     twice the price and one footprint instead of two - the correct answer once a base is big. */
  { key:'apower',   name:'Adv. Power Plant', w:3, h:2, cost:500, build:11, hp:600, power:200, sight:10,
    needs:['power'],
    armour:'concrete',
    desc:'Supplies 200 power. Cheaper per unit than two plants, and half the footprint.' },
  /* Kennel $200 / -10 / needs Barracks. It exists to gate the Attack Dog. */
  { key:'kennel',   name:'Kennel',       w:1, h:1, cost:200,  build:5,  hp:400,  power:-10,  sight:10,
    needs:['barracks'],
    side:'soviet', armour:'wood',
    desc:'Trains Attack Dogs.' },
  /* Flame Tower $500 / -20 / needs Barracks, and "damages nearby units and structures if
     destroyed" - which this game already has a mechanism for, so it actually does. */
  /* TESLA COIL. The Soviet answer to a Pillbox, and the reason their base defence reads
     differently from the Allies': it hits far harder than anything else at its price and it
     STOPS WORKING when the power browns out. That second half is the whole design - a Tesla
     wall is only as good as the plants behind it, so killing the power is a real strategy
     rather than an inconvenience. Priced and armed from RULES.INI: 1500, 200 damage, and a
     draw of 100 which is more than any other defence asks for. */
  { key:'tesla',    name:'Tesla Coil',   w:1, h:2, cost:1500, build:20, hp:400,  power:-100, sight:20,
    needs:['radar'], weapon:'teslazap', side:'soviet', needsPower:true,
    armour:'concrete',
    desc:'Devastating, and dead the moment your power browns out. Soviet.' },
  { key:'flametower',name:'Flame Tower', w:1, h:1, cost:500,  build:11, hp:450,  power:-20,  sight:16,
    needs:['barracks'], weapon:'towerflame', deathBlast:{ dmg:70, radius:RTS_TILE * 2.6 },
    side:'soviet', armour:'concrete',
    desc:'Burns anything that comes close. Goes up in a fireball when it dies.' },
  /* BDATA.CPP's STRUCT_STORAGE. The silo does nothing but hold scrap - no power to speak of,
     no weapon, no prerequisite past the refinery that fills it - and it is the cheapest
     structure in the game that pays for itself, because without one every credit your
     harvesters bring back above your capacity is thrown away at the dock. */
  /* Zero power draw, and that number is MEASURED rather than chosen. At -10 each, the dozen
     silos an overflowing opponent builds drew 130 power, browned its whole base out and cost
     it enough production that the player lived 81 seconds longer on one seed. A storage tank
     is passive; giving it an appetite turned the storage cap into an accidental nerf. */
  /* Helipad. Produces helicopters and rearms them - AIRCRAFT.CPP sends an aircraft with no
     ammo back to one, and if there is no airfield available "it has to crash", which is
     implemented rather than softened. */
  { key:'helipad',  name:'Helipad',      w:2, h:2, cost:1500, build:14, hp:500,  power:-10,  sight:10,
    needs:['radar'], produces:'air', rearm:true,
    side:'allied', armour:'concrete',
    desc:'Builds and rearms helicopters. Without one, an aircraft out of ammo goes down.' },
  { key:'silo',     name:'Scrap Silo',   w:2, h:2, cost:150,  build:5,  hp:400,  power:0,    sight:8,
    needs:['refinery'], storage:1500, capturable:false,
    armour:'wood',
    desc:'Holds 1500 more scrap. Without enough storage, harvested scrap over the cap is lost.' }
];

/* ------------------------------------------------------------------- units --
   kind   : 'infantry' | 'vehicle'  (also picks the producing structure)
   speed  : world units / second
   turn   : radians / second
   r      : collision radius (world units)
   weapon : key into RTS_WEAPONS (null = unarmed) */
var RTS_UNITS = [
  { key:'rifle',    name:'Rifle Squad',   kind:'infantry', cost:100,  build:3,  hp:60,   speed:7,   turn:6,  r:1.1, sight:16, weapon:'rifle',
    armour:'none',
    crawl:true, fraidy:true,
    desc:'Cheap infantry. Good against other infantry.' },
  { key:'rocket',   name:'Rocket Squad',  kind:'infantry', cost:300,  build:6,  hp:50,   speed:6,   turn:6,  r:1.1, sight:18, weapon:'rocket',
    armour:'none',
    crawl:true, fraidy:true,
    desc:'Slow-firing missiles. Tears up vehicles and buildings.' },
  { key:'buggy',    name:'Scout Buggy',   kind:'vehicle',  cost:500,  build:7,  hp:170,  speed:16,  turn:3.2,r:1.6, sight:22, weapon:'mg',
    armour:'light',
    desc:'Fast RC scout. Shreds infantry, folds against tanks.' },
  /* weapon2: TECHNO.CPP's SecondaryWeapon. What_Weapon_Should_I_Use scores both against the
     target's armour and takes the better, so the tank answers infantry with its coaxial gun
     and armour with the main gun, with no input from the player. */
  { key:'tank',     name:'Battle Tank',   kind:'vehicle',  cost:800,  build:11, hp:460,  speed:9,   turn:1.8,r:2.0, sight:18, weapon:'cannon', weapon2:'coax',
    armour:'heavy',
    desc:'The backbone of any serious attack. Coaxial gun for infantry.' },
  { key:'harvester',name:'Harvester',     kind:'vehicle',  cost:1400, build:14, hp:700,  speed:7.5, turn:1.6,r:2.2, sight:14, weapon:null,
    /* RULES.CPP BailCount(28) x GoldValue(35) = 980 credits a full load, exactly. Was 700. */
    harvest:true, capacity:980,
    armour:'heavy',
    desc:'Mines Scrap fields and unloads at a refinery.' },
  /* --- second tier. `needs` on a unit gates it the same way it gates a structure. --- */
  { key:'grenadier',name:'Grenadier',     kind:'infantry', cost:160,  build:4,  hp:65,   speed:6,   turn:6,  r:1.1, sight:15, weapon:'grenade',
    side:'soviet', armour:'none',
    crawl:true, fraidy:true,
    desc:'Lobbed charges. Clears infantry and cracks buildings; hopeless against a moving tank.' },
  { key:'light',    name:'Light Tank',    kind:'vehicle',  cost:700,  build:9,  hp:280,  speed:12,  turn:2.6,r:1.8, sight:18, weapon:'cannon',
    side:'allied', armour:'light',
    desc:'Cheap armour. Faster than a Battle Tank and half the price, with a third of the hull.' },
  /* NoMovingFire, from UnitTypeClass::Read_INI. A gun this size cannot be fired on the move:
     the unit has to come to a stop first, which is what makes artillery a thing you position
     rather than a thing you drive at people. */
  { key:'arty',     name:'Artillery',     kind:'vehicle',  cost:600,  build:11, hp:150,  speed:6,   turn:1.4,r:1.9, sight:16, weapon:'howitzer',
    needs:['radar'], noMovingFire:true,
    side:'allied', armour:'light',
    desc:'Outranges every base defence in the game. Made of paper — never send it in first.' },
  { key:'heavy',    name:'Mammoth Tank',  kind:'vehicle',  cost:1700, build:20, hp:820,  speed:6.5, turn:1.3,r:2.2, sight:18, weapon:'heavycannon', weapon2:'coax',
    needs:['lab'],
    side:'soviet', armour:'heavy',
    desc:'The heaviest hull on the field. Slow, expensive, and very hard to stop.' },
  { key:'flame',    name:'Flame Squad',   kind:'infantry', cost:300,  build:5,  hp:75,   speed:6,   turn:6,  r:1.1, sight:12, weapon:'flame',
    needs:['lab'],
    side:'soviet', armour:'none',
    crawl:true, fraidy:true,
    desc:'Walks up and burns things down. Devastating up close, dead at any distance.' },
  /* capture: MISSION_CAPTURE. The unit is spent on arrival - it does not survive the job. */
  { key:'engineer', name:'Engineer',      kind:'infantry', cost:500,  build:8,  hp:45,   speed:6.5, turn:6,  r:1.1, sight:12, weapon:null,
    capture:true,
    armour:'none',
    crawl:false, fraidy:false,
    desc:'Walks into an enemy building and takes it. Unarmed, and spent on arrival.' },
  /* --- four units that each add a VERB rather than another damage number. --- */
  /* Attack Dog: "extremely effective against infantry, completely worthless against vehicles
     and structures". The `vs` table does that entirely - no special case anywhere in the code. */
  { key:'dog',      name:'Attack Dog',    kind:'infantry', cost:200,  build:3,  hp:40,   speed:13,  turn:8,  r:0.9, sight:14, weapon:'bite',
    needs:['kennel'],
    side:'soviet', armour:'none',
    crawl:false, fraidy:false,
    desc:'Fast and vicious. Tears infantry apart; cannot scratch a vehicle or a wall.' },
  /* heals: friendly INFANTRY inside this radius are brought back up at healRate hp/sec. The
     same shape as the Service Depot's repair field - one is for people, the other for vehicles. */
  { key:'medic',    name:'Field Medic',   kind:'infantry', cost:800,  build:9,  hp:70,   speed:6.5, turn:6,  r:1.1, sight:12, weapon:null,
    heals:RTS_TILE * 3.0, healRate:9,
    side:'allied', armour:'none',
    crawl:true, fraidy:false,
    desc:'Heals nearby infantry continuously and for free. Cannot heal himself.' },
  /* steal: walks into an enemy refinery and leaves with a fraction of that side\'s credits.
     Same walk-in as capture, different payload, spent the same way. */
  { key:'thief',    name:'Thief',         kind:'infantry', cost:500,  build:7,  hp:45,   speed:7,   turn:6,  r:1.1, sight:12, weapon:null,
    needs:['lab'], steal:0.5, stealFrom:'refinery',
    side:'allied', armour:'none',
    crawl:false, fraidy:false,
    desc:'Walks into an enemy refinery and leaves with half their credits. Unarmed.' },
  /* demo: C4. "Can destroy buildings instantly if she is able to get adjacent to them." */
  { key:'tanya',    name:'Commando',      kind:'infantry', cost:1200, build:14, hp:130,  speed:8,   turn:7,  r:1.1, sight:16, weapon:'pistols',
    needs:['lab'], demo:true, only:1,
    side:'allied', armour:'none',
    crawl:true, fraidy:false,
    desc:'Mows down infantry, and levels any building she can reach. Only one at a time.' },
  /* Mobile Construction Vehicle. UDATA.CPP's UnitMCV is unarmed, IsCrusher, IsGigundo, and can
     turn up in a crate; UNIT.CPP's Try_To_Deploy turns it into a STRUCT_CONST. Requires the
     Service Depot, as in the original, so it sits behind the same building that repairs it.
     `deploy` is the whole unit: it exists to put a Command Yard somewhere you do not have one,
     which is the only way back into the game after losing the first. */
  /* Attack helicopter. AIRCRAFT.CPP's loop, and the three rules that make an aircraft an
     aircraft rather than a fast tank:
       Ammo = Class->MaxAmmo         - it carries a fixed number of shots,
       if (!Ammo) -> MISSION_ENTER   - and goes home to a pad to reload when they are gone,
       "If this aircraft has nowhere else to go, meaning that there is no airfield available,
        then it has to crash."
     Plus: it flies. Terrain does not block it and only an `aa` weapon can touch it. */
  { key:'heli',     name:'Attack Heli',   kind:'air',      cost:1200, build:15, hp:200,  speed:22,  turn:5.0,r:1.6, sight:20, weapon:'hellfire',
    needs:['helipad'], air:true, ammo:8, rearm:6, alt:14,
    side:'allied', armour:'light',
    desc:'Flies over anything. Eight missiles, then it must return to a pad to reload.' },
  /* Armoured Personnel Carrier. UDATA.CPP's UnitAPC is IsCrusher with no turret; the transport
     rules are in UNIT.CPP - capacity via Max_Passengers, and, in Death, the half of the branch
     that matters: when a TRANSPORT dies its infantry passengers are unlimboed at the wreck and
     scatter rather than dying with it. That one rule is what makes an APC a good buy instead of
     a coffin, so it is implemented rather than approximated. */
  { key:'apc',      name:'APC',           kind:'vehicle',  cost:850,  build:10, hp:350,  speed:14,  turn:2.4,r:1.9, sight:16, weapon:'mg',
    needs:['barracks'], carries:5, crush:true,
    armour:'heavy',
    desc:'Carries five infantry. Fast and tough; its passengers walk away if it dies.' },
  { key:'mcv',      name:'Mobile Yard',   kind:'vehicle',  cost:2500, build:26, hp:600,  speed:5.5, turn:1.2,r:2.2, sight:14, weapon:null,
    needs:['depot'], deploy:'yard', crush:true,
    armour:'light',
    desc:'Unarmed. Deploys into a Command Yard - press D, or use the Deploy button.' }
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
  /* `verses` is WARHEAD.CPP's Modifier[armor], one multiplier per armour class in CONST.CPP's
     order: none / wood / light / heavy / concrete. Missing entries default to 1, as they do in
     the original ("Verses=100%,100%,100%,100%,100%").

     `wall` is IsWallDestroyer. Only warheads that carry it can bring down a Concrete Wall -
     which is the entire point of concrete, and the reason small arms are listed without it.
     `wood` is IsWoodDestroyer, for clearing trees.

     A weapon whose `heavy` entry is 0 is what the original calls ORGANIC - anti-personnel and
     literally nothing else. `IsOrganic = (Modifier[ARMOR_STEEL] == 0)` is derived exactly this
     way in WARHEAD.CPP; the Attack Dog was written that way before this file arrived. */
  rifle:      { dmg:7,  range:15, cool:0.55, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.30, light:0.40, heavy:0.15, concrete:0.20 } },
  mg:         { dmg:9,  range:16, cool:0.35, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.35, light:0.50, heavy:0.20, concrete:0.25 } },
  /* burst: Is_Two_Shooter. Rearm_Delay alternates the reload so the shots arrive as a fast
     pair and then a long wait. */
  /* `aa` is the whole air/ground contract: a weapon without it simply cannot engage a
     flying unit, and a base with neither of these two has no answer to a helicopter.
     In the original the rocket soldier and the SAM site are exactly that answer. */
  rocket:     { dmg:13, range:20, cool:1.80, burst:2, shot:'missile', speed:34, splash:2, wall:true, aa:true,
                verses:{ none:0.5,  wood:1.30, light:1.20, heavy:1.35, concrete:1.10 } },
  /* A tank's coaxial machine gun: short, weak, and murder on infantry. */
  coax:       { dmg:14, range:13, cool:0.32, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.20, light:0.28, heavy:0.10, concrete:0.12 } },
  cannon:     { dmg:38, range:18, cool:1.5,  shot:'shell',   speed:60, splash:3, wall:true, wood:true,
                verses:{ none:0.7,  wood:1.10, light:1.15, heavy:0.90, concrete:0.90 } },
  turretgun:  { dmg:22, range:22, cool:0.9,  shot:'shell',   speed:70, splash:1, wall:true,
                verses:{ none:1.0,  wood:0.70, light:1.00, heavy:0.80, concrete:0.50 } },
  /* Grenades arc: murder on anything that stays still, near-useless against a moving vehicle. */
  grenade:    { dmg:26, range:14, cool:1.9,  shot:'shell',   speed:26, splash:3.4, wall:true, wood:true,
                verses:{ none:1.0,  wood:1.30, light:0.45, heavy:0.25, concrete:0.95 } },
  /* Artillery has the longest reach in the game on the thinnest chassis. */
  howitzer:   { dmg:52, range:34, cool:3.4,  shot:'shell',   speed:44, splash:5.0, wall:true, wood:true,
                verses:{ none:1.1,  wood:1.50, light:0.90, heavy:0.60, concrete:1.15 } },
  /* The Mammoth's gun: slower and dearer than the Battle Tank's, but it goes through armour. */
  heavycannon:{ dmg:62, range:20, cool:2.1,  shot:'shell',   speed:58, splash:3.4, wall:true, wood:true,
                verses:{ none:0.6,  wood:1.25, light:1.30, heavy:1.40, concrete:1.05 } },
  /* Rocket Turret: long and hard-hitting, deliberately poor against infantry so that cheap
     riflemen stay the correct answer to a wall of them. */
  turretrocket:{ dmg:30, range:26, cool:2.0, burst:2, shot:'missile', speed:36, splash:2.2, wall:true, aa:true,
                verses:{ none:0.45, wood:1.10, light:1.30, heavy:1.50, concrete:0.90 } },
  /* Pillbox: a machine gun in concrete. The answer to an infantry rush at a point in the match
     where a Gun Turret is still unaffordable. */
  pillboxgun: { dmg:12, range:15, cool:0.30, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.15, wood:0.20, light:0.28, heavy:0.10, concrete:0.12 } },
  /* Attack Dog. ORGANIC: zero against everything that is not a person. */
  /* Range is in WORLD units and a tile is 4 of them. At 3 the dog had to close to 0.75 of a
     tile - but its own radius (0.9) plus an infantryman's (1.1) means the pair can never be
     nearer than 2.0, and any jostle broke contact. Measured: ONE bite in eight seconds, 31
     damage where a rifle squad did 56. The anti-infantry unit was worse at killing infantry
     than the cheapest thing in the game. 5.5 is still unmistakably melee and is reachable. */
  /* `maul` is INFANTRY.CPP's dog rule, and it replaces the damage number entirely:
         if (source is infantry && source->Class->IsDog) {
             if (source->TarCom == As_Target()) damage = Strength;
             else                               damage = 0;
         }
     A bite is set to the target's CURRENT strength, so it always kills in one bite whatever
     it bit; and anything that is not the dog's actual target takes nothing at all - a dog
     spills no collateral. `dmg` below is therefore never used against a legal target and is
     kept only as the fallback if `maul` is ever switched off. Combined with the infantry-only
     targeting rule in _rtsFindTarget, that is the whole unit: a 200-credit assassin that
     deletes exactly one man and cannot scratch a tank. We had given it a damage figure, which
     is precisely why it lost fights to the cheapest infantry in the game. */
  /* The helicopter's missiles: heavy against armour, nearly useless against people, which is
     what keeps it from being a flying answer to everything. */
  hellfire:   { dmg:55, range:20, cool:1.1, shot:'rocket', speed:34, splash:0.9, ammo:1,
                verses:{ none:0.35, wood:1.10, light:1.20, heavy:1.30, concrete:0.85 } },
  bite:       { dmg:22, range:5.5,cool:0.55, shot:'tracer',  speed:0,  splash:0, maul:true,
                verses:{ none:1.4,  wood:0,    light:0,    heavy:0,    concrete:0 } },
  /* Two .45s: shreds infantry, barely marks anything else. The Commando's threat to buildings
     is her C4, not this. */
  pistols:    { dmg:26, range:12, cool:0.22, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.6,  wood:0.15, light:0.20, heavy:0.05, concrete:0.08 } },
  /* Flame: very short reach, no travel time, and it does not care what it is burning. Wood
     burns; concrete does not, which is why a flame squad is not the answer to a wall. */
  flame:      { dmg:30, range:9,  cool:0.65, shot:'tracer',  speed:0,  splash:2.6, wood:true,
                verses:{ none:1.3,  wood:1.70, light:0.70, heavy:0.50, concrete:1.20 } },
  /* The Flame Squad's weapon on a fixed mount: a little more reach and a lot more of it. */
  /* The coil's bolt. Enormous damage, slow, and it ignores armour class the way RA's does -
     a Tesla hit is a Tesla hit whether it lands on a rifleman or a Mammoth. */
  teslazap:   { dmg:200, range:17, cool:2.6, shot:'tracer', speed:0, splash:0, wall:true,
                verses:{ none:1, wood:1, light:1, heavy:1, concrete:1 } },
  towerflame: { dmg:34, range:13, cool:0.75, shot:'tracer',  speed:0,  splash:3.0, wood:true,
                verses:{ none:1.3,  wood:1.25, light:0.80, heavy:0.60, concrete:0.90 } }
};

/* WarheadTypeClass::Modifier[] with the original's defaulting rule: anything the table does not
   mention takes 1. IsWallDestroyer is folded in here rather than checked at each call site,
   because there are five of them and one of them forgetting is a silent balance bug. */
function rtsVerses(w, tgt) {
  if (!w) return 1;
  var arm = rtsArmour(tgt);
  if (arm === 'concrete' && tgt.type === 'struct') {
    var sd = rtsStructDef(tgt.def);
    if (sd && sd.wall && !w.wall) return 0;      /* small arms do not knock down concrete */
  }
  if (!w.verses) return 1;
  var m = w.verses[arm];
  return (m === undefined) ? 1 : m;
}


/* ------------------------------------------------------------------ anims --
   AnimTypeClass from ANIM.CPP, trimmed to what this game uses.

   biggest : the stage at which the animation covers the most ground. Ground-altering side
             effects fire THERE, not at the start - ANIM.CPP does this so a crater or scorch
             appears under the fireball rather than popping into view in plain sight.
   chain   : ChainTo. The animation metamorphoses into this one instead of ending.
   damage  : an attached animation applies this per second to whatever it is riding on
             (WARHEAD_FIRE in the original). This is what makes a burning unit burn down. */
var RTS_ANIMS = {
  /* A fireball leaves a small fire burning where it went off - and that fire is on the
     GROUND, with nothing attached to it, so it does no damage. Only a flame riding an object
     burns that object. */
  boom:   { dur:0.75, biggest:0.34, scorch:true,  crater:true,  chain:'firesmall', loops:1 },
  hit:    { dur:0.50, biggest:0.30, scorch:true,  crater:false, chain:null,   loops:1 },
  pop:    { dur:0.40, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* Combat_Anim's PIFF: the little spark a bullet makes. No mark on the ground. */
  piff:   { dur:0.22, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* ...and its water set. An explosion over water throws a plume, and leaves nothing. */
  splash: { dur:0.55, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* ADATA.CPP's burn ladder. Three sizes of fire, each with its OWN damage rate, and each
     chaining DOWN into the next before finally trailing into smoke - `OnFireBig` ->
     `OnFireMed` -> `OnFireSmall` -> `SmokeM`. A fire is not a fixed effect that plays and
     stops; it burns itself down. That is why a building you shot and then left alone
     smoulders out, and one you keep hitting re-lights at full size.

     `damage` is ADATA's `Damage` field converted out of its units: the original is a fixed
     amount per TICK at 15 FPS, so fixed(1,10) = 1.5 hp/s, fixed(1,16) = 0.9375, and
     fixed(1,32) = 0.46875. The old single `fire` did NINE hp/s, which is six times the
     original's fiercest burn - it was a number picked by eye and it made a burning unit a
     dead unit.

     `size` is the relative draw scale, from ADATA's max-dimension field: 23 / 14 / 11 px.
     Only the big one is IsScorcher; a small fire leaves no mark. */
  firebig:   { dur:1.10, biggest:0, scorch:true,  crater:false, chain:'firemed',   loops:4, damage:1.5,     size:1.00 },
  firemed:   { dur:1.10, biggest:0, scorch:false, crater:false, chain:'firesmall', loops:4, damage:0.9375,  size:0.61 },
  firesmall: { dur:1.10, biggest:0, scorch:false, crater:false, chain:'smoke',     loops:4, damage:0.46875, size:0.48 },
  /* SmokeM: no damage, no mark, just what is left over. */
  smoke:     { dur:1.30, biggest:0, scorch:false, crater:false, chain:null,        loops:5, damage:0,       size:0.85 }
};
/* Which rung of the ladder a thing catches fire at, by how big it is. A pillbox does not
   burn like a refinery. */
var RTS_FIRE_BIG = 6;           /* footprint tiles at or above which a structure burns big */
var RTS_FIRE_MED = 4;
/* BuildingClass::Take_Damage lights a building up once it is badly hurt, not on the first
   scratch. Units already used 0.3; structures use ConditionRed so a burning building reads
   as one that is nearly gone. */
var RTS_BURN_UNIT = 0.3;
/* The literal, NOT RTS_COND_RED - that is declared further down this file, and a `var` read
   before its assignment is `undefined` silently. Kept in step with it by this comment. */
var RTS_BURN_STRUCT = 0.25;
/* Combat_Anim picks the explosion from the DAMAGE and the LAND TYPE - a rifle round and a
   tank shell are not the same event, and neither is over water. The thresholds mirror the
   original's: tiny hits piff, mid hits throw fragments, big ones are a fireball. */
var RTS_ANIM_PIFF = 15;      /* below this, a spark (ExplosionSet 2: PIFF / PIFFPIFF) */
var RTS_ANIM_BOOM = 40;      /* at or above this, the full fireball */
var RTS_CRATER_ORE = 6;   /* ANIM.CPP: a crater calls Reduce_Tiberium(6) */

/* ------------------------------------------------------------- infantry --
   INFANTRY.CPP. Fear is a counter that decays one step per frame; taking a hit slams it to
   SCARED, and otherwise it climbs by ANXIOUS halved once for each health threshold the
   soldier is still above - so wounded infantry panic much faster than fresh ones. At
   ANXIOUS they lie down; below it they get up. */
var RTS_FEAR = { NONE:0, ANXIOUS:10, SCARED:50, PANIC:100, MAXIMUM:255 };
var RTS_FEAR_DECAY = 15;        /* per second; the original decays 1 per frame at 15 FPS */

/* ------------------------------------------------- missions (MISSION.CPP) --
   MissionControlClass is a FLAG TABLE indexed by mission, read from the INI. Four of its
   fields decide how the rest of the game treats an object, and until now this game had them
   hardcoded in three separate places, each inferred from whatever the caller happened to
   need at the time:

     IsRetaliate   - shoots back when hit                            (default true)
     IsScatter     - gets out of the way of incoming                 (default true)
     IsRecruitable - may be recruited into a team, or recalled to defend the base (true)
     IsNoThreat    - is not considered a threat by a target scan     (default false)

   `rate` is MissionControl's Rate: how often the mission's own logic wants to think. It is
   recorded because it is part of the contract, but this engine runs every unit every frame -
   at 25 ms per simulated second for 78 entities there is nothing to buy by staggering them,
   and a unit reacting on a 30-second timer feels broken on a modern display.

   `hold` is MISSION_STICKY - it stays where it is put. That distinction between GUARD and
   STICKY is the reason the table earns its keep: a unit told to hold a position should not
   be dragged off it by the base-defence recall. */
var RTS_MISSIONS = {
  guard:   { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.13 },
  move:    { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  amove:   { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  attack:  { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  /* A harvester is unarmed, so it cannot retaliate, and pulling it off the ore to defend the
     base costs more than the raid does. Not a threat either - nothing should pick a fight
     with it in preference to something that shoots back. It is still a target, and a rich
     one; IsNoThreat governs what it provokes, not what it is worth. */
  harvest: { retaliate:false, scatter:true,  recruitable:false, noThreat:true,  hold:false, rate:0.13 },
  /* STICKY: holds ground. Fires from where it stands, never chases, and the base-defence
     recall leaves it alone. */
  hold:    { retaliate:true,  scatter:false, recruitable:false, noThreat:false, hold:true,  rate:0.13 }
};
var RTS_MISSION_DEFAULT = { retaliate:true, scatter:true, recruitable:true, noThreat:false, hold:false, rate:0.13 };
/* RULES.CPP: ConditionYellow = 1/2, ConditionRed = 1/4. These are not cosmetic - they are the
   thresholds for damaged building art, the fear escalation ladder and the AI's sell-back
   decision, so having them at 0.66/0.33 quietly mistuned all three. */
var RTS_COND_YELLOW = 0.5, RTS_COND_RED = 0.25;
var RTS_PRONE_DAMAGE = 0.5;     /* Rule.ProneDamageBias */
var RTS_PRONE_SPEED = 0.5;      /* prone infantry crawl at half pace */

/* ------------------------------------------------------------ buildings --
   BUILDING.CPP. A structure is not a static lump of hit points: it produces less power as
   it burns, it can be patched up a step at a time for money, it can be sold back for half,
   and when it goes down its crew runs out of the wreck.

   Repair_AI runs on a timer and each tick calls Repair_Step (hit points) for Repair_Cost
   (credits). The cost is the same fraction of the building's price as the hit points are of
   its total, scaled by RepairPercent - so patching a building all the way up from nothing
   costs a fraction of building a new one, which is the whole reason to do it. */
var RTS_REPAIR_RATE = 0.75;     /* seconds between repair steps (Rule.RepairRate) */
var RTS_REPAIR_STEP = 0.05;     /* fraction of max hp restored per step (Rule.RepairStep) */
var RTS_REPAIR_PCT = 0.25;      /* Rule.RepairPercent = 1/4 */
var RTS_REFUND_PCT = 0.5;       /* Rule.RefundPercent: sell gives back half */
/* BDATA.CPP's Raw_Cost(): a building's price MINUS the free unit it ships with.
     if (Type == STRUCT_REFINERY) cost -= UnitTypeClass::As_Reference(UNIT_HARVESTER).Cost;
   It exists to stop exactly one exploit, and refusing to port it left that exploit open here:
   refund half of a price that INCLUDES a free harvester and you are being paid for a harvester
   you keep. Sell a refinery, rebuild it, repeat - a money printer with an extra harvester
   falling out of it each cycle.

   Porting it needed the refinery priced the way the original prices it. RA's PROC is 2000 with
   the 1400 harvester costed INTO that; ours was 1400 for the building with the harvester on
   top, so raw cost came out at zero and the guard measured as a no-op. At 2000 the arithmetic
   is the original's: raw cost 600, refund 300. */
function rtsRawCost(key) {
  var d = rtsStructDef(key);
  if (!d) return 0;
  var free = d.freeUnit ? rtsUnitDef(d.freeUnit) : null;
  return Math.max(0, d.cost - (free ? free.cost : 0));
}
var RTS_SURVIVOR_FRACTION = 0.5;/* Rule.SurvivorFraction, used by How_Many_Survivors */
var RTS_SURVIVOR_ODDS = 0.5;    /* Drop_Debris only rolls some of them out of a wreck */
var RTS_DECON_TIME = 0.35;      /* Mission_Deconstruction: build-up run backwards, this x build */
/* BUILDING.H CountDown: "if the building is destroyed, it won't actually be removed from the
   map until this value reaches zero. This delay is for cosmetic reasons." A structure that
   vanishes on the frame it dies leaves its own explosion hanging in mid-air over bare grass.
   The wreck stays, burning, and only then is taken off the map. */
var RTS_WRECK_TIME = 3.0;

/* --------------------------------------------------------------- combat --
   COMBAT.CPP's Modify_Damage is the whole of the blast model, and its falloff is a DIVISION,
   not a taper:

       steps = distance / (SpreadFactor * PIXEL_LEPTON_W/2), bounded 0..16
       if (steps) damage /= steps
       if (steps < 4) damage = max(damage, MinDamage)     <- floor near the blast ONLY
       damage = min(damage, MaxDamage)

   So damage falls as 1/d: brutal at the impact point, nearly nothing a cell out, and the
   MinDamage floor deliberately stops applying past a quarter of full damage - "allow damage
   to drop to zero only if the distance would have reduced damage to less than 1/4 full
   damage". A unit at the edge of a blast should take NOTHING, not a courtesy point.

   RTS_SPREAD_STEPS is the steps-per-tile at SpreadFactor 1, scaled here so that a weapon's
   existing `splash` radius plays the SpreadFactor role. */
var RTS_MIN_DAMAGE = 1;
var RTS_MAX_DAMAGE = 1000;
var RTS_SPREAD_STEPS = 8;
/* Explosion_Damage only ever examines the impact cell and the eight around it, with
   range = ICON_LEPTON_W * 1.5 - so a blast NEVER spills further than a cell and a half,
   whatever the warhead. SpreadFactor shapes the curve inside that; it does not widen it.
   A weapon's `splash` is therefore its SpreadFactor here, not its radius. */
var RTS_BLAST_CELLS = 1.5;

var RTS_SPREAD_MAX = 16;      /* Bound(distance, 0, 16) */
var RTS_SPREAD_FLOOR = 4;     /* MinDamage applies only inside this many steps */

/* -------------------------------------------------------------- economy --
   GoldValue 35 / GemValue 110 - gems are worth a bit over three times ore per unit mined,
   which is what makes a gem patch worth crossing the map for. */
var RTS_GOLD_VALUE = 35;
var RTS_GEM_VALUE = 110;
/* CELL.CPP Tiberium_Adjust prices a gem STEP at `Rule.GemValue * 4`, against `Rule.GoldValue`
   for a gold step - so per step gems are worth 12.6x, not 3.1x. The familiar ~3x only shows
   up per TILE, because _adjgem caps a gem cell at 3 steps while gold reaches 12. Using the
   bare 110/35 ratio per unit mined, together with that cap, made a gem tile worth LESS than
   a gold one (measured 344 against 419) - precisely backwards for the deposit you are meant
   to fight over. */
var RTS_GEM_MULT = (RTS_GEM_VALUE * 4) / RTS_GOLD_VALUE;
/* How much further a harvester will drive for gems. Bounded on purpose - see the note in
   _rtsNearestScrap. This is a routing preference, not a price. */
var RTS_GEM_DETOUR = 3;

/* ------------------------------------------------------------ difficulty --
   RULES.CPP's DifficultyClass: the game does not make the AI "better", it multiplies a
   handful of biases on a whole house. The fields are the original's; the numbers are ours,
   because the shipped RULES.INI values are not in this source file.

   iq    : how many of the AI's behaviours are switched on at all (see RTS_IQ below)
   fire  : FirepowerBias        speed : GroundspeedBias
   armor : ArmorBias            rof   : ROFBias (higher = slower reload)
   cost  : CostBias             build : BuildSpeedBias (higher = slower)
   wall  : IsWallDestroyer      scan  : IsContentScan (looks inside transports/buildings) */
var RTS_DIFF = {
  easy:   { name:'Recruit',  iq:2, fire:0.75, speed:0.85, armor:0.7, rof:1.3,  cost:1.2, build:1.4, wall:false, scan:false,
            desc:'Redline attacks late, builds little and hits softly.' },
  normal: { name:'Soldier',  iq:3, fire:1,    speed:1,    armor:1,   rof:1,    cost:1,   build:1,   wall:true,  scan:false,
            desc:'An even fight. Redline expands and repairs.' },
  hard:   { name:'Commando', iq:5, fire:1.15, speed:1.1,  armor:1.2, rof:0.85, cost:0.8, build:0.7, wall:true,  scan:true,
            desc:'Redline builds a real base, defends it and comes early.' }
};
var RTS_DIFF_DEFAULT = 'normal';

/* -------------------------------------------------------------------- IQ --
   RULES.CPP's IQ section is the part worth stealing: each AI behaviour has an IQ level at
   which it switches ON. A low-IQ opponent is not a high-IQ one with worse numbers - it is
   missing specific, nameable abilities, which is far more legible than a damage multiplier. */
var RTS_IQ = {
  max:5,
  sellBack:2,       /* sells a building it cannot afford to repair */
  repairSell:3,     /* repairs damaged buildings at all */
  scatter:3,        /* its infantry scatter from incoming fire */
  harvester:3,      /* replaces lost harvesters */
  guardArea:4,      /* leaves a garrison at home instead of sending everything */
  refill:3,         /* restarts a production line the instant it frees */
  production:5      /* full build order and base expansion */
};

/* ------------------------------------------------------------- AI base --
   RULES.CPP's [AI] section. The AI does not follow a fixed build order - it holds a target
   *composition*: each structure type wants `ratio` of the base size, capped at `limit`, and
   it builds whatever it is furthest short of. BaseSizeAdd is the key one: the AI aims for
   the human's building count plus this, so it keeps pace with how you are actually playing
   instead of building to a script. */
/* HOUSE.CPP's Expert_AI. The architecture is the valuable part: every strategy is scored for
   URGENCY, and the AI then acts on the most urgent ones first, "because higher urgency actions
   tend to greatly affect the lower urgency actions". A flat if/else build order cannot express
   "I am broke AND under attack AND browned out" - this can.

   The house also runs a small state machine that the urgency checks read. */
var RTS_URGENCY = { NONE:0, LOW:1, MEDIUM:2, HIGH:3, CRITICAL:4 };
var RTS_STATE = { BUILDUP:0, BROKE:1, ATTACKED:2, ENDGAME:3 };
var RTS_ALERT_DELAY = 25;       /* Rule.SpeakDelay: cooldown on "base under attack" */
/* A house that cannot meet its power demand takes structural damage over time - only on the
   buildings that actually draw power, so a minefield does not blow itself up in a brownout. */
var RTS_DAMAGE_DELAY = 20;      /* seconds between brownout damage ticks */
var RTS_POWER_DAMAGE = 6;       /* hit points per tick, on buildings above ConditionYellow */

/* Cap on how many producing buildings the opponent may parallelise; see _rtsLines. Two is
   its own structure limit for both factories and barracks, so this is a ceiling rather than a
   constraint today - it exists so raising RTS_AI.limit cannot silently uncap production. */
var RTS_AI_MAX_LINES = 2;

var RTS_AI = {
  baseSizeAdd:3,
  powerSurplus:50,          /* keep this much spare power in hand */
  powerEmergency:0.75,      /* below 3/4 of demand supplied, power is an emergency */
  creditReserve:1000,       /* RepairThreshhold: never spend the last of the treasury */
  infantryReserve:2000,     /* above this it can afford to spend on infantry freely */
  infantryBaseMult:2,
  attackInterval:3,         /* minutes between attack waves, before difficulty bias */
  attackDelay:5,            /* minutes before the first one */
  ratio:{ refinery:0.16, barracks:0.16, factory:0.10, radar:0.06, lab:0.05, depot:0.05,
          apower:0.08, kennel:0.04, silo:0.14, pillbox:0.18, flametower:0.12, turret:0.24, rocketpit:0.12 },
  limit:{ refinery:4,    barracks:2,    factory:2,    radar:1,    lab:1,    depot:1,
  /* The silo limit is high on purpose and is the one number here that was MEASURED rather
     than guessed. At 6 the opponent filled its 17,000 of storage on `normal` and then threw
     away 17,000 more credits over seven minutes - it has the income to overflow and not the
     production lines to spend it down, so a low ceiling turns the storage cap into a straight
     nerf and hands the player about 16 extra seconds of life. RA has no silo limit at all. */
          apower:2,    kennel:1,    silo:14,   pillbox:4,     flametower:3,     turret:6,     rocketpit:4 },
  /* HOUSE.CPP AI_Building checks Tiberium against Capacity before it checks anything else:
     an overflowing house builds a silo NEXT, whatever else the base plan wanted. Without this
     the storage cap is a pure nerf to the opponent - it loses the income and never buys the
     fix. Expressed as the fraction of capacity at which a silo jumps the queue. */
  siloUrgent:0.8,
  /* The order _rtsAIWants walks. Economy, then production, then tech, then defence - tech
     before defence because a Tech Center that arrives after the match is decided is worth
     nothing, and the defensive ratios are big enough to soak every spare credit otherwise.
     The pillbox comes first among the defences because it is the one the AI can afford early;
     `wall` is deliberately absent, since an AI that cannot plan a line just scatters concrete. */
  /* Both armies' defences are listed. _rtsCanQueue drops whichever belong to the other one, so
     the same plan serves either side and the opponent builds a Tesla wall or a Pillbox line
     depending on which army it ended up with. */
  buildOrder:['refinery', 'barracks', 'silo', 'factory', 'radar', 'apower', 'depot', 'lab', 'kennel',
              'pillbox', 'flametower', 'turret', 'rocketpit', 'tesla'],
  /* What to spend a production run on. A table rather than an if-chain: adding a unit to
     RTS_UNITS should not mean editing the opponent's brain, and the hardcoded ladder that used
     to live in _rtsAIUnits is a large part of why the roster sat at five units. Gating is left
     to _rtsCanQueue, which already checks `needs`.

     `at` is the bank balance that justifies the purchase; `w` is how often to pick it among
     everything affordable. The weights matter more than they look: a strict best-first walk is
     DEGENERATE - whichever entry sits at the top is the only one ever built. Measured, that
     produced 461 grenadiers against 14 rocket soldiers in eight minutes, which is to say the
     opponent quietly stopped fielding anti-armour infantry altogether. Weighted choice keeps a
     combined-arms army, which is the point of having a roster at all. */
  mix:{
    vehicle:[ { key:'heavy', at:2600, w:3 }, { key:'arty',  at:2000, w:2 }, { key:'tank', at:1600, w:4 },
              { key:'light', at:1100, w:3 }, { key:'buggy', at:900,  w:2 } ],
    /* No engineer in the mix. Capturing is a decision about a specific building at a specific
       moment, and an AI that buys engineers without a plan for them just donates 600 credits
       to whatever shoots them first. Buildable by the player; not spammed by the opponent. */
    /* No engineer and no thief in the mix. Both are decisions about a specific building at a
       specific moment, and an AI that buys them without a plan just donates the credits to
       whatever shoots them first. The Commando is out for the same reason plus her `only` cap.
       The dog IS in: it needs no plan, it just runs at infantry. */
    infantry:[ { key:'flame', at:1200, w:2 }, { key:'grenadier', at:900, w:2 },
               { key:'rocket', at:500, w:3 }, { key:'dog', at:400, w:2 },
               { key:'rifle', at:250, w:2 } ]
  },
  /* Check_Raise_Money / Check_Raise_Power / Check_Lower_Power thresholds. */
  brokeMoney:100,           /* below this, raising cash is urgent */
  desperateMoney:2000,      /* ...and worse if there is no income either */
  powerEmergencyGap:40,     /* deficit below which power is an emergency, not a preference */
  powerWaste:150,           /* surplus above which a power plant is dead money */
  /* AI_Raise_Money and AI_Raise_Power sell in a fixed order, least valuable first, each with
     the urgency at which it becomes sellable.

     The ordering is what stops this being self-destruction. Only the turret - static defence,
     no income, no production - goes at LOW, and that turns out to be the most valuable thing
     a poor opponent does: across 3 difficulties x 3 seeds, allowing it took the Recruit AI's
     eight-minute army from 12 to 50 units on one seed and 36 to 48 on another, and changed
     nothing on the rest. A broke AI sitting on two turrets it cannot afford to support is
     better off spending them. Production goes at MEDIUM, the economy only in a real
     emergency, and the yard is on neither list: selling it is not a recovery, it is a
     surrender. */
  sellForMoney:[['turret', 1], ['factory', 2], ['barracks', 2], ['power', 3], ['refinery', 4]],
  sellForPower:[['turret', 1], ['barracks', 2], ['factory', 2], ['refinery', 3]]
};

/* ---------------------------------------------------------------- crates --
   CRATE.CPP. A crate is a map OVERLAY, not an object: `Put_Crate` stamps one into a cell and
   `Get_Crate` clears it. Crates do not accumulate - each one carries a timer, and when it
   expires the crate is removed and re-created somewhere else, so the map always holds the
   same number of them however long the match runs.

     Timer = Random_Pick(CrateTime * TICKS_PER_MINUTE/2, CrateTime * TICKS_PER_MINUTE*2)

   ...so a crate lives between half and twice `CrateTime`. Placement re-rolls a random map
   location until the cell is clear to build.

   `WaterCrateChance` and `OVERLAY_WATER_CRATE` are deliberately NOT ported. In the original,
   `Is_Clear_To_Build(SPEED_FLOAT)` means clear for something that FLOATS, and a crate bobbing
   in the sea is collectable because RA has ships. This game has no naval units and its water
   cells are blocked outright, so a water crate would be loot nobody could ever reach - and
   worse than useless, because it would hold one of the three crate slots hostage for its
   entire lifetime. Measured before it was cut: with water cells blocked, the placement search
   rejected every one of them and fell through to land 120 times out of 120, so the feature
   was already dead code pretending to work.

   WHAT IS NOT IN CRATE.CPP: the effects. That file creates, places and removes crates and
   says nothing about what is inside one. The list below is ours, built from the crate
   ANIMATIONS in ADATA.CPP - DOLLAR, ARMOR, FPOWER, RAPID, SPEED, INVUN, MINE, GPSBOX and the
   rest are the powerups the original shipped, because each one needed art. What each is
   worth here is a balance decision this repository is making, not a quotation.

   `w` is the pick weight. The money crate is the common one because it is the one that is
   never a disappointment; the mine is the reason driving over an unknown crate is a decision
   rather than free loot. */
/* NOT Rule.CrateMaximum, which is 255 - an upper bound, not a target. RULES.CPP has
   CrateMinimum(1)/CrateMaximum(255) and the real count is derived from map size. Three is
   ours, and now says so. */
var RTS_CRATE_MAX = 3;
var RTS_CRATE_TIME = 10;           /* RULES.CPP CrateTime(10), in minutes. Was 3, invented. */
var RTS_CRATE_TRIES = 200;         /* give up re-rolling rather than spin forever */
var RTS_CRATES = [
  { key:'money',  w:22, name:'Credits',        anim:'DOLLAR' },
  { key:'heal',   w:12, name:'Repair kit',     anim:'—' },
  { key:'armour', w:11, name:'Armour plating', anim:'ARMOR',  mult:{ armor:1.25 } },
  { key:'fpower', w:11, name:'Firepower',      anim:'FPOWER', mult:{ fire:1.3 } },
  { key:'rapid',  w:9,  name:'Rapid reload',   anim:'RAPID',  mult:{ rof:0.75 } },
  { key:'speed',  w:9,  name:'Engine tune',    anim:'SPEED',  mult:{ speed:1.35 } },
  { key:'reveal', w:8,  name:'Map data',       anim:'GPSBOX' },
  { key:'unit',   w:9,  name:'Abandoned vehicle', anim:'—' },
  { key:'mine',   w:9,  name:'Booby trap',     anim:'MINE' }
];
/* RULES.CPP SoloCrateMoney(2000) - a single figure, not a range. The spread is kept because
   a crate that always pays exactly the same is a worse decision than one that might not be
   worth the detour, but it is now centred on the real number instead of on 800. */
var RTS_CRATE_MONEY = [1400, 2600];
var RTS_CRATE_MINE_DMG = 90;
var RTS_CRATE_MINE_RADIUS = RTS_TILE * 2.2;
/* What a free-vehicle crate can contain: things that are useful on their own, in the open,
   with no support. An engineer or a thief handed to you in the middle of nowhere is a unit
   with nothing to do. */
/* UDATA.CPP marks the MCV "Can this be a goodie surprise from a crate? true", and that is the
   one entry here that can change a match: a player who has lost their Command Yard and cannot
   build anything is not out of the game while a crate might still hand them one. */
var RTS_CRATE_UNITS = ['buggy', 'light', 'tank', 'harvester', 'mcv'];
/* A unit may keep stacking bonuses, but not without limit - a tank that has hoovered up six
   firepower crates stops being a tank. */
var RTS_CRATE_CAP = { fire:2.2, armor:2.2, speed:1.9, rof:0.45 };

/* ---------------------------------------------------------------- shroud --
   MAP.CPP Sight_From(). Two flags per cell, and the distinction is the whole feature:

     IsMapped  - this cell has been explored. Once lifted it stays lifted.
     IsVisible - this cell is inside something's sight range RIGHT NOW.

   So the map has three states, not two: black where you have never been, dimmed where you
   have been but are not looking, and clear where you are. Enemy units vanish when they leave
   your sight; enemy buildings you have already seen stay drawn, because they are part of what
   you remember about the map.

   Sight_From caps sight range at ten cells and tests true circular distance, so the revealed
   area is a disc rather than a square. */
var RTS_SIGHT_MAX = 10;
var RTS_SIGHT_BONUS = 2;     /* the rules' `sight` is in world units; this widens the disc */
var RTS_VIS_HZ = 15;         /* the visibility sweep runs on the original's 15 FPS clock */
/* How far explored-but-unseen ground is darkened. This was 0.45, and it was the single
   largest reason the game did not look like what it is imitating - far more than the palette.
   Most of what is on screen at any moment is ground you have explored but are not currently
   looking at, so nearly half the light was being taken out of the majority of every frame.

   Measured on the same view, with the lifted palette underneath:

     0.45  median 57   p95  76   62% of the frame below 64
     0.30  median 71   p95  95   33%
     0.22  median 79   p95 106   13%
     0.00  median 100  p95 134    3%

   0.22 keeps the distinction between "seen now" and "remembered" plainly readable while
   letting the ground read as daylight. The SHROUD is untouched - ground you have never
   explored is still black, and enemy units still vanish when they leave your sight. Only the
   brightness of terrain memory changed. */
var RTS_FOG_DIM = 0.22;

/* Sight range in TILES for a structure or unit definition. */
function rtsSightTiles(def) {
  return Math.max(3, Math.min(RTS_SIGHT_MAX, Math.round((def.sight || 12) / RTS_TILE) + RTS_SIGHT_BONUS));
}

/* ------------------------------------------------------------- vehicles --
   UNIT.CPP. A vehicle carries two facings: PrimaryFacing is the hull and SecondaryFacing is
   the turret, and they are drawn as separate shapes. Can_Fire refuses with FIRE_FACING until
   the turret is within about 11 degrees of the target, and with FIRE_ROTATING if the turret
   is still swinging and the weapon does not home. */
var RTS_TURRET_ROT = 3.0;       /* radians/second, the turret's own rate */
var RTS_FIRE_ANGLE = 0.2;       /* ~11 degrees: Can_Fire's `diff < 8` out of 256 */
var RTS_RECOIL_TIME = 0.12;     /* how long the turret sits recoiled after firing */
/* Rearm_Delay: the SHORT half of a two-shooter's alternating reload. The original returns a
   flat 3 ticks here regardless of the weapon, which at 15 FPS is a fifth of a second. */
var RTS_BURST_DELAY = 0.2;
/* PrimaryLateral: how far off the barrel line the second shot of a pair appears. */
var RTS_MUZZLE_LATERAL = 0.5;
/* TURRET.CPP Fire_Coord: how far the muzzle sits ahead of the object's centre, as a multiple
   of the body radius. A turret overhangs its hull, so its barrel reaches past the body; a
   hull-mounted gun fires from inside the silhouette. A defence structure gets a flat reach,
   since the gun is most of the building. */
var RTS_MUZZLE_TURRET = 1.15;
var RTS_MUZZLE_HULL   = 0.75;
var RTS_MUZZLE_STRUCT = 2.2;
/* Fire_Direction: a non-homing shell leaves along the barrel and holds that bearing, so it
   can miss. How close it has to pass to something hostile to detonate on it, and how far
   past the aim point it keeps flying before going off on its own. */
var RTS_SHELL_HIT  = 1.8;
var RTS_SHELL_OVER = 0.35;

/* ------------------------------------------------ threat scan (TECHNO.CPP) --
   Evaluate_Object scores a candidate target rather than just measuring how far away it is.
   The base value is the object's Points (Risk + Reward); this game has no Points table, so
   cost stands in for it - a war factory outranks a rifle squad by the same logic either way.

   `value = rawval + object->Crew.Kills` makes a unit that has already killed things a hotter
   target: veterans get focused down. Kills are added raw to a Points-scale number in the
   original, but costs here run 100-1600 rather than 10-80, so the kill term is scaled up to
   stay meaningful instead of vanishing into the rounding. */
var RTS_KILL_VALUE = 60;
/* "If the object is outside of the protective umbrella of the enemy base, then give it a
   target boost" - stragglers and lone harvesters out in the open get hunted first. */
var RTS_EXPOSED_MULT = 2;
/* NervousBias: a target that has got INTO your own base is worth more than the same target
   sitting in a field. This is what makes a base defend itself properly. */
var RTS_NERVOUS_BIAS = 2;
/* The distance falloff is LINEAR in cells - note the original has the squared version right
   there, commented out, and ships the linear one. */
var RTS_THREAT_SCALE = 32000;
/* Threat_Range for area guard: twice the weapon range, clamped. 0x0A00 leptons = 10 cells. */
var RTS_THREAT_MAX_CELLS = 10;
/* Base_Is_Attacked: how many defenders may be recalled at once, and how long before the same
   attacker can trigger another recall (BaseDefenseDelay, in seconds). */
var RTS_DEFENDERS = 6;
var RTS_BASE_DEFENSE_DELAY = 30;
/* Firing from the darkness gives you away: Fire_At does a Sight_From of radius 2 around a
   shooter the player cannot currently see. Here it is a short reveal on the shooter itself,
   since the visibility grid is rebuilt every sweep and a one-shot mark would be erased. */
var RTS_MUZZLE_SPOT = 1.6;
/* Overrun_Square: a tracked vehicle drives over infantry. Approaching one makes them scatter
   (`cellptr->Incoming(0, true)`); actually reaching them kills them. Should_Crush_It refuses
   for HUMAN-controlled vehicles - your own tanks never auto-crush, you have to drive them
   over deliberately - and only within CrushDistance. */
/* UnitTypeClass's "Can this unit squash infantry?" flag, read straight off UDATA.CPP's stat
   blocks. Every tracked hull crushes: LTank, MTank, MTank2, HTank (Mammoth), Harvester, APC,
   MineLayer and MCV all carry it. The JEEP and the ARTILLERY explicitly do NOT, which is the
   correction this file supplied - `light` and `heavy` were missing from this table, and the
   Scout Buggy was never meant to be here in the first place. */
var RTS_CRUSHERS = { tank:1, light:1, heavy:1, harvester:1 };
var RTS_CRUSH_DIST = 1.5 * 4;   /* Rule.CrushDistance 0x0180 = 1.5 cells */
var RTS_CRUSH_KILL = 0.9;       /* world units: close enough to actually run them down */
/* Take_Damage: a destroyed vehicle has a 50% chance of throwing out a crew member, who
   starts wounded and runs. Unarmed vehicles produce a technician instead of a soldier. */
var RTS_CREW_CHANCE = 0.5;

/* ------------------------------------------------------------- factions --
   Red Alert is two asymmetric armies, and this roster was one merged list: the Allies' Pillbox
   and the Soviets' Flame Tower and Kennel were all buildable by everyone, so there was nothing
   to choose between and no reason for a faction picker to exist.

   A def now carries an optional `side`. Anything without one is shared - the yard, the economy,
   the basic infantry - which is also how RA does it. What is tagged is what makes the two play
   differently:

     Allied   Pillbox, Gun Turret, Medic, Light Tank, Artillery, Helipad + Attack Heli,
              Commando, Thief
     Soviet   Flame Tower, Tesla Coil, Rocket Turret, Kennel + Attack Dog, Flame Squad,
              Grenadier, Mammoth Tank

   The split is RA's own, not invented here. */
function rtsSideOf(def) { return (def && def.side) || null; }
function rtsBuildableBy(def, side) {
  var s = rtsSideOf(def);
  return !s || s === side;
}
/* Which army a house fields. The player's is their choice; the opponent takes the other one,
   because a mirror match is the one arrangement that makes the whole split pointless. */
function rtsHouseSide(house) {
  var mine = (typeof rtsVoxSide === 'function') ? rtsVoxSide() : 'allied';
  return house === 'player' ? mine : (mine === 'allied' ? 'soviet' : 'allied');
}

/* Armour class per thing, used with a weapon's `verses` table above. */
/* ARMOUR — from CONST.CPP's ArmorName[] and WARHEAD.CPP's Modifier[armor].

   `ArmorName[ARMOR_COUNT] = { "none", "wood", "light", "heavy", "concrete" }`, and a warhead
   carries one multiplier PER ARMOUR CLASS ("Verses=100%,100%,100%,100%,100%" in RULES.INI),
   defaulting to 1 for everything.

   This game had three buckets - infantry / vehicle / building - derived from what a thing IS.
   That is a worse model than RA's, and not by a little: armour is a PROPERTY of the object,
   independent of its category, so a Mammoth and a concrete bunker can share `heavy` while a
   Scout Buggy and a Battle Tank differ even though both are vehicles. Under the old scheme
   every vehicle in the game necessarily took the same multiplier from every weapon.

   The five classes are the port. The numbers in each weapon's `verses` table are still mine -
   they live in RULES.INI, which is a data file rather than source, so they were derived from
   the old three-bucket values to hold the measured balance and will be replaced wholesale if
   that file ever turns up. */
/* BDATA.CPP's IsCaptureable, defaulting the way the original does: a building is capturable
   unless its type says otherwise. Walls and silos are not - there is nothing inside either of
   them for an engineer to take over, and "capture the enemy's wall" is not a plan. */
function rtsCapturable(key) {
  var d = rtsStructDef(key);
  return !d || d.capturable !== false;
}

var RTS_ARMOUR = ['none', 'wood', 'light', 'heavy', 'concrete'];
function rtsArmour(e) {
  var d = (e.type === 'struct') ? rtsStructDef(e.def) : rtsUnitDef(e.def);
  if (d && d.armour) return d.armour;
  /* Anything that has not been given a class explicitly: infantry are ARMOR_NONE in the
     original, everything else falls back to the middle of the range. */
  if (e.type === 'struct') return 'concrete';
  return (d && d.kind === 'infantry') ? 'none' : 'light';
}

/* ------------------------------------------------------------- economy --
   A harvester holds `capacity` scrap; unloading converts it 1:1 to credits.
   Each scrap tile starts with RTS_SCRAP_TILE and is mined at RTS_HARVEST_RATE/s. */
var RTS_START_CREDITS = 3000;   /* RULES.CPP: MPDefaultMoney */
var RTS_SCRAP_TILE = 500;
/* COMBAT.CPP IsTiberiumDestroyer: Reduce_Tiberium(strength / 10), counted in ore LEVELS - a
   full cell holds about twelve. Fighting over an ore field strips it, which is why the patch
   you have been shelling all game is bare by the end. Declared here, after the tile capacity
   it is derived from: a var read before its assignment is NaN, and silently so. */
var RTS_ORE_PER_LEVEL = 500 / 12;
var RTS_HARVEST_RATE = 190;
var RTS_UNLOAD_RATE = 700;      /* scrap/second poured into the refinery */
/* TECHNO.CPP's Time_To_Build, verbatim:
       fixed power = House->Power_Fraction();
       if (power > 1) power = 1;
       if (power < 1 && power > fixed::_3_4) power = fixed::_3_4;
       if (power < fixed::_1_2) power = fixed::_1_2;
   Two things in there that we did not have. The FLOOR is a half, not the 0.28 that was here -
   a browned-out base in the original is slow, not crippled. And there is a DEAD ZONE: anything
   between three quarters and full counts as three quarters, so the moment you dip under 100%
   you pay a flat 25% whether you are at 99% or at 76%. That is what makes staying fully
   powered feel like a real decision rather than a gradient you can ignore. */
var RTS_POWER_BAND = 0.75, RTS_POWER_MIN = 0.5;
var RTS_BUILD_RADIUS = 9;       /* tiles: how far from an existing structure you may build */

/* Ore regrows and spreads, as it does in the original (RULES.CPP: IsTGrowth, IsTSpread,
   GrowthRate). A field you have worked out slowly comes back, so a long game does not
   grind to a halt on a dead map. */
/* RULES.CPP GrowthRate(2) - TWO MINUTES between growth sweeps, not six seconds. Ore was
   regrowing twenty times faster than the original, which is most of why a worked-out field
   here comes back while you watch instead of over the course of a long game. */
var RTS_ORE_GROW_EVERY = 120;
var RTS_ORE_GROW_AMT = 26;      /* added to an existing non-full tile each pass */
var RTS_ORE_SPREAD_CHANCE = 0.10; /* chance a rich tile seeds an empty neighbour */
/* CELL.CPP counts ore in DISCRETE LEVELS - OverlayData 0..11, twelve of them. The thresholds
   below are quoted straight from Can_Tiberium_Grow (`OverlayData >= 11` stops growth) and
   Can_Tiberium_Spread (`OverlayData <= 6` cannot seed), expressed as fractions of a full
   tile so the rest of the economy can keep working in credits. */
var RTS_ORE_LEVELS = 12;
var RTS_ORE_RICHNESS = 0.51;    /* scales _adj so total map wealth matches the old fields */
var RTS_ORE_SPREAD_MIN = 7 / 12;  /* must be ABOVE level 6 to seed a neighbour */
/* MAP.CPP keeps a fixed-size candidate list filled by reservoir sampling, so the cost of a
   growth pass does not scale with how much ore is on the map. */
var RTS_ORE_SAMPLE = 1200;

/* Enemy waves. RULES.CPP has AttackInterval 3 / AttackDelay 5 in MINUTES, which is the
   pacing of a 40-minute skirmish; a match here is a fraction of that, so these are the same
   idea on this game's clock. Difficulty scales both (see RTS_DIFF.build). */
var RTS_WAVE_EVERY = 85;
var RTS_WAVE_FIRST = 150;   /* a refinery costs 1400 and takes 18s - the first wave must not
                               land before a new player has had time to stand up an economy */

/* ---------------------------------------------------------- teams (TEAM.CPP) --
   A TeamTypeClass is a COMPOSITION plus a QUARRY. The team recruits until it is at full
   strength, only then moves out, and picks its target by category rather than by "whatever
   is nearest". That is the whole difference between an opponent that sends a blob at your
   closest building and one that sends three buggies after your harvesters while a separate
   group of rocket soldiers goes for your power.

   `priority` is RecruitPriority, and it does two jobs: a team may steal members from a team
   of LOWER priority, and Suspend_Teams disbands everything below a threshold when the base
   is attacked, freeing those units to defend.

   `reinforce` is IsReinforcable. A team that is not reinforceable is never considered under
   strength once it has set out - "this ensures that once the team has started, it won't
   dally to pick up new members". */
/* --------------------------------------------------- the mission list (TEAMTYPE.CPP) --
   A TeamTypeClass does not carry one standing order. It carries `MissionList[]` - an ordered
   script of team missions, each with one argument - and the team walks an index down it. That
   is the difference between "gather, then beeline at the nearest thing of the right kind" and
   an opponent that stages, takes a flanking route, hits the power plants, and loops.

   TeamMission_Needs is the table that says what argument each mission takes; it is quoted
   here because it is what makes the list parseable at all. The `need` values map straight
   onto the original's NeedType:

     waypoint  NEED_WAYPOINT    a named place on the map
     quarry    NEED_QUARRY      a target CATEGORY, the same QuarryType the team already uses
     number    NEED_NUMBER      a plain count (guard time in 1/10th minutes, or a line number)
     none      NEED_NONE

   Missions deliberately NOT ported, because the subsystems they drive do not exist here:
   FORMATION (no formations), UNLOAD/LOAD/DEPLOY (no transports, nothing deploys), SET_GLOBAL
   (no scenario globals - that is TRIGGER.CPP's world), SPY, HOUND_DOG (follow friendlies),
   DO (assign a raw unit mission), MOVECELL (a raw cell number, which is the thing waypoints
   exist to avoid). Stubs for those would be inventing behaviour, not porting it.
   ATTACKTARCOM is in, because Took_Damage already gives a team a "current target". */
var RTS_TMISSIONS = {
  move:     { need:'waypoint' },  /* TMISSION_MOVE       - go to the waypoint, then advance */
  patrol:   { need:'waypoint' },  /* TMISSION_PATROL     - as move, but engaging on the way */
  attwaypt: { need:'waypoint' },  /* TMISSION_ATT_WAYPT  - clear out whatever is at the waypoint */
  attack:   { need:'quarry'   },  /* TMISSION_ATTACK     - hunt this category of target */
  tarcom:   { need:'none'     },  /* TMISSION_ATTACKTARCOM - kill whatever the team is fixed on */
  guard:    { need:'number'   },  /* TMISSION_GUARD      - hold station, argument in 1/10th min */
  loop:     { need:'number'   }   /* TMISSION_LOOP       - jump to this line of the list */
};
/* "Guard area (1/10th min)..." - the editor's own label for that argument's unit. */
var RTS_GUARD_TICK = 6;          /* seconds per unit of a GUARD mission's argument */
var RTS_WAYPT_ARRIVE = 5 * RTS_TILE;   /* how close counts as having reached a waypoint */

/* `max` is MaxAllowed, and it is per TYPE. Without it the random pick in Suggested_New_Team
   is free to raise six Assault teams and nothing else - both a weaker army and a duller
   opponent than one fielding a mix.

   `autocreate` is IsAutocreate, and the original's filter is a hard SPLIT, not a preference:
   an alerted house draws only from autocreate types, an unalerted house only from the rest.
   So these two lists are the opponent's early game and its late game. A house here is alerted
   once its base has been hit or once RTS_ALERT_TIME has passed - the timer matters, because a
   pure "has been attacked" test would mean a player who never attacks never sees a tank.

   `suicide` is IsSuicide, "charge toward target ignoring distractions": the team will not be
   pulled onto whatever last shot it, and will not stop to let stragglers catch up. */
var RTS_TEAM_TYPES = [
  /* --- before the alert: harassment. Cheap, fast, aimed at the economy. --- */
  { name:'Raiders',  priority:1, reinforce:true,  quarry:'harvester', members:{ buggy:3 },
    max:2, autocreate:false, suicide:false,
    /* Round the outside and come in on the ore, not up the middle into the guns. The list
       ENDS on something decisive: a script whose every step is conditional on a harvester
       existing leaves three buggies looping round an empty ore field forever, which is
       exactly how the first version of this made the opponent weaker rather than smarter. */
    missions:[ ['patrol','flank'], ['attack','harvester'], ['attwaypt','ore'],
               ['attack','buildings'], ['loop',0] ] },
  { name:'Skirmish', priority:2, reinforce:true,  quarry:'anything',  members:{ rifle:4, rocket:1 },
    max:2, autocreate:false, suicide:false,
    missions:[ ['patrol','mid'], ['attack','anything'], ['loop',0] ] },
  /* --- after the alert: the real attack. --- */
  { name:'Sappers',  priority:3, reinforce:false, quarry:'power',     members:{ rocket:3, rifle:2 },
    max:2, autocreate:true,  suicide:false,
    /* Stage off the flank first so the sappers do not walk in through the turrets. */
    missions:[ ['patrol','flank'], ['attack','power'], ['attack','factories'],
               ['attack','buildings'], ['tarcom',0] ] },
  { name:'Assault',  priority:4, reinforce:false, quarry:'buildings', members:{ tank:3, rocket:2 },
    max:2, autocreate:true,  suicide:true,
    /* Straight down the throat and never mind what shoots back. No staging pause and no
       silent approach march: an opening GUARD plus a plain MOVE leg had the heaviest team
       in the game spending its first half-minute not fighting. */
    missions:[ ['patrol','front'], ['attack','buildings'], ['loop',1] ] }
];
var RTS_ALERT_TIME = 150;        /* backstop only: the first attack wave normally alerts the house */

/* ------------------------------------------------- committing the army (mine, not ported) --
   RTS_TEAM_MAX and the per-type `max` are a FLOOR, not a ceiling. A fixed cap on concurrent
   teams means the fraction of the army actually committed collapses as the opponent gets
   richer, and that is precisely what was measured on hard once production was uncapped:

       min 3   army 100   in teams 18   18% committed   82 idle at home
       min 6   army 186   in teams 20   11% committed  165 idle at home

   Four teams, permanently - Sappers x2 and Assault x2, every type pinned at max 2 - so
   Suggested_New_Team returned null on 45 of 51 calls. The opponent's entire offensive
   capacity was 20 units regardless of how large its army grew.

   RA does not hit this because MaxAllowed is authored per scenario against a known army size,
   and because a campaign house also attacks outside the team system. There is no author here,
   so the cap has to derive from the army instead: commit roughly RTS_TEAM_COMMIT of it, in
   teams of about RTS_TEAM_TYPICAL, and never fewer than the authored floor. The hard ceiling
   exists so a runaway economy cannot spawn unbounded teams. */
var RTS_TEAM_MAX = 6;            /* floor: concurrent teams when the army is small */
var RTS_TEAM_MAX_HARD = 22;      /* ceiling: never raise more than this many at once */
var RTS_TEAM_COMMIT = 0.62;      /* share of the field army that should be on the attack */
var RTS_TEAM_TYPICAL = 5;        /* typical team size, for turning that share into a count */
var RTS_SUSPEND_PRIORITY = 3;    /* Rule.SuspendPriority: disband below this when attacked */
var RTS_SUSPEND_DELAY = 40;      /* Rule.SuspendDelay, seconds before a suspended type reforms */
/* Rule.StrayDistance: how far a member may drift from the team centre before it is told to
   regroup, and the radius inside which a new recruit counts as having joined up. */
var RTS_STRAY = 9 * RTS_TILE;

function rtsStructDef(k) { for (var i=0;i<RTS_STRUCTS.length;i++) if (RTS_STRUCTS[i].key===k) return RTS_STRUCTS[i]; return null; }
function rtsUnitDef(k)   { for (var i=0;i<RTS_UNITS.length;i++)   if (RTS_UNITS[i].key===k)   return RTS_UNITS[i];   return null; }

/* ============================================================ triggers ==
   TRIGGER.CPP + TEVENT.CPP + TACTION.CPP. A trigger is EVENT(s) -> ACTION(s), plus rules for
   how the events combine and how long the trigger lives. The three files only make sense
   together: TRIGGER.CPP is the machinery, TEVENT.CPP the conditions, TACTION.CPP the effects.

   ------------------------------------------------------------------ events
   TEVENT.CPP's operator() sorts events into three classes and treats them completely
   differently. Getting this taxonomy wrong means either polling something that can only be
   reported, or waiting forever on something that never sends a notification:

     ambient  checked directly against world state, needs nobody to report it
     notify   "the act of calling this routine is tacit proof enough that the event has
              occurred" - true BECAUSE it was reported
     poll     must be verified explicitly against a house

   `who` is the subtlety. TEVENT.CPP does two separate house lookups: the trigger's OWNER for
   credits/just-built/losses/factories, and the event's ARGUMENT house for low-power,
   discovery and the *_DESTROYED family. Conflating them points "all units destroyed" at the
   wrong side.

   Not ported, for want of the subsystems: SPIED, THIEVED, EVAC_CIVILIAN, FAKES_DESTROYED,
   ALL_BRIDGES_DESTROYED, LEAVES_MAP, BUILD_INFANTRY/AIRCRAFT (no separate infantry queue
   event here), and the zone/line-crossing family (no authored zones on a generated map). */
var RTS_TEVENTS = {
  none:            { kind:'none' },
  any:             { kind:'notify', need:'none' },
  attacked:        { kind:'notify', need:'none' },
  destroyed:       { kind:'notify', need:'none' },
  discovered:      { kind:'notify', need:'none' },
  /* TEVENT_TIME's argument is in 1/10th minutes - the same unit as the team GUARD mission
     and the mission timer. It shows up all over the scenario layer. */
  time:            { kind:'ambient', need:'number' },
  globalSet:       { kind:'ambient', need:'number' },
  globalClear:     { kind:'ambient', need:'number' },
  timerExpired:    { kind:'ambient', need:'none' },
  credits:         { kind:'poll', need:'number', who:'owner' },
  nUnitsLost:      { kind:'poll', need:'number', who:'owner' },
  nBuildingsLost:  { kind:'poll', need:'number', who:'owner' },
  build:           { kind:'poll', need:'struct', who:'owner', latch:true },
  buildUnit:       { kind:'poll', need:'unit',   who:'owner', latch:true },
  noFactories:     { kind:'poll', need:'none',   who:'owner' },
  buildingExists:  { kind:'poll', need:'struct', who:'owner' },
  lowPower:        { kind:'poll', need:'house',  who:'arg' },
  houseDiscovered: { kind:'poll', need:'house',  who:'arg' },
  buildingsDestroyed:{ kind:'poll', need:'house', who:'arg' },
  unitsDestroyed:  { kind:'poll', need:'house',  who:'arg' },
  allDestroyed:    { kind:'poll', need:'house',  who:'arg' }
};

/* ----------------------------------------------------------------- actions
   TACTION.CPP's operator(). The RETURN VALUE is load-bearing, not diagnostic: TRIGGER.CPP
   only deletes or resets a trigger `if (ok)`, so an action that reports failure leaves the
   trigger armed to try again next time. That is how a reinforcement with nowhere to land
   retries instead of being silently dropped.

   Not ported: PLAY_MOVIE, PLAY_SPEECH, DZ (drop-zone flare), 1_SPECIAL/FULL_SPECIAL and
   LAUNCH_NUKES (no superweapons), ALLOWWIN (needs HouseClass::Blockage), CREEP_SHADOW
   (no shroud regrowth in this game). */
var RTS_TACTIONS = {
  none:            { need:'none' },
  win:             { need:'house' },
  lose:            { need:'house' },
  text:            { need:'text' },
  playSound:       { need:'sound' },
  createTeam:      { need:'team' },
  destroyTeam:     { need:'team' },
  reinforce:       { need:'team' },
  allHunt:         { need:'house' },
  fireSale:        { need:'house' },
  /* TACTION_AUTOCREATE is nothing but `IsAlerted = true`. It is the ORIGINAL source of the
     flag that TEAMTYPE's autocreate split reads - in a campaign a trigger flips it. The
     wave/timer path in _rtsHouseAlerted is the skirmish fallback for having no author. */
  autocreate:      { need:'house' },
  baseBuilding:    { need:'bool' },
  beginProduction: { need:'house' },
  setGlobal:       { need:'number' },
  clearGlobal:     { need:'number' },
  revealAll:       { need:'none' },
  revealSome:      { need:'waypoint' },
  startTimer:      { need:'none' },
  stopTimer:       { need:'none' },
  setTimer:        { need:'number' },
  addTimer:        { need:'number' },
  subTimer:        { need:'number' },
  destroyObject:   { need:'none' },
  forceTrigger:    { need:'trigger' },
  destroyTrigger:  { need:'trigger' },
  preferredTarget: { need:'quarry' }
};
var RTS_TIMER_TICK = 6;      /* seconds per 1/10th-minute argument, as in TEVENT/TACTION */
/* MINE, not ported, and forced by a difference between the two games. TACTION_TEXT_TRIGGER
   posts to Session.Messages - a LIST, where each entry carries its own lifetime, so a
   repeated message merely stacks. This game has ONE message slot, so a `persistent` trigger
   whose condition stays true (low power, say) re-fires every frame and starves the channel
   completely: measured at 600 posts in 10 seconds, with an unrelated message not surviving a
   single frame. The text action therefore refuses to repeat itself inside this window - and
   refuses by RETURNING FALSE, so TRIGGER.CPP's `if (ok)` gate leaves the trigger armed and
   the repeat lands later, rather than being counted as a firing that did nothing. */
var RTS_MESSAGE_DELAY = 25;

/* ------------------------------------------------------------ the scenario
   THIS LIST IS MINE, NOT PORTED. RA's triggers come from hand-authored campaign scenario
   INIs; this game is a skirmish on a generated map, so there is no author. The engine above
   is the port - these entries are its first scenario, and they are deliberately kept
   BALANCE-NEUTRAL: informational beats only, nothing that raises a team, flips the alert or
   touches production, because the difficulty ladder was measured without them.

     control  how event1 and event2 combine: only | and | or | linked
     persist  volatile (fires once, deletes itself) | semi (fires when the last attachment
              is gone) | persistent (resets its events and repeats)                        */
var RTS_TRIGGERS = [
  { name:'lowpower', house:'player', persist:'persistent', control:'only',
    event1:['lowPower', 'player'],
    action1:['text', 'LOW POWER - production is slowed'] },
  { name:'firstref', house:'player', persist:'volatile', control:'only',
    event1:['build', 'refinery'],
    action1:['text', 'Refinery online. Harvester dispatched.'] },
  { name:'rich', house:'player', persist:'volatile', control:'only',
    event1:['credits', 5000],
    action1:['text', 'Credit reserves high - spend them.'] },
  /* MULTI_AND across time is the reason TDEventClass latches: event 1 can trip minutes
     before event 2 and the trigger still fires. */
  { name:'warned', house:'player', persist:'volatile', control:'and',
    event1:['time', 30], event2:['nBuildingsLost', 2],
    action1:['text', 'Redline is dismantling your base.'],
    action2:['playSound', 'alert'] }
];
