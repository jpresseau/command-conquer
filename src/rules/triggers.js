/* rules/triggers.js - TRIGGER/TEVENT/TACTION.CPP: the event and action tables, and the
   scenario's trigger list. Part of rts.rules, the roster. */

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
    action1:['text', 'The enemy is dismantling your base.'],
    action2:['playSound', 'alert'] }
];
