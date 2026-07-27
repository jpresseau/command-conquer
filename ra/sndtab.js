/* What each sound in Red Alert's archives IS, keyed by its index hash.

   A MIX index stores hashes rather than names, so a sound can only be fetched by asking for a
   name and hashing it - and the game could only ask for names it had guessed. That reached 25
   of the 333 sounds in a normal install. The other 308 were sitting there unreachable.

   This table closes that by identifying them from the other end. Every AUD in the archives was
   decoded BY INDEX, needing no name at all, and matched on its amplitude envelope against a
   set of sounds whose names are known. The envelope rather than the waveform, because the two
   encodings are not sample-identical - one has been through ADPCM - while the shape of the
   loudness over time survives compression and is extremely distinctive for speech. 152 matched
   at correlations of 0.88 to 1.00, most of them exactly 1.00.

   What is stored is a NUMBER PER SOUND - the hash already in the player's own index - and it
   is inert without their archives to look it up in. No audio is here, and none ships.

   The names are descriptive rather than Westwood's own filenames, because the filenames were
   never recovered; the hash makes them unnecessary. Sounds RA does not have (the dozen
   Tiberian Dawn lines in the source set) are simply absent. */
var RA_SNDTAB_SRC = `acknowledged_allied_infantry_1 -1713804844|acknowledged_allied_infantry_2 -1713804842|acknowledged_allied_vehicle_1 -1713804845|acknowledged_allied_vehicle_2 -1713804843|acknowledged_soviet_infantry_1 -1714329132|acknowledged_soviet_infantry_2 -1714329132|acknowledged_soviet_vehicle_1 -1714329133|acknowledged_soviet_vehicle_2 -1714329131|affirmative_allied_infantry_1 -2119375873|affirmative_allied_infantry_2 -2119244801|affirmative_allied_vehicle_1 -2119441409|affirmative_allied_vehicle_2 -2119310337|affirmative_soviet_infantry_1 -2119375877|affirmative_soviet_infantry_2 -2119375877|affirmative_soviet_vehicle_1 -2119441413|affirmative_soviet_vehicle_2 -2119310341|agreed_allied_infantry_1 1976146462|agreed_allied_infantry_2 1976146464|agreed_soviet_infantry_1 1975622174|agreed_soviet_infantry_2 1975622174|as_you_wish_allied_infantry_1 -1511050191|as_you_wish_allied_infantry_2 -1510919119|as_you_wish_soviet_infantry_1 -1511050195|as_you_wish_soviet_infantry_2 -1511050195|at_once_allied_infantry_1 1647630413|at_once_allied_infantry_2 1647761485|at_once_soviet_infantry_1 1647630409|at_once_soviet_infantry_2 1647630409|awaiting_orders_allied_infantry_1 -782110499|awaiting_orders_allied_infantry_2 -782109987|awaiting_orders_allied_vehicle_1 -782110755|awaiting_orders_allied_vehicle_2 -782110243|awaiting_orders_soviet_infantry_1 -916328227|awaiting_orders_soviet_infantry_2 -916328227|awaiting_orders_soviet_vehicle_1 -916328483|awaiting_orders_soviet_vehicle_2 -916327971|base_under_attack -1137119559|building -1205674815|buzzy1 -339346416|canceled 1776280294|chronosphere_sound -1712188182|construction_complete -198240063|death_dedman1 -1850210604|death_dedman10 -641142079|death_dedman2 -1850079532|death_dedman3 -1849948460|death_dedman4 -1849817388|death_dedman5 -1849686316|death_dedman6 -1849555244|death_dedman7 -1849424172|death_dedman8 -1849293100|dog_bark 262117814|dog_growl -1619385904|dog_hurt 127900098|dog_whine 127900094|dog_yes_sir -1173212488|engineer_affirmative -1073157419|engineer_engineering 2044724968|engineer_movin_out 3875041|engineer_yes_sir -200328983|insufficient_funds -65730813|low_power -465893107|mechanic_guffaw -1688086506|mechanic_hot_diggity -132057877|mechanic_howdy -1176229634|mechanic_huh -875069989|mechanic_i_hear_ya -2022586322|mechanic_ill_get_my_wrench -1137761025|mechanic_rise_n_shine -813567980|mechanic_sure_thing_boss -812011472|mechanic_yee_haw -1139201805|mechanic_yes_sir -141049381|medic_affirmative -1073157387|medic_movin_out 3875073|medic_reporting -200857341|medic_yes_sir -200328951|minelay1 -1136596741|mission_accomplished -532740847|mission_failed -531952389|new_construction_options -1711008998|of_course_allied_infantry_1 -174198009|of_course_allied_infantry_2 -174197497|of_course_soviet_infantry_1 -308415737|of_course_soviet_infantry_2 -308415737|primary_building_selected -1341582585|ready_allied_infantry_1 1907454508|ready_allied_infantry_2 1907454510|ready_soviet_infantry_1 1906930220|ready_soviet_infantry_2 1906930222|reinforcements -534842109|reporting_allied_infantry_1 -1714098621|reporting_allied_infantry_2 -1713967549|reporting_allied_vehicle_1 -1714164157|reporting_allied_vehicle_2 -1714033085|reporting_soviet_infantry_1 -1714098625|reporting_soviet_infantry_2 -1714098625|reporting_soviet_vehicle_1 -1714164161|reporting_soviet_vehicle_2 -1714033089|shock_burn_baby_burn -877547494|shock_extra_crispy -2114977008|shock_fully_charged -1513624328|shock_got_juice -2114189072|shock_lets_dance -1783893776|shock_lights_out 2043424506|shock_need_a_jump -1213083618|shock_power_on -1176225036|shock_shocking -1714931472|shock_yesssss -141049393|spy_commander -1847334102|spy_for_king_and_country -1149119440|spy_indeed -1206456059|spy_on_my_way -1176484592|spy_yes_sir -200328927|structure_destroyed -1271454447|tanya_cha_ching 1708931804|tanya_chew_on_this -1071562483|tanya_give_it_to_me -747258824|tanya_im_there -72903197|tanya_kiss_it_bye_bye -1648622344|tanya_laugh -1615746026|tanya_lets_rock -266660075|tanya_shake_it_baby -473984589|tanya_thats_all_you_got -1481776102|tanya_whats_up 1554445299|tanya_yea -880315893|tanya_yes_sir -1493447712|td_canceled -1172518657|tesla_charge_up -1374347515|tesla_zap -1280721880|thief_affirmative -1073157363|thief_movin_out -677782454|thief_ok -2021006252|thief_what -2021784502|thief_yea -2022568910|unable_to_build -68741383|unit_ready -131267801|vehicle_reporting_allied_vehicle_1 -780294129|vehicle_reporting_allied_vehicle_2 -780293617|vehicle_reporting_soviet_vehicle_1 -914511857|vehicle_reporting_soviet_vehicle_2 -914511345|very_well_allied_infantry_1 -40241385|very_well_allied_infantry_2 -40240873|very_well_soviet_infantry_1 -174459113|very_well_soviet_infantry_2 -174459113|yes_sir_allied_infantry_1 -1444877747|yes_sir_allied_infantry_2 -1444746675|yes_sir_allied_vehicle_1 -1444943283|yes_sir_allied_vehicle_2 -1444812211|yes_sir_soviet_infantry_1 -1444877751|yes_sir_soviet_infantry_2 -1444877751|yes_sir_soviet_vehicle_1 -1444943287|yes_sir_soviet_vehicle_2 -1444812215`;

/* name -> hash id, parsed once. */
var RA_SNDTAB = (function () {
  var out = {}, r = RA_SNDTAB_SRC.split('|');
  for (var i = 0; i < r.length; i++) {
    var sp = r[i].lastIndexOf(' ');
    if (sp < 0) continue;
    out[r[i].slice(0, sp)] = parseInt(r[i].slice(sp + 1), 10);
  }
  return out;
})();

var _exp = { RA_SNDTAB: RA_SNDTAB };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.RA_SNDTAB = RA_SNDTAB;
