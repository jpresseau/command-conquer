/* rules/roster11.js - batch 11a of the Red Alert 2 roster (docs/roster-ra2.md): four plain
   soldiers of the line, each a weapon with a narrow job. Part of rts.rules. rules/units.js is at
   the 500-line cap, so these join its tables from here, as rules/campaign2.js does the campaign's.

     MARKSMAN      the Compact's sniper: one shot kills a soldier, from twice a rifle's reach - and
                   it cannot scratch a vehicle or a wall (its `heavy` is 0: core/combat.js reads
                   that as organic, anti-personnel and nothing else)
     TANK HUNTER   the Compact's tank destroyer: a hard cannon that only hurts armour
     FLAK TROOPER  the Dominion's anti-air soldier: a flak gun that shoots aircraft and men alike
     LONG GUN      the Compact's base cannon: the farthest-reaching base defence, dark without power */
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
    desc:'A flak gun on foot: brings down aircraft, and is no friend to infantry either. Dominion.' }
);
RTS_STRUCTS.push(
  { key:'longgun',  name:'Long Gun',      w:2, h:2, cost:2000, build:24, hp:1400, power:-100, sight:30,
    needs:['radar'], weapon:'longgun', side:'allied', needsPower:true,
    armour:'concrete',
    desc:'A huge base cannon that outranges every other base defence. Dead without power. Compact.' }
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
              verses:{ none:0.7, wood:1.0, light:1.0, heavy:1.0, concrete:0.8 } }
});
