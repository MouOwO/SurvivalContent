(function(){
    "use strict";
    // Native high-resolution artwork; this mapping never changes reward effects.
    var cfg=GameUI.CustomUIConfig(),entries={
  "frozen_wall": {
    "uri": "s2r://panorama/images/loadingscreens/lich_lord_of_permafrost_lord_of_permafrost/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/lich_frost_shield_png.vtex",
    "position": "56% 50%"
  },
  "recruit_training": {
    "uri": "s2r://panorama/images/loadingscreens/clinkz_the_faith_of_avengers_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/medusa_split_shot_png.vtex",
    "position": "33% 50%"
  },
  "ion_shield": {
    "uri": "s2r://panorama/images/loadingscreens/abaddon_endless_night_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/abaddon_aphotic_shield_png.vtex",
    "position": "66% 50%"
  },
  "weakening_orb": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_alchemist_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/alchemist_acid_spray_png.vtex",
    "position": "55% 50%"
  },
  "divine_wish": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_ogremagi_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/ogre_magi_multicast_png.vtex",
    "position": "60% 50%"
  },
  "tower_growth": {
    "uri": "s2r://panorama/images/loadingscreens/clinkz_the_faith_of_avengers_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/clinkz_strafe_png.vtex",
    "position": "33% 50%"
  },
  "fortifications": {
    "uri": "s2r://panorama/images/loadingscreens/dotapit3_sven_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/sven_warcry_png.vtex",
    "position": "43% 50%"
  },
  "feast": {
    "uri": "s2r://panorama/images/loadingscreens/meepo_crystal_scavenger_loading_screen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/meepo_divided_we_stand_png.vtex",
    "position": "50% 50%"
  },
  "boss_promise": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_ogremagi_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/ogre_magi_bloodlust_png.vtex",
    "position": "60% 50%"
  },
  "far_sighted": {
    "uri": "s2r://panorama/images/loadingscreens/dreamhack_sniper_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/sniper_take_aim_png.vtex",
    "position": "50% 50%"
  },
  "command_change": {
    "uri": "s2r://panorama/images/loadingscreens/tinker_vagrant_loading_screen/loadingscreen_png.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tinker_rearm_png.vtex",
    "position": "43% 50%"
  },
  "infrastructure_maniac": {
    "uri": "s2r://panorama/images/loadingscreens/tinker_vagrant_loading_screen/loadingscreen_png.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tinker_rearm_png.vtex",
    "position": "43% 50%"
  },
  "gunpowder_splash": {
    "uri": "s2r://panorama/images/loadingscreens/dwarven_gyrocopter_loading_screen/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/gyrocopter_flak_cannon_png.vtex",
    "position": "20% 50%"
  },
  "radiant_sapling": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_treant_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/furion_force_of_nature_png.vtex",
    "position": "55% 50%"
  },
  "kick_when_down": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_ogremagi_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/ogre_magi_multicast_png.vtex",
    "position": "60% 50%"
  },
  "tower_network": {
    "uri": "s2r://panorama/images/loadingscreens/bounch_luna_ls/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/luna_lunar_blessing_png.vtex",
    "position": "50% 50%"
  },
  "fiscal_subsidy": {
    "uri": "s2r://panorama/images/loadingscreens/ti6_keyart_bounty_hunter/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/bounty_hunter_track_png.vtex",
    "position": "65% 50%"
  },
  "corrosive_shield": {
    "uri": "s2r://panorama/images/loadingscreens/king_of_vipers_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/viper_corrosive_skin_png.vtex",
    "position": "50% 50%"
  },
  "goblin_duplicator": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_alchemist_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/alchemist_chemical_rage_png.vtex",
    "position": "55% 50%"
  },
  "lucky_watch": {
    "uri": "s2r://panorama/images/loadingscreens/wraith_king_tyrant_of_the_emerald_abyss_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/skeleton_king_reincarnation_png.vtex",
    "position": "55% 50%"
  },
  "nuclear_bomb": {
    "uri": "s2r://panorama/images/loadingscreens/techies_arcana/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/techies_remote_mines_png.vtex",
    "position": "50% 50%"
  },
  "bounty_order": {
    "uri": "s2r://panorama/images/loadingscreens/tinker_vagrant_loading_screen/loadingscreen_png.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tinker_rearm_png.vtex",
    "position": "43% 50%"
  },
  "high_morale": {
    "uri": "s2r://panorama/images/loadingscreens/dark_carnival_loadingscreen/dark_carnival_loadingscreen_legioncommander_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/legion_commander_press_the_attack_png.vtex",
    "position": "70% 50%"
  },
  "in_step": {
    "uri": "s2r://panorama/images/loadingscreens/windranger_wild_wind_loading/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/windrunner_focusfire_png.vtex",
    "position": "30% 50%"
  },
  "construction_order": {
    "uri": "s2r://panorama/images/loadingscreens/tinker_vagrant_loading_screen/loadingscreen_png.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tinker_rearm_png.vtex",
    "position": "43% 50%"
  },
  "internship_certificate": {
    "uri": "s2r://panorama/images/loadingscreens/ti8_invoker_prism_crystal_spellcaster_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/invoker_invoke_png.vtex",
    "position": "40% 50%"
  },
  "bloodthirst_potion": {
    "uri": "s2r://panorama/images/loadingscreens/bloodseeker_relentless_hunter_loading_screen/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/bloodseeker_bloodrage_png.vtex",
    "position": "60% 50%"
  },
  "infrastructure_outsourcing": {
    "uri": "s2r://panorama/images/loadingscreens/magnus_defender_matriarch_loading_screen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/magnataur_empower_png.vtex",
    "position": "50% 50%"
  },
  "burst_potion": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_alchemist_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/alchemist_chemical_rage_png.vtex",
    "position": "55% 50%"
  },
  "iron_fist_policy": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_ogremagi_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/ogre_magi_multicast_png.vtex",
    "position": "60% 50%"
  },
  "training_dummy": {
    "uri": "s2r://panorama/images/loadingscreens/ti8_axe_violent_prisoner_of_war_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/axe_berserkers_call_png.vtex",
    "position": "78% 50%"
  },
  "wall_recovery": {
    "uri": "s2r://panorama/images/loadingscreens/dk_blazing_superiority/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/dragon_knight_dragon_blood_png.vtex",
    "position": "85% 50%"
  },
  "wealthy_start": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_alchemist_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/alchemist_goblins_greed_png.vtex",
    "position": "55% 50%"
  },
  "sharp_volley": {
    "uri": "s2r://panorama/images/loadingscreens/clinkz_the_faith_of_avengers_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/clinkz_strafe_png.vtex",
    "position": "33% 50%"
  },
  "lumberjack_assault": {
    "uri": "s2r://panorama/images/loadingscreens/ti6_keyart_timbersaw/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/troll_warlord_fervor_png.vtex",
    "position": "12% 50%"
  },
  "fortified_defense": {
    "uri": "s2r://panorama/images/loadingscreens/dotapit3_sven_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/sven_warcry_png.vtex",
    "position": "43% 50%"
  },
  "infrastructure_maniac_start": {
    "uri": "s2r://panorama/images/loadingscreens/tinker_vagrant_loading_screen/loadingscreen_png.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tinker_rearm_png.vtex",
    "position": "43% 50%"
  },
  "precision_lumber": {
    "uri": "s2r://panorama/images/loadingscreens/ti6_keyart_timbersaw/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/shredder_whirling_death_png.vtex",
    "position": "12% 50%"
  },
  "peaceful_labor": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_treant_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/treant_living_armor_png.vtex",
    "position": "55% 50%"
  },
  "woodcutting_bounty": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_treant_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/furion_wrath_of_nature_png.vtex",
    "position": "55% 50%"
  },
  "instant_wood": {
    "uri": "s2r://panorama/images/loadingscreens/ti6_keyart_timbersaw/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/shredder_chakram_png.vtex",
    "position": "12% 50%"
  },
  "gold_mining_secret": {
    "uri": "s2r://panorama/images/loadingscreens/ti6_keyart_bounty_hunter/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/bounty_hunter_track_png.vtex",
    "position": "65% 50%"
  },
  "hero_descent": {
    "uri": "s2r://panorama/images/loadingscreens/chen_eye_of_power_chen_eye_of_power_lion_loadingscreen/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/chen_hand_of_god_png.vtex",
    "position": "80% 50%"
  },
  "population_expansion": {
    "uri": "s2r://panorama/images/loadingscreens/meepo_crystal_scavenger_loading_screen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/meepo_divided_we_stand_png.vtex",
    "position": "50% 50%"
  },
  "natures_gift": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_treant_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/furion_force_of_nature_png.vtex",
    "position": "55% 50%"
  },
  "emergency_reinforcement": {
    "uri": "s2r://panorama/images/loadingscreens/huskar_poseidon_huskar_poseidon_loadingscreen/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/huskar_berserkers_blood_png.vtex",
    "position": "20% 50%"
  },
  "wind_strategy": {
    "uri": "s2r://panorama/images/loadingscreens/windranger_wild_wind_loading/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/windrunner_focusfire_png.vtex",
    "position": "30% 50%"
  },
  "allround_tempering": {
    "uri": "s2r://panorama/images/loadingscreens/ti8_invoker_prism_crystal_spellcaster_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/invoker_exort_png.vtex",
    "position": "40% 50%"
  },
  "heavy_hand": {
    "uri": "s2r://panorama/images/loadingscreens/dota_keyart_ogremagi_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/ogre_magi_multicast_png.vtex",
    "position": "60% 50%"
  },
  "first_to_strike": {
    "uri": "s2r://panorama/images/loadingscreens/tiny_astral_order_loading_screen/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/tiny_tree_grab_png.vtex",
    "position": "50% 50%"
  },
  "endless_rebirth": {
    "uri": "s2r://panorama/images/loadingscreens/wraith_king_tyrant_of_the_emerald_abyss_ls/loadingscreen.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/skeleton_king_reincarnation_png.vtex",
    "position": "55% 50%"
  },
  "long_range_volley": {
    "uri": "s2r://panorama/images/loadingscreens/dreamhack_sniper_loadingscreen/loadingscreen_tga.vtex",
    "abilityUri": "s2r://panorama/images/spellicons/sniper_take_aim_png.vtex",
    "position": "50% 50%"
  }
};
    function make(type,parent,cls){var p=$.CreatePanel(type,parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;}
    cfg.SurvivalRogueArt={Resolve:function(id){return entries[String(id)]||null;},Apply:function(front,data){
        var entry=entries[String(data.card_id)];
        front.style.backgroundImage="none";
        front.__rogueHeader=make("Panel",front,"RogueCardHeader");
        if(!entry)return false;
        var art=make("Panel",front,"RogueOptionIllustration");
        art.style.backgroundImage='url("'+entry.uri+'")';
        art.style.backgroundSize="cover";art.style.backgroundPosition=entry.position;art.style.backgroundRepeat="no-repeat";
        return true;
    }};
})();
