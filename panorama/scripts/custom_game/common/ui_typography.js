(function () {
    "use strict";
    // Diagnostics only. The native client registers panorama/fonts/; no JS loader exists here.
    var cfg=GameUI.CustomUIConfig(),host=$.GetContextPanel(),test=null;
    cfg.SurvivalTypography={
        ReadableText:function(value){
            // Source Han has no emoji glyphs; keep resource amounts readable.
            return String(value===undefined?"":value).replace(/\uD83D\uDCB0/g,"金币").replace(/\uD83C\uDF32/g,"木材");
        },
        ShowTest:function(){
            if(test&&test.IsValid())return;
            test=$.CreatePanel("Panel",host,"SurvivalFontTestHost");
            test.style.width="100%";test.style.height="100%";test.style.zIndex="100100";
            test.BLoadLayout("file://{resources}/layout/custom_game/font_test.xml",false,false);
            if(cfg.SurvivalUILayers)cfg.SurvivalUILayers.Open("font_test",test,cfg.SurvivalTypography.CloseTest);
            $.Msg("[UI_FONT_TEST] Compare glyphs and weights; font-family alone is not proof of loaded face.");
        },
        CloseTest:function(){
            if(cfg.SurvivalUILayers)cfg.SurvivalUILayers.Close("font_test");
            if(test&&test.IsValid())test.DeleteAsync(0);
            test=null;
        }
    };
})();
