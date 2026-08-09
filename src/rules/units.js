/* rules/units.js - RTS_UNITS: every unit kind. Part of rts.rules, the roster. */

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
    desc:'Mines ore fields and unloads at a refinery.' },
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
  /* The Soviet answer to the Artillery, and the reason it exists is a measured asymmetry rather
     than a wish for parity: see `v2rocket` in rules/weapons.js. Dearer, slower and more fragile
     than the Allied piece, and it hits a building far harder and infantry rather less. */
  { key:'v2rl',     name:'V2 Rocket',      kind:'vehicle',  cost:900,  build:13, hp:140,  speed:5.5, turn:1.2,r:2.0, sight:16, weapon:'v2rocket',
    needs:['radar'], noMovingFire:true,
    side:'soviet', armour:'light',
    desc:'Outranges every base defence. One rocket, slowly — and it dies to anything that reaches it.' },
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
  /* THE TWO SOVIET AIRCRAFT, and they do different jobs on purpose - two planes that both kill
     tanks would be one plane with two names.

     The MiG is the tank-killer. Faster than the Attack Heli and harder-hitting, but it carries
     four Mavericks against the Heli's eight missiles, so it lands twice as often and spends more
     of the match on the ground. Anchored against the Heli it is measured beside: 1400 against
     1200 buys +36% speed and +20% damage for half the sorties.

     The Yak is the opposite unit. Cheap, fragile, and useless against armour - what it does is
     strafe massed infantry, which the Soviets otherwise have to answer with a Flame Tower that
     cannot move. At 900 it is the cheapest thing in the game that flies. */
  { key:'mig',      name:'MiG',           kind:'air',      cost:1400, build:16, hp:180,  speed:30,  turn:4.0,r:1.5, sight:22, weapon:'maverick',
    needs:['afld'], air:true, ammo:4, rearm:6, alt:16,
    side:'soviet', armour:'light',
    desc:'Fast tank-killer. Four missiles, then back to the airfield — it cannot linger.' },
  { key:'yak',      name:'Yak',           kind:'air',      cost:900,  build:11, hp:150,  speed:26,  turn:4.5,r:1.3, sight:20, weapon:'strafe',
    needs:['afld'], air:true, ammo:30, rearm:5, alt:15,
    side:'soviet', armour:'light',
    desc:'Strafes infantry. Barely scratches armour — send it at the men, not the tanks.' },
  /* Armoured Personnel Carrier. UDATA.CPP's UnitAPC is IsCrusher with no turret; the transport
     rules are in UNIT.CPP - capacity via Max_Passengers, and, in Death, the half of the branch
     that matters: when a TRANSPORT dies its infantry passengers are unlimboed at the wreck and
     scatter rather than dying with it. That one rule is what makes an APC a good buy instead of
     a coffin, so it is implemented rather than approximated. */
  { key:'apc',      name:'APC',           kind:'vehicle',  cost:850,  build:10, hp:350,  speed:14,  turn:2.4,r:1.9, sight:16, weapon:'mg',
    needs:['barracks'], carries:5, crush:true,
    armour:'heavy',
    desc:'Carries five infantry. Fast and tough; its passengers walk away if it dies.' },
  /* SHIPS. `sea:true` is the whole difference - it flips which half of the map they can move
     through (see _rtsBlocked). They are otherwise ordinary units: they path, they acquire, they
     die the same way.

     Deliberately heavy and expensive relative to their land equivalents. A ship cannot take
     ground and cannot be threatened by most of what the enemy owns, so if it were also cheap
     there would be no reason to build anything else on a map with water. */
  { key:'gunboat',  name:'Gunboat',      kind:'ship',     cost:500,  build:8,  hp:400,  speed:13,  turn:1.8,r:2.0, sight:20,
    weapon:'navalgun', needs:['navalyard'], sea:true, side:'allied',
    armour:'heavy',
    desc:'Cheap escort. Shells the shore and anything afloat.' },
  { key:'destroyer',name:'Destroyer',    kind:'ship',     cost:1000, build:14, hp:700,  speed:11,  turn:1.4,r:2.4, sight:24,
    weapon:'navalheavy', needs:['navalyard'], sea:true, side:'allied', aaOnly:false,
    armour:'heavy',
    desc:'Heavy guns and long reach. The Allied answer to a submarine.' },
  { key:'sub',      name:'Submarine',    kind:'ship',     cost:950,  build:13, hp:500,  speed:10,  turn:1.3,r:2.0, sight:18,
    weapon:'torpedo', needs:['subpen'], sea:true, side:'soviet',
    armour:'heavy',
    desc:'Torpedoes anything afloat. Cannot touch the shore.' },
  { key:'missilesub',name:'Missile Sub', kind:'ship',     cost:1500, build:18, hp:450,  speed:9,   turn:1.1,r:2.2, sight:26,
    weapon:'subrocket', needs:['subpen'], sea:true, side:'soviet',
    armour:'heavy',
    desc:'Bombards the shore from further out than anything can answer.' },
  { key:'mcv',      name:'Mobile Yard',   kind:'vehicle',  cost:2500, build:26, hp:600,  speed:5.5, turn:1.2,r:2.2, sight:14, weapon:null,
    needs:['depot'], deploy:'yard', crush:true,
    armour:'light',
    desc:'Unarmed. Deploys into a Command Yard - press D, or use the Deploy button.' }
];

