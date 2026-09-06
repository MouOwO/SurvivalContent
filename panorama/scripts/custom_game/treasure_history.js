(function () {
    "use strict";
    var opened=false, history=[];
    function p(id){return $("#"+id);}
    function hide(){p("TreasureTooltip").AddClass("ArchiveHidden");}
    function label(parent,text,style){var l=$.CreatePanel("Label",parent,"");l.text=text;l.hittest=false;if(style)l.AddClass(style);}
    function render(){
        hide();p("TreasureCards").RemoveAndDeleteChildren();
        for(var i=0;i<4;i++){
            var card=$.CreatePanel("Panel",p("TreasureCards"),"");card.AddClass("TreasureCard");card.hittestchildren=false;
            var item=history[i];
            label(card,item?String(item.name||"宝").substring(0,1):"·","TreasureGlyph");
            label(card,item?item.name:"尚未选择");
            if(!item){card.AddClass("TreasureVacant");continue;}
            (function(panel,reward){
                panel.SetPanelEvent("onmouseover",function(){if(!opened)return;p("TreasureTooltipName").text=reward.name;p("TreasureTooltipEffect").text=reward.description||"暂无效果说明";p("TreasureTooltip").RemoveClass("ArchiveHidden");});
                panel.SetPanelEvent("onmouseout",hide);
            })(card,item);
        }
    }
    function update(value){
        var data=value&&value.history||{};
        history=Array.isArray(data)?data.slice(0,4):Object.keys(data).sort(function(a,b){return Number(a)-Number(b);}).slice(0,4).map(function(k){return data[k];});
        if(opened)render();
    }
    CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(table,key,value){
        if(String(key)===String(Game.GetLocalPlayerID()))update(value);
    });
    GameUI.CustomUIConfig().SurvivalTreasure={Toggle:function(){
        opened=!opened;p("TreasureWindow").SetHasClass("ArchiveHidden",!opened);hide();
        if(opened){update(CustomNetTables.GetTableValue("survival_rogue_reward",String(Game.GetLocalPlayerID())));render();}
    }};
})();
