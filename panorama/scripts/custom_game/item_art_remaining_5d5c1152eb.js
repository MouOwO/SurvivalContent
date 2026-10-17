(function(){
    'use strict';
    var cfg=GameUI.CustomUIConfig(),entries=[],index={};
    entries.forEach(function(row){
        index[row.item_id]=row;
        if(row.content_id)index[row.content_id]=row;
    });
    function lookup(item){
        var row=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item);
        return row?{item_id:row.id,content_id:row.id,runtime_uri:row.uri,icon_path:row.uri,
            display_name:row.name,kind:row.kind,vip_level:row.vip_level,quality:row.quality,
            category_id:row.category_id}:null;
    }
    // Approved original atlases; every upgrade resolves through its family.
    function shopArt(value){
        var id=String(value||'').replace(/_shell$/,'').replace(/^shop_proxy_/,'equipment_').replace(/^shop_/,''),m;
        var aliases={item_survival_attack_gloves:1,item_survival_burning_blade:2,item_survival_iron_armor:3,item_survival_death_mask:4,item_survival_small_polar_crystal:6,item_survival_large_polar_crystal:6};
        if(Object.prototype.hasOwnProperty.call(aliases,id))return ['shop',aliases[id]];
        if(/synthesis_gem|molten_upgrade_gem/.test(id))return ['shop',11];
        if(/ice_soul_ember/.test(id))return ['shop',14];
        if(id==='item_survival_infernal_armor')return ['shop',12];
        var items={item_death_mask:4,item_forging_hammer:5,item_small_polar_crystal:6,item_large_polar_crystal:6,item_knowledge_book:7,item_super_knowledge_book:8,service_early_final_boss:9,item_synthesis_gem:11};
        if(Object.prototype.hasOwnProperty.call(items,id))return ['shop',items[id]];
        m=id.match(/^(?:weapon_|item_survival_)(growth_sword|frost_blade|ice_blade|epic_icefire|legend_abyss)_(\d+|max)$/);
        if(m){var rows={growth_sword:0,frost_blade:1,ice_blade:2,epic_icefire:3,legend_abyss:4},row=rows[m[1]],tier=m[2]==='max'?4:Number(m[2]);
            tier=m[2]==='max'?4:row<3?Math.max(0,tier-1):Math.round(tier*4/(row===3?6:10));
            return ['swords',row*5+Math.min(4,tier)];}
        m=id.match(/^(?:equipment_|item_survival_)(attack_gloves|burning_blade|iron_armor|infernal_armor|lava_armor|molten_armor)_(?:\d+|max)$/);
        if(m)return ['shop',({attack_gloves:1,burning_blade:2,iron_armor:3})[m[1]]||12];
        if(/(?:ember|molten|lava)_core/.test(id))return ['shop',10];
        m=id.match(/^challenge_(\d+)$/);if(m){var challenges=[0,1,4,5,5,3,2,7,9,8,10];if(challenges[Number(m[1])-1]!==undefined)return ['challenges',challenges[Number(m[1])-1]];}
        m=id.match(/^rebirth_challenge_(\d+)$/);if(m&&Number(m[1])>=1&&Number(m[1])<=10)return ['challenges',10+Number(m[1])];
        return null;
    }
    // Native Dota inventory art and unit portraits for the shop/challenge entries.
    function nativeArt(value){
        if (/^(?:shop_)?(?:weapon_|item_survival_)ice_blade_(?:[0-9]+|max)$/.test(String(value||""))) return "extreme_cold_blade_v2";
        // Derived from challenge encounter members and their model/portrait configuration.
        var challengePortraits={"challenge_01":"portrait_undying","challenge_02":"portrait_axe","challenge_03":"portrait_clinkz","challenge_04":"portrait_beastmaster","challenge_05":"portrait_beastmaster","challenge_06":"portrait_morphling","challenge_07":"portrait_ember_spirit","challenge_08":"portrait_primal_beast","challenge_09":"portrait_spectre","challenge_10":"portrait_terrorblade","challenge_11":"portrait_necrolyte"};
        var challengeId=String(value||'').replace(/^shop_/,'');
        if(Object.prototype.hasOwnProperty.call(challengePortraits,challengeId))return challengePortraits[challengeId];
        var old=shopArt(value);if(!old)return null;
        var shop=['broadsword','gloves','radiance','platemail','mask_of_madness','mithril_hammer',
            'mystic_staff','tome_of_knowledge','book_of_shadows','portrait_roshan','soul_booster',
            'gem','shivas_guard','heart','point_booster'];
        var swords=['broadsword','lesser_crit','greater_crit','radiance','rapier'];
        var challenges=['quelling_blade','hand_of_midas','portrait_doom_bringer','portrait_crystal_maiden',
            'ultimate_orb','portrait_furion','portrait_roshan','portrait_dragon_knight','portrait_enigma',
            'portrait_ancient_apparition','portrait_nevermore','portrait_skeleton_king','portrait_ogre_magi',
            'portrait_dragon_knight','portrait_terrorblade','portrait_warlock','portrait_doom_bringer',
            'portrait_nevermore','portrait_ancient_apparition','portrait_enigma','portrait_roshan'];
        return old[0]==='shop'?shop[old[1]]:old[0]==='swords'?swords[Math.floor(old[1]/5)]:challenges[old[1]];
    }
    function create(parent,item,className){
        var factory=cfg.SurvivalRewardPresentation;
        var registered=factory&&factory.CreateRegisteredIcon&&factory.CreateRegisteredIcon(parent,item,className);
        if(registered)return registered;
        var native=cfg.SurvivalNativeIcons;
        if(native){var icon=native.Create(parent,item,className);if(icon)return icon;}
        var keys=item?[item.content_id,item.item_id,item.id,item.entry_id,item.shop_entry_id,item.icon]:[];
        var nativeKey=null;
        for(var n=0;n<keys.length&&!nativeKey;n++)nativeKey=nativeArt(keys[n]);
        if(nativeKey){
            var nativeIcon=$.CreatePanel('Image',parent,'');
            if(className)nativeIcon.AddClass(className);
            nativeIcon.SetImage('file://{images}/spellicons/survival/native/'+nativeKey+'.png');
            nativeIcon.SetScaling('stretch-to-cover-preserve-aspect');
            nativeIcon.hittest=false;nativeIcon.hittestchildren=false;return nativeIcon;
        }
        var selected=null;
        for(var k=0;k<keys.length&&!selected;k++)selected=shopArt(keys[k]);
        if(selected){
            var custom=$.CreatePanel('Image',parent,'');
            if(className)custom.AddClass(className);
            custom.SetImage('file://{images}/items/survival_shop_v2/'+selected[0]+'_'+('0'+selected[1]).slice(-2)+'.png');
            custom.SetScaling('stretch-to-cover-preserve-aspect');
            custom.hittest=false;custom.hittestchildren=false;return custom;
        }
        var row=lookup(item);if(!row)return null;
        var icon=$.CreatePanel('Image',parent,'');
        icon.SetImage(row.runtime_uri||'file://{images}/'+row.icon_path);
        icon.SetScaling('stretch-to-cover-preserve-aspect');
        if(className)icon.AddClass(className);
        icon.hittest=false;icon.hittestchildren=false;
        return icon;
    }
    cfg.SurvivalItemArt={Lookup:lookup,Create:create,ResolveOriginal:shopArt,ResolveNative:nativeArt};
    var presentation=cfg.SurvivalRewardPresentation;
    if(presentation){
        var colors={n:'#a8cfb0',r:'#8fc6ec',sr:'#d1a5ea',ssr:'#f0d48a',ur:'#e5b6f1'};
        var originalColor=presentation.OriginalNameColor||presentation.NameColor;
        presentation.OriginalNameColor=originalColor;
        presentation.NameColor=function(q){return colors[String(q||'n').toLowerCase()]||originalColor(q);};
        // Reinstall safely after reload without accumulating nested wrappers.
        var original=presentation.OriginalCreateIcon||presentation.CreateIcon;
        presentation.OriginalCreateIcon=original;
        presentation.CreateIcon=function(parent,item,className){return create(parent,item,className)||original.call(presentation,parent,item,className);};
    }
})();
