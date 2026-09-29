(function(){
'use strict';
var cfg=GameUI.CustomUIConfig();
function style(el,s){Object.keys(s).forEach(function(k){el.style[k]=s[k];});}
    function palette(panel, inherited) {
        if(!panel)return;
        var C=cfg.SurvivalArchiveColors;
        var has=function(c){return panel.BHasClass&&panel.BHasClass(c);};
        var color=inherited||C.body,id=String(panel.id||"");
        if(has('ArchiveItemName'))color=C.name;
        if(has('ArchiveCount')||has('ArchiveWorkCost')||id==='ArchiveContext')color=C.number;
        if(has('ArchiveFragmentLevel'))color=C.muted;
        if(has('ArchiveUnlockBadge'))color=has('Unlocked')?C.unlocked:C.locked;
        if(has('ArchiveArt'))style(panel,{backgroundImage:'none',backgroundColor:C.icon_surface,border:'1px solid '+C.icon_border,boxShadow:'none'});
        if(has('ArchiveStateIcon'))style(panel,{washColor:has('Unlocked')?C.state_unlocked:C.state_locked});
        if(has('ArchiveTab')||id.indexOf('ArchiveFilter_')===0)color=panel.checked?C.selected:C.tab;
        if(/^(ArchiveTitle|ArchivePageTitle|ArchiveTooltipName)$/.test(id))color=C.heading;
        if(has('ArchiveDetailHeading'))color=C.detail_heading;
        if(/^(ArchiveHint|ArchiveSummary|ArchiveStatus|ArchiveSubtitle|ArchiveTooltipStateText|ArchiveTooltipProgressRow)$/.test(id))color=C.muted;
        if(id==='ArchiveTooltipProgress')color=C.progress;
        if(id==='ArchiveTooltip')style(panel,{backgroundImage:'none',backgroundColor:C.surface_52,border:'1px solid '+C.surface_53,boxShadow:C.tooltip_shadow,opacity:'1',brightness:'1',saturation:'1',washColor:'none'});
        if(id==='ArchiveTooltipBody')style(panel,{backgroundImage:'none',backgroundColor:C.surface_52});
        if(id==='ArchiveTooltipFrame')style(panel,{visibility:'collapse'});
        if(id==='ArchiveDrawBar')style(panel,{flowChildren:'none',position:'18px 502px 0px',width:'600px',height:'54px',margin:'0px',padding:'0px',horizontalAlign:'left',verticalAlign:'top',backgroundColor:C.surface_17,border:'1px solid '+C.surface_27});
        if(id==='ArchiveTickets'){color=C.number;style(panel,{position:'10px 5px 0px',width:'445px',height:'22px',margin:'0px',padding:'0px',horizontalAlign:'left',verticalAlign:'top',textAlign:'left'});}
        if(id==='ArchiveDrawResult')style(panel,{position:'10px 28px 0px',width:'445px',height:'20px',margin:'0px',padding:'0px',horizontalAlign:'left',verticalAlign:'top',textAlign:'left'});
        if(id==='ArchiveDraw')style(panel,{position:'464px 10px 0px',width:'124px',height:'32px',margin:'0px',horizontalAlign:'left',verticalAlign:'top'});
        if(id==='ArchiveDrawResult')color=C.body;
        if(has('ArchivePromote')||id==='ArchiveDraw') {
            color=panel.enabled?C.button_text:C.button_disabled_text;
            style(panel,{backgroundImage:'none',backgroundColor:panel.enabled?C.button:C.button_disabled,border:'1px solid '+C.button_border,opacity:'1',brightness:'1',saturation:'1',washColor:'none',boxShadow:'none'});
        }
        // Font family and size belong to CSS. A runtime family override can
        // invalidate the engine's resolved font metrics during palette refresh.
        if(String(panel.paneltype||'').toLowerCase()==='label' || (panel.text !== undefined && !panel.SetImage))style(panel,{color:color,textShadow:'none',opacity:'1',washColor:'none'});
        if(panel.Children)panel.Children().forEach(function(child){palette(child,color);});
    }
cfg.ArchiveTheme={Apply:palette};
})();
