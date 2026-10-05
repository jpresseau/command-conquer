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
    desc:'Fast scout. Shreds infantry, folds against tanks.' },
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
    needs:['radar'], noMovingFire:true, standoff:true,
    side:'allied', armour:'light',
    desc:'Outranges every base defence in the game. Made of paper — never send it in first.' },
  /* The Soviet answer to the Artillery, and the reason it exists is a measured asymmetry rather
     than a wish for parity: see `v2rocket` in rules/weapons.js. Dearer, slower and more fragile
     than the Allied piece, and it hits a building far harder and infantry rather less. */
  { key:'v2rl',     name:'Longshot Rocket',kind:'vehicle',  cost:900,  build:13, hp:140,  speed:5.5, turn:1.2,r:2.0, sight:16, weapon:'v2rocket',
    needs:['radar'], noMovingFire:true, standoff:true,
    side:'soviet', armour:'light',
    desc:'Outranges every base defence. One rocket, slowly — and it dies to anything that reaches it.' },
  { key:'heavy',    name:'Bulwark Tank',  kind:'vehicle',  cost:1700, build:20, hp:820,  speed:6.5, turn:1.3,r:2.2, sight:18, weapon:'heavycannon', weapon2:'coax',
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
  { key:'thief',    name:'Infiltrator',   kind:'infantry', cost:500,  build:7,  hp:45,   speed:7,   turn:6,  r:1.1, sight:12, weapon:null,
    needs:['lab'], steal:0.5, stealFrom:'refinery',
    side:'allied', armour:'none',
    crawl:false, fraidy:false,
    desc:'Walks into an enemy refinery and leaves with half their credits. Unarmed.' },
  /* demo: C4. "Can destroy buildings instantly if she is able to get adjacent to them." */
  { key:'tanya',    name:'Breacher',      kind:'infantry', cost:1200, build:14, hp:130,  speed:8,   turn:7,  r:1.1, sight:16, weapon:'pistols',
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
  { key:'heli',     name:'Wasp Gunship',  kind:'air',      cost:1200, build:15, hp:200,  speed:22,  turn:5.0,r:1.6, sight:20, weapon:'hellfire',
    needs:['helipad'], air:true, ammo:8, rearm:6, alt:14,
    side:'allied', armour:'light',
    desc:'Flies over anything. Eight missiles, then it must return to a pad to reload.' },
  /* The Chinook (RA's TRAN). The verb is the one no ground transport has: five men put down on
     the far side of a channel, a cliff or a wall, where no road reaches. Unarmed, so it never
     goes home to reload (core/move.js), and slower and thinner-skinned than the Attack Heli -
     it is a lift, and a lift caught over the enemy's guns is five men lost with it. It settles
     onto the ground while it waits, to take men on or put them off (core/airspace.js). */
  { key:'tran',     name:'Skylift',       kind:'air',      cost:1000, build:12, hp:140,  speed:18,  turn:3.5,r:1.9, sight:16, weapon:null,
    needs:['helipad'], air:true, alt:14, carries:5, takes:['infantry'],
    side:'allied', armour:'light',
    desc:'Carries five infantry over water, cliffs and walls. Unarmed - keep it away from the guns.' },
  /* THE TWO SOVIET AIRCRAFT, and they do different jobs on purpose - two planes that both kill
     tanks would be one plane with two names.

     The MiG is the tank-killer. Faster than the Attack Heli and harder-hitting, but it carries
     four Mavericks against the Heli's eight missiles, so it lands twice as often and spends more
     of the match on the ground. Anchored against the Heli it is measured beside: 1400 against
     1200 buys +36% speed and +20% damage for half the sorties.

     The Yak is the opposite unit. Cheap, fragile, and useless against armour - what it does is
     strafe massed infantry, which the Soviets otherwise have to answer with a Flame Tower that
     cannot move. At 900 it is the cheapest thing in the game that flies. */
  { key:'mig',      name:'Kestrel',       kind:'air',      cost:1400, build:16, hp:180,  speed:30,  turn:4.0,r:1.5, sight:22, weapon:'maverick',
    needs:['afld'], air:true, ammo:4, rearm:6, alt:16,
    side:'soviet', armour:'light',
    desc:'Fast tank-killer. Four missiles, then back to the airfield — it cannot linger.' },
  { key:'yak',      name:'Shrike',        kind:'air',      cost:900,  build:11, hp:150,  speed:26,  turn:4.5,r:1.3, sight:20, weapon:'strafe',
    needs:['afld'], air:true, ammo:30, rearm:5, alt:15,
    side:'soviet', armour:'light',
    desc:'Strafes infantry. Barely scratches armour — send it at the men, not the tanks.' },
  /* SKY CRANE. The verb is the Skylift's for armour: one vehicle lifted and set down anywhere -
     a tank over a river, a Repair Truck to the front, a Harvester to a field cut off by water.
     The Dominion's lift, as the Skylift is the Compact's. It carries its load slung under it
     (render3d/unit3d.js); shot down over water, the load goes with it. Unarmed. */
  { key:'skycrane', name:'Sky Crane',     kind:'air',      cost:1300, build:14, hp:220,  speed:16,  turn:3.0,r:2.2, sight:16, weapon:null,
    needs:['afld'], air:true, alt:14, carries:1, takes:['vehicle'], slings:true,
    side:'soviet', armour:'light',
    desc:'Lifts one of your vehicles and sets it down anywhere. Order a vehicle onto it, then send the crane where to set it down.' },
  /* PARADROP PLANE. The verb is the DROP: men put down behind a wall without the plane ever
     touching the ground. It waits in the air over its Airfield to be boarded, flies to where it is
     sent, the men jump - a short fall under canopies, unable to act - and it goes home. The
     Dominion's way over a fortified line, as the Skylift is the Compact's way across water.
     Unarmed - core/paradrop.js. */
  { key:'paraplane',name:'Paradrop Plane', kind:'air',     cost:1100, build:12, hp:200,  speed:30,  turn:3.0,r:2.0, sight:18, weapon:null,
    needs:['afld'], air:true, alt:16, carries:5, takes:['infantry'], paradrops:true,
    side:'soviet', armour:'light',
    desc:'Drops five infantry anywhere without landing, then flies home. Board it over the Airfield, then send it at the drop zone.' },
  /* RECON DRONE. The verb is WATCHING A PLACE: cheap and unarmed, it circles wherever it is sent,
     and it is a Spotter in the air - its sight never cut by fog, every gun of its side finding
     what it sees at full reach, and no Jammer hiding anything from it. The Compact's, as the
     Paradrop Plane is the Dominion's - core/drone.js. */
  { key:'drone',    name:'Recon Drone',   kind:'air',      cost:500,  build:7,  hp:90,   speed:24,  turn:5.0,r:1.2, sight:32, weapon:null,
    needs:['helipad'], air:true, alt:18, spots:true, orbits:true,
    side:'allied', armour:'light',
    desc:'Circles wherever you send it and sees everything under it - through fog, fog banks and Jammers. Unarmed.' },
  /* HEAVY BOMBER. The verb is the CARPET: one pass, a line of eight bombs laid across whatever it
     is sent at, hurting everything under it - yours too - and then home to load again. Both
     armies', from either air pad - core/bomber.js. */
  { key:'bomber',   name:'Heavy Bomber',  kind:'air',      cost:2200, build:22, hp:420,  speed:17,  turn:2.2,r:2.6, sight:20, weapon:'carpet',
    needs:['airpad'], air:true, ammo:1, rearm:12, alt:20, carpets:true,
    armour:'light',
    desc:'Lays a line of eight bombs across what you send it at, then flies home to reload. Its bombs hurt your own units too.' },
  /* FLAK TRACK. The verb is ESCORT: the armour column takes its anti-aircraft cover with it.
     Until this, everything that could shoot down an aircraft either stood still (the AA Gun,
     the Rocket Turret) or was a squad on foot (rockets), so a gunship could pick apart a tank
     column anywhere outside a base. Both armies build it, and it cannot fire at the ground at
     all - a specialist, like the AA Gun it is the mobile half of. */
  { key:'flaktrack',name:'Flak Track',    kind:'vehicle',  cost:800,  build:10, hp:260,  speed:12.5,turn:2.4,r:1.8, sight:26, weapon:'trackflak',
    needs:['radar'], tracked:true, armour:'light',
    desc:'Anti-aircraft guns on a half-track. Keeps gunships and jets off your tanks; cannot hit the ground.' },
  /* HOVERCRAFT. The verb is the BEACH: it drives on land and on open water alike (`hover`, the
     third domain - core/grid.js _rtsBlocked), so five men can be carried down a river, across a
     bay and up the far beach without a landing craft, a bridge or a turn of the tide. Fast and
     thin-skinned, with a machine gun for the men waiting on the sand. Torpedoes run under it. */
  { key:'hovercraft',name:'Hovercraft',   kind:'vehicle',  cost:950,  build:11, hp:280,  speed:16,  turn:2.4,r:2.0, sight:18, weapon:'mg',
    needs:['radar'], hover:true, carries:5, takes:['infantry'], armour:'light',
    desc:'Drives on land and water alike. Carries five infantry across a bay and up the far beach; U or UNLOAD puts them down where it stands.' },
  /* BRIDGE LAYER. The verb is the CROSSING: a gap the map gave no bridge over, spanned where the
     player chooses. At the water's edge, DEPLOY (D) turns it into a one-lane bridge of up to
     eight cells across the water ahead - core/bridgelayer.js. Unarmed, and spent in the laying. */
  { key:'bridgelayer',name:'Bridge Layer', kind:'vehicle', cost:1000, build:12, hp:380,  speed:9.5, turn:1.8,r:2.0, sight:16, weapon:null,
    needs:['radar'], bridge:true, tracked:true, armour:'heavy',
    desc:'At the water\'s edge, facing the far bank, press D or BRIDGE: it becomes a bridge of up to eight cells across the gap ahead.' },
  /* MINE LAYER. The verb is DENIAL: a road, a ford or a gap that the enemy will pay to cross.
     Unarmed; it lays a mine where it stands (D, or DEPLOY), five to a load, and a Repair Bay
     loads them back. The mines are invisible to the other side - core/mines.js. */
  { key:'minelayer',name:'Mine Layer',    kind:'vehicle',  cost:900,  build:11, hp:340,  speed:10,  turn:2.0,r:1.9, sight:16, weapon:null,
    needs:['depot'], mines:5, tracked:true, armour:'heavy',
    desc:'Lays hidden mines where it stands - press D or LAY MINE. Five to a load; a Repair Bay restocks it.' },
  /* MINE SWEEPER. The verb is CLEARING: the answer to a minefield, which until now had none but a
     lost tank. Unarmed; finds enemy mines within four cells, shows them, beats out any it reaches,
     and never sets one off - core/sweeper.js. */
  { key:'sweeper',  name:'Mine Sweeper',  kind:'vehicle',  cost:700,  build:10, hp:420,  speed:9,   turn:2.0,r:1.9, sight:16, weapon:null,
    needs:['factory'], sweeps:true, tracked:true, armour:'heavy',
    desc:'Finds enemy mines within four cells and shows them, and clears any it reaches. Never sets one off.' },
  /* SPOTTER. The verb is SEEING FOR OTHERS: fog and the Fog Bank blind the long guns, and this is
     their eyes. Its own sight is never shortened by fog, and every gun of its side finds what it
     sees at full reach - core/spotter.js. A light machine gun for the men who find it. */
  { key:'spotter',  name:'Spotter',       kind:'vehicle',  cost:600,  build:9,  hp:160,  speed:20,  turn:4.0,r:1.6, sight:28, weapon:'mg',
    needs:['radar'], spots:true, armour:'light',
    desc:'Sees through fog, fog banks and enemy Jammers, and your guns can hit anything it sees at their full range.' },
  /* REPAIR TRUCK. The verb is MENDING IN THE FIELD: the Field Medic's aura for vehicles, so a
     battered column is put right where it stands instead of driving home to the Repair Bay. It
     drives to a damaged vehicle near it by itself - core/repairtruck.js. Unarmed. */
  { key:'repairtruck',name:'Repair Truck', kind:'vehicle', cost:800,  build:10, hp:280,  speed:13,  turn:3.0,r:1.8, sight:16, weapon:null,
    needs:['depot'], heals:RTS_TILE * 2.5, healRate:12, healKind:'vehicle', armour:'light',
    desc:'Repairs your vehicles near it, for free, wherever they are. Drives to a damaged one by itself.' },
  /* JAMMER. The verb is CONCEALMENT: parked, it hides its side's units near it from the enemy -
     unseen and untargeted past two cells, until they fire - and fills the enemy's radar with
     static over them. A Spotter sees through it - core/jammer.js. Unarmed. */
  { key:'jammer',   name:'Jammer',        kind:'vehicle',  cost:900,  build:11, hp:300,  speed:11,  turn:2.4,r:1.9, sight:16, weapon:null,
    needs:['radar'], jams:true, tracked:true, armour:'light',
    desc:'Parked, it hides your units within four cells: the enemy cannot see or target them past two cells until they fire. A Spotter or a Recon Drone sees through it.' },
  /* Armoured Personnel Carrier. UDATA.CPP's UnitAPC is IsCrusher with no turret; the transport
     rules are in UNIT.CPP - capacity via Max_Passengers, and, in Death, the half of the branch
     that matters: when a TRANSPORT dies its infantry passengers are unlimboed at the wreck and
     scatter rather than dying with it. That one rule is what makes an APC a good buy instead of
     a coffin, so it is implemented rather than approximated. */
  /* `takes` is what a hold will accept, and it defaults to infantry when a type does not say.
     The APC is a battlefield taxi for men; the landing craft below is a ferry for an army. */
  { key:'apc',      name:'APC',           kind:'vehicle',  cost:850,  build:10, hp:350,  speed:14,  turn:2.4,r:1.9, sight:16, weapon:'mg',
    needs:['barracks'], carries:5, takes:['infantry'], crush:true,
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
  /* `detects` is SONAR: the radius at which this hull finds a submerged boat, against the
     RTS_SUB_DETECT floor everything else has. It is the only reason to own a Destroyer rather
     than two Gunboats, and it is what its own description has always claimed.

     NINE TILES IS DELIBERATE AND WAS RE-TESTED RATHER THAN ASSUMED. e2e/navy measures three
     submarines against three Destroyers - 2,850 credits against 3,000 - and the submarines lose
     all three in about half a minute. That looks like a bug and is not: the Destroyer is the
     designed submarine-killer, in the original and here, and a navy where the cloaked hull also
     beat its counter would leave the Allies nothing to do about it.

     It was tried the other way to be sure. Sonar cut to 5 tiles - inside torpedo range, on the
     theory that the submarine should get its shot away before being found - moved the outcome
     from 50% of the Destroyer fleet surviving to 46%, and changed nothing else. The submarines
     were never losing to detection range; they were losing to 1,500 hit points against 2,100
     while trading damage roughly evenly. The number went back. */
  { key:'destroyer',name:'Destroyer',    kind:'ship',     cost:1000, build:14, hp:700,  speed:11,  turn:1.4,r:2.4, sight:24,
    weapon:'navalheavy', needs:['navalyard'], sea:true, side:'allied', aaOnly:false,
    detects:RTS_TILE * 9,
    armour:'heavy',
    desc:'Heavy guns and long reach. Its sonar finds submarines — the Compact\'s answer to them.' },
  /* THE CRUISER. The Allied line stopped at the Destroyer, which meant the Soviets owned the
     long game at sea: a Missile Sub bombards from 34 and submerges, and nothing Allied reached
     it. This is the counterweight, and it is deliberately not a bigger Destroyer.

     What it is: the longest reach in the game, and a siege piece. What it is not: safe. No
     sonar, the worst turn rate afloat, and a `verses` table that is poor against `heavy` - so
     submarines eat it, which is exactly the relationship the two navies should have. Gated
     behind the Tech Center as well as a yard, because a 2,000-credit hull that arrives at the
     same time as a Gunboat would end the naval game rather than open it.

     1,400 HIT POINTS AND A 3.4-SECOND GUN ARE MEASURED NUMBERS, not a guess at what a capital
     ship should feel like. It shipped at 900 and 4.2 and e2e/navy killed it immediately: one
     Cruiser against two Missile Subs for the same 3,000 credits lost the hull without taking
     one down, 0% against 100%. At this price a Cruiser is always outnumbered - that is what
     being the dearest hull in the game MEANS - so it has to be worth the two it faces, or it is
     a cameo nobody would ever click. */
  { key:'cruiser',  name:'Cruiser',      kind:'ship',     cost:2000, build:22, hp:1400, speed:8,   turn:0.9,r:2.8, sight:28,
    weapon:'cruisergun', needs:['navalyard', 'lab'], sea:true, side:'allied',
    armour:'heavy',
    desc:'Outranges everything afloat and flattens a shoreline. Blind to submarines — never sail one alone.' },
  /* `cloak` is Cloakable, from the stat block. It submerges, and it has to surface to fire -
     see RTS_SUB_SURFACE and _rtsCloakAI. */
  { key:'sub',      name:'Submarine',    kind:'ship',     cost:950,  build:13, hp:500,  speed:10,  turn:1.3,r:2.0, sight:18,
    weapon:'torpedo', needs:['subpen'], sea:true, side:'soviet', cloak:true,
    armour:'heavy',
    desc:'Runs submerged and unseen. Surfaces to fire, and torpedoes anything afloat.' },
  { key:'missilesub',name:'Missile Sub', kind:'ship',     cost:1500, build:18, hp:450,  speed:9,   turn:1.1,r:2.2, sight:26,
    weapon:'subrocket', needs:['subpen'], sea:true, side:'soviet', cloak:true,
    armour:'heavy',
    desc:'Bombards the shore from further out than anything can answer, then submerges again.' },
  /* THE LANDING CRAFT, and it is the only hull BOTH armies build - RA gives the LST to
     everybody, because a boat that carries your tanks is not a weapon, it is a road.
     `needs:['shipyard']` rather than a building key is why that works: `shipyard` is a
     capability the Naval Yard and the Sub Pen both `provide`, so one entry covers both sides
     without a second unit that differs only in whose flag it flies. See _rtsProvides.

     Unarmed, and priced under a Gunboat, because what it buys is reach rather than force -
     the whole of the far shore, on a map where your army stops at the water. Five holds, and
     `takes` lets vehicles in: ferrying five rifle squads across a channel is not what the
     unit is for.

     RA sinks an LST's whole cargo with it and so do we - see _rtsSpillCargo. That is what
     keeps it a decision: a loaded transport is five units and 700 credits in one hull with no
     gun, and the crossing is the risk you are buying. */
  /* FLAK CRUISER. The verb is the UMBRELLA at sea: until this, a fleet had nothing that could
     touch an aircraft, so a gunship could sink a navy for free. Both armies', from either yard
     and a Radar Post. Left idle it keeps station with the nearest ship of its own side
     (`escorts`, core/flakship.js), so the umbrella goes where the fleet goes - core/flakship.js. */
  { key:'flakship', name:'Flak Cruiser', kind:'ship',     cost:1200, build:15, hp:800,  speed:11,  turn:1.4,r:2.4, sight:30,
    weapon:'shipflak', needs:['shipyard', 'radar'], sea:true, escorts:true,
    armour:'heavy',
    desc:'Anti-aircraft guns afloat. Sails with your nearest ship on its own and keeps aircraft off the fleet; cannot hit ships or the shore.' },
  /* MINE BOAT. The Mine Layer's verb at sea: a channel denied. Both armies', from either yard;
     its mines go off under anything afloat, and it loads again alongside its yard. Sonar (the
     Destroyer) finds them - core/seamines.js. */
  { key:'mineboat', name:'Mine Boat',    kind:'ship',     cost:900,  build:11, hp:380,  speed:12,  turn:1.8,r:2.0, sight:16, weapon:null,
    needs:['shipyard'], sea:true, mines:6,
    armour:'heavy',
    desc:'Lays hidden mines in the water where it stands - press D or LAY MINE. Anything afloat sets them off. Six to a load; its yard restocks it.' },
  /* REPAIR TENDER. The Repair Truck's verb at sea: a fleet mended where it fights instead of
     sailing home. Every friendly ship within its reach is brought back up, for free; left idle
     it goes to the nearest damaged one - core/repairtruck.js, `healKind:'ship'`. Unarmed. */
  { key:'tender',   name:'Repair Tender',kind:'ship',     cost:900,  build:12, hp:500,  speed:11,  turn:1.6,r:2.2, sight:16, weapon:null,
    needs:['shipyard'], sea:true, heals:RTS_TILE * 3, healRate:14, healKind:'ship',
    armour:'heavy',
    desc:'Repairs your ships near it, for free, wherever they are. Sails to a damaged one by itself. Unarmed.' },
  /* RIVER MONITOR. The verb is the LOW-WATER BOMBARDMENT: flat-bottomed (`shallow`, its own
     domain), it sits on the tidal flats when the sea goes out and every other hull has to keep
     off them, and shells the coast from right under it. The Dominion's, from its Sub Pen -
     core/monitor.js. */
  { key:'monitor',  name:'River Monitor',kind:'ship',     cost:1300, build:15, hp:750,  speed:9,   turn:1.4,r:2.4, sight:24,
    weapon:'monitorgun', needs:['subpen'], sea:true, shallow:true, side:'soviet',
    armour:'heavy',
    desc:'A flat-bottomed gun barge. At low tide it can sit on the drying flats, where no other ship can go, and shell the shore.' },
  { key:'lst',      name:'Landing Craft',kind:'ship',     cost:700,  build:10, hp:400,  speed:12,  turn:1.6,r:2.4, sight:14, weapon:null,
    needs:['shipyard'], sea:true, carries:5, takes:['infantry', 'vehicle'],
    armour:'heavy',
    desc:'Carries five units, tanks included, across water. Unarmed — and everything aboard goes down with it.' },
  { key:'mcv',      name:'Mobile Yard',   kind:'vehicle',  cost:2500, build:26, hp:600,  speed:5.5, turn:1.2,r:2.2, sight:14, weapon:null,
    needs:['depot'], deploy:'yard', crush:true,
    armour:'light',
    desc:'Unarmed. Deploys into a Command Yard - press D or DEPLOY.' }
];

