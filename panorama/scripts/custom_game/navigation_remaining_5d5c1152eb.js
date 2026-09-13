(function () {
    'use strict';
    var cfg = GameUI.CustomUIConfig(), view = cfg.ArchiveHandoff;
    var originalInit = view.Init, originalIcon = view.NavIcon,originalCard=view.Card;
    var navFiles={"clear":"file://{images}/custom_game/archive_polish_v1/nav/clear.svg","endless":"file://{images}/custom_game/archive_polish_v1/nav/endless.svg","map_level":"file://{images}/custom_game/archive_polish_v1/nav/map_level.svg","work":"file://{images}/custom_game/archive_polish_v1/nav/work.svg","fishing":"file://{images}/custom_game/archive_polish_v1/nav/fishing.svg","building":"file://{images}/custom_game/archive_polish_v1/nav/building.svg","boss":"file://{images}/custom_game/archive_polish_v1/nav/boss.svg"};
    // The supplied sidebar contains eight baked separators. Keep its texture
    // and frame byte-for-byte: conceal only those six-pixel strips with nearby
    // line-free UV regions. The visible separator belongs to each scrolling row.
    var lineY = [69, 137, 200, 262, 326, 389, 451, 514];
    function strip(parent, cls, x, y, width, height, sourceX, sourceY) {
        var panel = $.CreatePanel('Panel', parent, '');
        panel.AddClass(cls); panel.hittest = false; panel.hittestchildren = false;
        panel.style.position = x + 'px ' + y + 'px 0px';
        panel.style.width = width + 'px'; panel.style.height = height + 'px';
        panel.style.backgroundImage = 'url("' + cfg.ArchiveHandoffAssets['sidebar_background.png'] + '")';
        panel.style.backgroundSize = '214px 589px';
        panel.style.backgroundPosition = 'left -' + sourceX + 'px top -' + sourceY + 'px';
        panel.style.backgroundRepeat = 'no-repeat';
        return panel;
    }
    view.NavIcon = function (toggle, id, key) {
        if(navFiles[id]){var glyph=$.CreatePanel('Image',toggle,'');glyph.AddClass('ArchiveNavIcon');glyph.SetImage(navFiles[id]);glyph.SetScaling('stretch-to-fit-preserve-aspect');glyph.hittest=false;glyph.hittestchildren=false;}
        else originalIcon.call(view, toggle, id, key);
        cfg.SurvivalNineSlice.Create(toggle,cfg.ArchiveHandoffAssets['archive_ui_kit_v1_toggle_selected.png'],209,54,[31,18,31,18],'ArchiveNavSelectedFrame');
        strip(toggle, 'ArchiveNavSeparator', 20, 51, 177, 6, 23, 66);
    };
    view.Card=function(card){
        originalCard.call(view,card);
        var base='file://{images}/custom_game/archive_handoff_v1/interaction_components_v2_card_';
        cfg.SurvivalNineSlice.Create(card,base+'normal.png',143,138,[29,33,12,12],'ArchiveNormalFrame');
        cfg.SurvivalNineSlice.Create(card,base+'selected.png',143,138,[29,33,12,12],'ArchiveSelectedFrame');
        // Promotion controls are added after Card() by the existing renderer.
        $.Schedule(0,function(){if(card.IsValid&&!card.IsValid())return;card.Children().forEach(function(c){if(c.BHasClass('ArchivePromote'))cfg.RemainingHandoff.Action(c,false,[88,29,12,10]);});});
    };
    view.Init = function () {
        originalInit.call(view);
        var draw=$.GetContextPanel().FindChildTraverse('ArchiveDraw');
        if(draw)cfg.RemainingHandoff.Action(draw,false,[142,36,20,12]);
        var filters=$.GetContextPanel().FindChildTraverse('ArchiveFilters');
        if(filters)filters.Children().forEach(function(button){
            if(button.Children().some(function(c){return c.BHasClass('ArchiveFilterFrame');}))return;
            ['normal','selected'].forEach(function(state){var selected=state==='selected';cfg.SurvivalNineSlice.AtHeight(button,'file://{images}/custom_game/archive_handoff_v1/filter_'+state+'.png',selected?256:156,selected?76:64,selected?[38,25,38,25]:[24,22,24,22],31,'ArchiveFilterFrame ArchiveFilter_'+state);});
        });
        var backing = $.GetContextPanel().FindChildTraverse('ArchiveSidebarBacking');
        backing.RemoveAndDeleteChildren();
        lineY.forEach(function (y) {
            strip(backing, 'ArchiveStationaryLineRepair', 18, y - 3, 184, 6, 18, y + 5);
        });
    };
})();
