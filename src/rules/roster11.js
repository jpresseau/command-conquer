/* rules/roster11.js - batch 11a of the Red Alert 2 roster (docs/roster-ra2.md): four plain
   soldiers of the line, each a weapon with a narrow job. Part of rts.rules. rules/units.js is at
   the 500-line cap, so these join its tables from here, as rules/campaign2.js does the campaign's.

     MARKSMAN      the Compact's sniper: one shot kills a soldier, from twice a rifle's reach - and
                   it cannot scratch a vehicle or a wall (its `heavy` is 0: core/combat.js reads
                   that as organic, anti-personnel and nothing else)
     TANK HUNTER   the Compact's tank destroyer: a hard cannon that only hurts armour
     FLAK TROOPER  the Dominion's anti-air soldier: a flak gun that shoots aircraft and men alike
     LONG GUN      the Compact's base cannon: the farthest-reaching base defence, dark without power

   ...and batch 11b, four with a verb of their own:

     MULTI-ROLE CARRIER  the Compact's: one soldier rides in it, and its gun is his (core/ifv.js)
     MARSHAL             the Dominion's: lases a building or a vehicle, and two jets come in and
                         bomb it (core/marshal.js); one at a time
     LEECH DRONE         the Dominion's: climbs inside a vehicle and eats it from within, until a
                         repair truck or a repair bay gets it out (core/leech.js)
     GATE                a wall section that opens for its own side and no one else (core/gate.js) */
RTS_UNITS.push(
  { key:'marksman', name:'Marksman',      kind:'infantry', cost:600,  build:9,  hp:80,   speed:6,   turn:6,  r:1.1, sight:32, weapon:'marksgun',
    needs:['radar'],
    side:'allied', armour:'none',
    crawl:true, fraidy:false,
    desc:'Kills a soldier with one shot from twice a rifle\'s reach. Useless against vehicles and buildings. Compact.' },
  { key:'hunter',   name:'Tank Hunter',   kind:'vehicle',  cost:900,  build:11, hp:380,  speed:10,  turn:2.2,r:2.0, sight:20, weapon:'huntgun',
    needs:['radar'],
    side:'allied', armour:'heavy',
    desc:'A hard-hitting cannon that only hurts armour. Keep infantry off it. Compact.' },
  { key:'flakman',  name:'Flak Trooper',  kind:'infantry', cost:300,  build:5,  hp:70,   speed:6,   turn:6,  r:1.1, sight:20, weapon:'flakgun',
    side:'soviet', armour:'none',
    crawl:true, fraidy:true,
    desc:'A flak gun on foot: brings down aircraft, and is no friend to infantry either. Dominion.' },
  /* `ifv` is what each passenger makes of its gun, by the passenger's key: '*' for any other armed
     soldier, and 'fix' / 'heal' keep the carrier's own missiles and add a repairer's or a medic's
     touch round it (core/ifv.js) */
  { key:'ifv',      name:'Multi-role Carrier', kind:'vehicle', cost:700, build:9, hp:260, speed:14, turn:2.6,r:1.8, sight:20, weapon:'ifvmissile',
    carries:1, takes:['infantry'],
    ifv:{ '*':'mg', rocket:'rocket', marksman:'marksgun', flakman:'flakgun', engineer:'fix', medic:'heal' },
    side:'allied', armour:'light',
    desc:'Missiles for aircraft and armour. Put a soldier in it and it fights with his weapon: a rifleman makes it a machine gun, an engineer a repair truck. Compact.' },
  { key:'marshal',  name:'Marshal',       kind:'infantry', cost:1500, build:15, hp:250,  speed:6.5, turn:7,  r:1.1, sight:20, weapon:'marshalgun', weapon2:'lase',
    needs:['lab'], only:1,
    side:'soviet', armour:'none',
    crawl:true, fraidy:false,
    desc:'Shoots infantry, and lases a building or a vehicle for an air strike: two jets come in and bomb it. Only one at a time. Dominion.' },
  { key:'strikejet',name:'Strike Jet',    kind:'air',      cost:100,  build:1,  hp:180,  speed:44,  turn:2.0,r:2.0, sight:12, weapon:null,
    spawned:true, air:true, alt:16, strikes:true, armour:'light',
    desc:'Called in by a Marshal. Flies over, bombs, and is gone.' },
  { key:'leech',    name:'Leech Drone',   kind:'vehicle',  cost:500,  build:7,  hp:100,  speed:18,  turn:4.5,r:1.0, sight:16, weapon:'leechbite',
    side:'soviet', armour:'light',
    desc:'Fast and small. Climbs inside an enemy vehicle and eats it from within; a repair truck or a repair bay gets it out. Dominion.' }
);
RTS_STRUCTS.push(
  { key:'longgun',  name:'Long Gun',      w:2, h:2, cost:2000, build:24, hp:1400, power:-100, sight:30,
    needs:['radar'], weapon:'longgun', side:'allied', needsPower:true,
    armour:'concrete',
    desc:'A huge base cannon that outranges every other base defence. Dead without power. Compact.' },
  { key:'gate',     name:'Gate',          w:1, h:1, cost:150,  build:4,  hp:700,  power:0,    sight:4,
    needs:['barracks'], gate:true, capturable:false,
    armour:'concrete',
    desc:'A wall section that opens for your own units and no one else\'s.' }
);
/* marksgun: 120 kills any soldier but the heaviest in one shot; heavy 0 makes it organic.
   huntgun: armour-piercing - the light and heavy columns are its whole point.
   flakgun: `aa` without `aaOnly`, so it engages the ground too.
   longgun: range 29, past every other defence (the Rocket Turret's 26) - and short of the
   Destroyer's 30 and the Dominion's siege guns' 34, which must each still outreach every defence
   (e2e/navair, unit/rules). */
Object.assign(RTS_WEAPONS, {
  marksgun: { dmg:120, range:30, cool:3.0, shot:'tracer', speed:0, splash:0,
              verses:{ none:1.0, wood:0.05, light:0.1, heavy:0, concrete:0 } },
  huntgun:  { dmg:70, range:20, cool:1.6, shot:'shell', speed:75, splash:0,
              verses:{ none:0.1, wood:0.25, light:1.1, heavy:1.3, concrete:0.2 } },
  flakgun:  { dmg:12, range:18, cool:0.6, burst:2, shot:'tracer', speed:0, splash:1.0, aa:true,
              verses:{ none:0.9, wood:0.15, light:0.8, heavy:0.3, concrete:0.1 } },
  longgun:  { dmg:110, range:29, cool:3.6, shot:'shell', speed:55, splash:3, wall:true,
              verses:{ none:0.7, wood:1.0, light:1.0, heavy:1.0, concrete:0.8 } },
  /* 11b. ifvmissile: the empty carrier's, for aircraft and armour alike. marshalgun: his own
     sidearm, for men. lase: not a shot - the designation (core/marshal.js); `strike` is the raid
     it calls, and its cool is how long until he can call another. leechbite: not a shot either -
     the drone climbing in (core/leech.js); only a vehicle can have one. */
  ifvmissile: { dmg:20, range:22, cool:1.4, burst:2, shot:'missile', speed:40, splash:0.8, aa:true,
                verses:{ none:0.4, wood:0.6, light:1.0, heavy:0.8, concrete:0.5 } },
  marshalgun: { dmg:24, range:16, cool:0.6, shot:'tracer', speed:0, splash:0,
                verses:{ none:1.0, wood:0.3, light:0.3, heavy:0.1, concrete:0.1 } },
  lase:       { dmg:0, range:18, cool:24, shot:'beam', speed:0, splash:0, lase:true,
                strike:{ jets:2, bombs:3, dmg:140, rad:1.6 },
                verses:{ none:0, wood:1, light:1, heavy:1, concrete:1 } },
  leechbite:  { dmg:0, range:2.5, cool:0.5, shot:'tracer', speed:0, splash:0, latch:{ dps:22 },
                verses:{ none:0, wood:0, light:1, heavy:1, concrete:0 } }
});
