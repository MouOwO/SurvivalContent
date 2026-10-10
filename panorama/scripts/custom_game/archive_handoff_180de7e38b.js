(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig(),assets=cfg.ArchiveHandoffAssets,root=$.GetContextPanel(),generation=0,anchor=null,effectOnly=false,raisedTooltipParents=[];
    function p(id){if(root.IsValid&&!root.IsValid())return null;return root.FindChildTraverse(id);}
    function style(el,s){Object.keys(s).forEach(function(k){el.style[k]=s[k];});}
    function palette(panel, inherited) { cfg.ArchiveTheme.Apply(panel, inherited); }
    function img(parent,name,cls){var el=$.CreatePanel('Image',parent,'');el.AddClass(cls);el.SetImage(assets[name]);el.hittest=false;return el;}
    function label(parent,text,cls){var el=$.CreatePanel('Label',parent,'');el.AddClass(cls);el.text=String(text);el.hittest=false;return el;}
    function unlocked(item,category){
        if(item.unlocked!==undefined)return Number(item.unlocked)===1;
        // Achievement progress is not an unlock until the target is completed.
        if(item.completed!==undefined && ['clear','endless','boss','map_level','starjoy_points','gift'].indexOf(category)>=0)return Number(item.completed)===1;
        // Upgrade effects activate at level 1; completed means max level here.
        if(['fragment','building','work'].indexOf(category)>=0)return Number(item.level!==undefined?item.level:item.count)>0;
        if(category==='fishing'&&Number(item.count_known)!==1)return null;
        return item.count!==undefined?Number(item.count)>0:null;
    }
    function progress(item){
        var count=item.count, target=item.target;
        if(item.count_known!==undefined&&Number(item.count_known)!==1)count=undefined;
        return (count!==undefined&&isFinite(Number(count))?String(count):'—')+' / '+(target!==undefined&&Number(target)>0?String(target):'—');
    }
    function isAchievement(category){return ['clear','endless','boss','map_level','starjoy_points','gift'].indexOf(category)>=0;}
    function ownedCount(item){return item.count_known!==undefined&&Number(item.count_known)!==1?'—':item.count!==undefined&&isFinite(Number(item.count))?String(item.count):'—';}
    function cardProgress(item,category){
        if(category==='starjoy_points')return String(item.target);
        if(isAchievement(category))return progress(item);
        if(category==='building'||category==='work')return 'LV'+(Number(item.level)||0)+' / '+(Number(item.target)||1);
        if(category==='fragment')return '碎片 ×'+ownedCount(item);
        return '拥有 ×'+ownedCount(item);
    }
    function condition(item,category){
        if(item.unlock_condition||item.condition_text)return item.unlock_condition||item.condition_text;
        if(category==='clear'&&Number(item.target)>0)return '累计通关 '+(item.rune||'对应难度')+' '+item.target+' 次';
        if(category==='endless'&&Number(item.target)>0)return '无尽累计积分达到 '+item.target+' 分';
        return '以当前存档配置为准（服务端未提供独立条件说明）';
    }
    // Pixel-space positioning, converted to root UI units only at the final assignment.
    function place(rect,tip,w,h,gap,pad){
        var x=rect.x+rect.w+gap,side='right';
        if(x+tip.w>w-pad){x=rect.x-gap-tip.w;side='left';}
        return {x:Math.max(pad,Math.min(x,w-tip.w-pad)),y:Math.max(pad,Math.min(rect.y+16,h-tip.h-pad)),side:side};
    }
    function hide(){generation++;
        raisedTooltipParents.forEach(function(e){if(e.panel.IsValid()&&String(e.panel.style.zIndex)==='100012')e.panel.style.zIndex=e.z;});raisedTooltipParents=[];if(anchor&&anchor.IsValid())anchor.RemoveClass('ArchiveHovered');anchor=null;var tip=p('ArchiveTooltip');if(tip&&tip.IsValid())tip.AddClass('ArchiveHidden');}
    function position(g){
        if(root.IsValid&&!root.IsValid()||g!==generation||!anchor||!anchor.IsValid())return;
        var tip=p('ArchiveTooltip'),sx=root.actualuiscale_x||1,sy=root.actualuiscale_y||1;
        if(!tip||tip.IsValid&&!tip.IsValid())return;
        var w=root.actuallayoutwidth||1920,h=root.actuallayoutheight||1080;
        // The card may be any category or modal size. Measure its transformed
        // screen rectangle instead of assuming one historical archive grid.
        tip.style.transform='none';
        tip.style.maxHeight=Math.floor(h/sy-24)+'px';
        p('ArchiveTooltipBody').style.maxHeight=tip.style.maxHeight;
        var pos=anchor.GetPositionWithinWindow(),scaleX=anchor.actualuiscale_x||sx,scaleY=anchor.actualuiscale_y||sy;
        // Layout dimensions already include native UI scale, while inherited
        // CSS transforms are represented by the panel/root scale ratio.
        var r={x:pos.x,y:pos.y,w:(anchor.actuallayoutwidth||128*sx)*(scaleX/sx),h:(anchor.actuallayoutheight||128*sy)*(scaleY/sy)};
        var tipWidth=parseFloat(tip.style.width)||parseFloat(cfg.SurvivalArchiveColors.tooltip_width)||460;
        var t={w:tipWidth*sx,h:tip.actuallayoutheight||274*sy};
        var at=place(r,t,w,h,12*sx,12*sx);
        tip.style.position=Math.round(at.x/sx)+'px '+Math.round(at.y/sy)+'px 0px';
        tip.SetAttributeString('expand_side',at.side);
        tip.style.zIndex=effectOnly?'100012':String((Number(p('ArchiveWindow').style.zIndex)||100000)+2);
        $.Schedule(.05,function(){position(g);});
    }
function formatArchiveEffects(value) {
    var source=String(value||'').replace(/\r\n?/g,'\n'),depth=0,out='';
    // Fragment levels are complete rows: keep the LV prefix with its effect.
    // The generic number/space splitter below is only for unstructured effects.
    if(/(^|\n)[ \t]*lv[ \t]*\d+[ \t]+\S/i.test(source)){
        return source.split('\n').map(function(line){
            var row=line.match(/^[ \t]*lv[ \t]*(\d+)[ \t]+(.+?)[ \t]*$/i);
            return row?'LV'+row[1]+' '+row[2]:formatArchiveEffects(line);
        }).filter(function(line){return !!line;}).join('\n');
    }
    for(var i=0;i<source.length;i++){
        var c=source.charAt(i);
        if(c==='('||c==='（'||c==='['||c==='【')depth++;
        if(c===')'||c==='）'||c===']'||c==='】')depth=Math.max(0,depth-1);
        // Preserve numeric grouping (1,000), decimals and parenthetical qualifiers.
        if(!depth&&(c==='；'||c===';'||c==='|'||c==='\n')){out+='\n';continue;}
        if(!depth&&(c==='，'||c===',')&&!(c===','&&/\d/.test(source.charAt(i-1))&&/\d/.test(source.charAt(i+1)))){out+='\n';continue;}
        if(!depth&&/[ \t]/.test(c)&&/[0-9%％）)]/.test(out.slice(-1))){
            var next=i;while(/[ \t]/.test(source.charAt(next))&&next<source.length)next++;
            if(/[\u3400-\u9fffA-Za-z]/.test(source.charAt(next))){out+='\n';i=next-1;continue;}
        }
        out+=c;
    }
    return out.split('\n').map(function(line){return line.replace(/^\s+|\s+$/g,'');}).filter(function(line){return !!line;}).join('\n');
}

    function escapedEffectText(value){
        return formatArchiveEffects(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function effectMarkup(value, unlockedLevel, unlockedState) {
        // Escape configured text before inserting our own number styling.
        var text=escapedEffectText(value);
        function numbers(line){
            return line.replace(/[+-]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|％)?/g,function(number){return '<font color="'+cfg.SurvivalArchiveColors.number+'">'+number+'</font>';});
        }
        var hasLevel=unlockedLevel!==undefined;
        var current=hasLevel&&isFinite(Number(unlockedLevel))?Math.max(0,Math.floor(Number(unlockedLevel))):0;
        return text.split('\n').map(function(line){
            var level=line.match(/^LV(\d+)\s/);
            if(hasLevel&&level){
                // Locked rows include their numbers in the muted color; no gold leaks through.
                if(Number(level[1])>current)return '<font color="#788b93">'+line+'</font>';
                return '<font color="#e1e8e8">'+numbers(line)+'</font>';
            }
            if(!hasLevel&&unlockedState!==undefined&&unlockedState!==true)return '<font color="#788b93">'+line+'</font>';
            return numbers(line);
        }).join('<br>');
    }
    function show(item,category,card,onlyEffect){
        hide();anchor=card;effectOnly=!!onlyEffect;
        // Auxiliary promotion help uses its actual button when no card argument is provided.
        if(!anchor)return;
        anchor.AddClass('ArchiveHovered');
        var state=unlocked(item,category);
        p('ArchiveTooltip').__archiveEffectOnly=effectOnly;
        var divider=p('ArchiveTooltipDivider');if(divider)divider.visible=!effectOnly;
        p('ArchiveTooltipState').visible=!effectOnly;
        p('ArchiveTooltipProgressRow').visible=!effectOnly;
        p('ArchiveTooltipName').text=item.name||'';
        p('ArchiveTooltipStateText').text=state===null?'状态待同步':state?'已解锁':'未解锁';
        p('ArchiveTooltipStateIcon').SetImage(assets[state?'icon_check_light.png':'icon_lock_light.png']);
        var unlockText=item.unlock_condition||item.condition_text||'';
        p('ArchiveTooltipCondition').text=unlockText;
        p('ArchiveTooltipCondition').visible=!effectOnly&&!!unlockText;
        p('ArchiveTooltipCondition').style.visibility=(!effectOnly&&unlockText)?'visible':'collapse';
        p('ArchiveTooltipProgress').text=isAchievement(category)?progress(item):(category==='building'||category==='work')?cardProgress(item,category):ownedCount(item);
        var progressLabel=p('ArchiveTooltipProgressLabel');
        if(progressLabel)progressLabel.text=isAchievement(category)?'当前进度':(category==='building'||category==='work')?'当前等级':category==='fragment'?'持有碎片':'拥有数量';
        var track=p('ArchiveTooltipProgressTrack');
        if(!track){
            track=$.CreatePanel('Panel',p('ArchiveTooltipBody'),'ArchiveTooltipProgressTrack');
            var fill=$.CreatePanel('Panel',track,'ArchiveTooltipProgressFill');
            track.hittest=false;fill.hittest=false;
        }
        var maximum=Number(item.target),current=(category==='building'||category==='work')?Number(item.level):Number(item.count);
        var progressKnown=item.count_known===undefined||Number(item.count_known)===1;
        track.visible=!effectOnly&&progressKnown&&maximum>0&&isFinite(current)&&(isAchievement(category)||category==='building'||category==='work');
        p('ArchiveTooltipProgressFill').style.width=(track.visible?Math.max(0,Math.min(100,current/maximum*100)):0)+'%';
        var details=item.unlock_condition||item.condition_text||'';
        if(!details&&isAchievement(category))details=condition(item,category);
        if(category==='building'||category==='work')details+=(details?'\n':'')+(Number(item.completed)===1?'已达到最高等级':('点击'+(category==='building'?'升级':'激活')+' · 消耗 '+item.cost+(category==='building'?' 信仰值':' 软妹币')));
        if(category==='titles')details+=(details?'\n':'')+(Number(item.equipped)===1?'当前已穿戴 · 点击卸下':state?'点击穿戴称号':'达成条件后解锁称号');
        var source=p('ArchiveCurrencySource'),sourceText=source&&(source.__archivePlainText!==undefined?source.__archivePlainText:source.text);
        if(sourceText&&['building','starjoy_points','work'].indexOf(category)>=0)details+=(details?'\n':'')+String(sourceText).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
        // The compact grid hides its former explanatory footer. Keep the
        // category's configured earning/limit rules in the item detail instead.
        var hint=p('ArchiveHint');
        if(hint&&hint.text&&['clear','endless','shadow','fragment','pet','friend','ex','beast','boss','fishing','map_level','gift'].indexOf(category)>=0)details+=(details?'\n':'')+String(hint.text);
        p('ArchiveTooltipCondition').text=details;
        p('ArchiveTooltipCondition').visible=!effectOnly&&!!details;
        p('ArchiveTooltipCondition').style.visibility=!effectOnly&&details?'visible':'collapse';
        if(effectOnly){
            var ancestors=[],source=card;
            while(source){ancestors.push(source);source=source.GetParent();}
            var parent=root;
            while(parent&&ancestors.indexOf(parent)<0){
                raisedTooltipParents.push({panel:parent,z:String(Number(parent.style.zIndex)||0)});
                parent.style.zIndex='100012';parent=parent.GetParent();
            }
        }
        palette(p('ArchiveTooltip'));
        if(cfg.SurvivalArchivePurple)cfg.SurvivalArchivePurple.Apply();
        // Apply after the shared tooltip palette: locked ordinary effects are
        // plain dim text, so neither inline gold numbers nor palette refresh can relight them.
        var effect=p('ArchiveTooltipEffect');
        var dimEffect=!!item.id&&category!=='fragment'&&state!==true;
        effect.style.color=dimEffect?'#788b93':cfg.SurvivalArchiveColors.body;
        effect.html=true;
        effect.text=dimEffect?escapedEffectText(item.description||'服务端未提供效果说明').replace(/\n/g,'<br>'):
            effectMarkup(item.description||'服务端未提供效果说明',category==='fragment'?(item.level===undefined?0:item.level):undefined,item.id?state:undefined);
        p('ArchiveTooltip').RemoveClass('ArchiveHidden');position(generation);
    }
    function icon(parent,item,category,buildings){
        var art=$.CreatePanel('Panel',parent,'');art.AddClass('ArchiveArt');art.hittest=false;
        if(category==='building'&&buildings[item.id])cfg.SurvivalRewardPresentation.CreateIcon(art,{icon_type:'item',icon:buildings[item.id]},'ArchiveRewardIcon');
        else if(item.icon&&['image','item','ability'].indexOf(item.icon_type)>=0)cfg.SurvivalRewardPresentation.CreateIcon(art,item,'ArchiveRewardIcon');
        else {
            // Preserve the pre-existing semantic icon_style mapping, using this handoff's mapped originals.
            var artId={scroll:'02',seal:'01',crystal:'04',sword:'05',flower:'06',hourglass:'10',shard:'03'}[item.icon_style];
            if(artId)img(art,'art_'+artId+'.png','ArchiveRewardIcon');
            else {art.AddClass('ArchiveMissingArt');label(art,'未配置图标','ArchiveMissingArtText');}
        }
        if(category==='points'){
            var q=String(item.quality||'').toUpperCase();
            if(['N','R','SR','SSR','UR'].indexOf(q)>=0){
                var badge=label(art,q,'ArchiveRarityBadge');
                badge.AddClass('ArchiveRarity_'+q);badge.hittest=false;
            }
        }
        label(parent,cardProgress(item,category),'ArchiveCount');
    }
    // Text belongs to its card. The engine now scrolls and clips both together;
    // no detached labels or timer-driven screen-coordinate copies are involved.
    var cardTextPairs=[],textJob=null,textDirty=true,textLastKey='';
    function stopNativeCardText(){
        if(textJob!==null){$.CancelScheduled(textJob);textJob=null;}
    }
    function updateCardTypography(){
        textJob=null;
        if(!root.IsValid()||!cfg.SurvivalArchive||!cfg.SurvivalArchive.IsOpen())return;
        var win=p('ArchiveWindow'),sx=root.actualuiscale_x||1,sy=root.actualuiscale_y||1;
        var compact=win.BHasClass('ArchivePurple');
        var fit=Math.min((root.actuallayoutwidth||1920)/sx/(compact?1920:1672),(root.actuallayoutheight||1080)/sy/(compact?1080:941));
        var key=[fit,sx,sy].join(':');
        if(textDirty||key!==textLastKey){
            textDirty=false;textLastKey=key;
            var fontSize=Math.round(22*fit*sx)/sx;
            function sizeText(node){
                if(node.BHasClass('ArchiveRarityBadge'))return;
                var C=cfg.SurvivalArchiveColors;
                var role=node.id==='ArchiveTitle'?'archive_title_size':node.id==='ArchiveSubtitle'?'archive_subtitle_size':node.BHasClass('ArchiveNavLabel')?'archive_nav_size':'archive_text_size';
                var target=role==='archive_text_size'?fontSize:role==='archive_title_size'?parseFloat(C[role]):Math.round(parseFloat(C[role])*fit*sx)/sx;
                if(compact){
                    target=node.BHasClass('ArchiveCompactBadge')?16:node.BHasClass('ArchiveNavLabel')?22:node.id==='ArchivePageTitle'?23:node.id==='ArchiveStatus'||node.id==='ArchiveNavScrollHint'?16:18;
                    target*=fit;
                }else if(node.id==='ArchiveStatus'||node.id==='ArchiveNavScrollHint')target=Math.round(18*fit*sx)/sx;
                if(String(node.paneltype||'').toLowerCase()==='label')node.style.fontSize=(target/fit)+'px';
                node.Children().forEach(sizeText);
            }
            sizeText(compact?p('ArchiveBody'):win);
            cardTextPairs.forEach(function(pair){
                if(!pair.label.IsValid()||!pair.host.IsValid())return;
                // Layout width is untransformed. Only convert font size, never position.
                var width=pair.host.actuallayoutwidth/sx;
                if(!width){textDirty=true;return;}
                var units=String(pair.label.text||'').split('').reduce(function(n,c){return n+(c.charCodeAt(0)>255?1:0.55);},0);
                var target=compact?(pair.label.BHasClass('ArchiveCompactBadge')?16:18):fontSize/fit;
                if(pair.label.BHasClass('ArchiveItemName')||pair.label.BHasClass('ArchiveCount'))target=Math.max(target*0.88,Math.min(target,(width-2)/Math.max(1,units)));
                pair.label.style.fontSize=(Math.floor(target*fit*sx)/(fit*sx))+'px';
            });
        }
        // Watch viewport changes only. Scrolling needs no JavaScript work.
        textJob=$.Schedule(0.25,updateCardTypography);
    }
    function nativeCardTypography(){
        var stale=p('ArchiveNativeCardText');
        if(stale){stale.visible=false;stale.DeleteAsync(0);}
        cardTextPairs=[];
        function visit(el,card,promote){
            promote=promote||el.BHasClass('ArchivePromote');
            var name=el.BHasClass('ArchiveItemName'),count=el.BHasClass('ArchiveCount');
            var level=el.BHasClass('ArchiveFragmentLevel'),cost=el.BHasClass('ArchiveWorkCost');
            var button=promote&&String(el.paneltype).toLowerCase()==='label';
            if(name||count||level||cost||button){
                style(el,{fontFamily:'"Source Han Sans SC", "Microsoft YaHei", sans-serif',fontSize:'22px',fontWeight:'normal',
                    fontStyle:'normal',fontStretch:'normal',textShadow:'none',letterSpacing:'0px',
                    brightness:'1',opacity:'1',washColor:'none',transform:'none'});
                el.style.color=name?'#e1e8e8':level?'#acbdc4':button?(el.GetParent().enabled?cfg.SurvivalArchiveColors.button_text:cfg.SurvivalArchiveColors.button_disabled_text):cfg.SurvivalArchiveColors.number;
                if(!button&&card.__archiveUnlocked!==true)el.style.color=name?'#9eafb6':'#788b93';
                if(button)style(el,{width:'100%',textAlign:'center',horizontalAlign:'center',verticalAlign:'center',margin:'0px',padding:'0px'});
                cardTextPairs.push({label:el,host:el.GetParent(),card:card});
            }
            el.Children().forEach(function(c){visit(c,card,promote);});
        }
        p('ArchiveGrid').Children().forEach(function(card){if(card.BHasClass('ArchiveCard'))visit(card,card,false);});
        textDirty=true;
        stopNativeCardText();
        updateCardTypography();
    }
    cfg.ArchiveHandoff={
        HideCardText:stopNativeCardText,
        ApplyPalette:function(){var win=p('ArchiveWindow');palette(win.BHasClass('ArchivePurple')?p('ArchiveBody'):win);nativeCardTypography();},
        Observe:function(data){this.snapshot=data;},
        Unlocked:unlocked,Progress:progress,CardProgress:cardProgress,Condition:condition,Place:place,Hide:hide,Show:show,ShowEffectOnly:function(item,card){show(item,'',card,true);},Icon:icon,
        NavIcon:function(toggle,id,key){var name='archive_ui_kit_v1_'+(id==='clear'?'clear_selected':(key||'clear')+'_normal')+'.png';if(!assets[name])name='archive_ui_kit_v1_clear_selected.png';img(toggle,name,'ArchiveNavIcon');},
        Card:function(card){card.AddClass('ArchiveHandoffCard');
            card.Children().slice().forEach(function(c){
                var count=c.BHasClass('ArchiveCount');
                var level=c.BHasClass('ArchiveFragmentLevel'),cost=c.BHasClass('ArchiveWorkCost');
                if(!count&&!level&&!cost&&!c.BHasClass('ArchiveItemName'))return;
                var host=$.CreatePanel('Panel',card,'');
                host.AddClass(count?'ArchiveCountHost':level?'ArchiveLevelHost':cost?'ArchiveCostHost':'ArchiveNameHost');host.hittest=false;host.hittestchildren=false;
                c.SetParent(host);
            });
        },
        Init:function(){
            p('ArchiveWindow').RemoveClass('UIModal');
            style(p('ArchiveWindow'),{backgroundImage:'none',backgroundColor:'transparent',border:'0px',boxShadow:'none'});
            style(p('ArchiveHeader'),{backgroundImage:'none',backgroundColor:cfg.SurvivalArchiveColors.surface_52});
            p('ArchiveSidebarBacking').SetImage(assets['sidebar_background.png']);p('ArchiveContentBacking').SetImage(assets['content_background.png']);
            p('ArchiveTooltipDivider').SetImage(assets['tooltip_divider.png']);
            p('ArchiveClose').RemoveAndDeleteChildren();img(p('ArchiveClose'),'window_foundation_v1_close_normal.png','ArchiveCloseImage');
            // Keep the shared modal lifecycle/escape/scrim policy; change only its artwork.
            p('ArchiveTooltip').RemoveClass('UITooltip');
            palette(p('ArchiveWindow'));
            cfg.ReferenceWindows.Apply(p('ArchiveWindow'),p('ArchiveHeader'),p('ArchiveClose'));
            palette(p('ArchiveWindow'));
            var emblem=$.CreatePanel('Image',p('ArchiveHeader'),'ArchiveReferenceEmblem');emblem.hittest=false;emblem.SetImage('file://{images}/custom_game/topnav_reference_v2/archive.svg');
            $.Msg('ARCHIVE_HANDOFF_READY compact_native_v3');
        }
    };
    // Read-only diagnostics available solely in this isolated candidate, not a release script.
    var diagnosticGeneration=Date.now();cfg.ArchiveHandoffDiagnosticGeneration=diagnosticGeneration;
    Game.AddCommand('archive_font_probe_'+diagnosticGeneration,function(){
        var probe=$.CreatePanel('Panel',root,'');style(probe,{position:'20px 180px 0px',width:'580px',height:'440px',backgroundColor:'#173743ff',zIndex:'200010',flowChildren:'down'});
        probe.hittest=false;probe.hittestchildren=false;
        var families=['"Source Han Sans SC"','"Source Han Sans SC Medium"','"Source Han Serif SC"','"ArchiveMissingFont_9"','"Radiance"'];
        var samples=families.map(function(f){var row=$.CreatePanel('Panel',probe,'');style(row,{width:'100%',height:'82px',flowChildren:'down'});var name=label(row,f,'');style(name,{fontFamily:'Arial',fontSize:'14px',color:'#fff'});var sample=label(row,'存档 奖池详情 Wmi 012345','');style(sample,{fontFamily:f,fontSize:'32px',fontWeight:f.indexOf('Serif')>=0?'bold':f.indexOf('Medium')>=0?'medium':'normal',width:'fit-children',height:'fit-children',color:'#fff',textOverflow:'clip'});return {family:f,panel:sample};});
        $.Schedule(1,function(){$.Msg('ARCHIVE_FONT_PROBE '+JSON.stringify(samples.map(function(s){return {family:s.family,width:s.panel.actuallayoutwidth,height:s.panel.actuallayoutheight};})));});
        $.Schedule(20,function(){if(probe.IsValid())probe.DeleteAsync(0);});
    },'',0);
    Game.AddCommand('archive_view_action_'+diagnosticGeneration,function(){var args=Array.prototype.slice.call(arguments);$.Msg('ARCHIVE_ACTION_ARGS '+JSON.stringify(args));if(String(args[0]).indexOf('archive_view_action_')===0)args.shift();
        if(args[0]==='open'&&!cfg.SurvivalArchive.IsOpen())cfg.SurvivalArchive.Toggle();
        if(args[0]==='filter')cfg.SurvivalArchive.Filter(args[1]);
        if(args[0]==='hover'){
            var cards=p('ArchiveGrid').Children().filter(function(c){return c.BHasClass('ArchiveCard');});
            var d=cfg.ArchiveHandoff.snapshot,i=Number(args[1]);if(d&&cards[i]&&d.rows[i])show(d.rows[i],d.category_id,cards[i]);
        }
        if(args[0]==='category'){cfg.SurvivalArchive.SelectCategory(args[1]);if(!cfg.SurvivalArchive.IsOpen())cfg.SurvivalArchive.Toggle();}
        if(args[0]==='hide')hide();
        if(args[0]==='close')cfg.SurvivalArchive.Close();
        if(args[0]==='treasure'){cfg.SurvivalArchive.Close();if(p('TreasureWindow').BHasClass('ArchiveHidden'))cfg.SurvivalTreasure.Toggle();}
        if(args[0]==='treasureclose')cfg.SurvivalTreasure.Close();
        if(args[0]==='native'){
            $.Msg('ARCHIVE_CARD_TEXT '+JSON.stringify({detached:!!p('ArchiveNativeCardText'),pairs:cardTextPairs.slice(0,10).map(function(a){return {text:a.label.text,parentIsHost:a.label.GetParent()===a.host,hostIsInCard:a.host.GetParent()===a.card,opacity:a.label.style.opacity,font:a.label.style.fontSize,card:a.card.GetPositionWithinWindow(),label:a.label.GetPositionWithinWindow()};})}));
        }
        if(args[0]==='scroll'&&Game.IsInToolsMode&&Game.IsInToolsMode()){
            if(args[1]==='bottom')p('ArchiveGrid').ScrollToBottom();else p('ArchiveGrid').ScrollToTop();
        }
        if(args[0]==='art'){
            function inspectArt(n){var out=[];function visit(e){if(e.BHasClass('ArchiveArt')||e.BHasClass('ArchiveRewardIcon'))out.push({type:e.paneltype,brightness:e.style.brightness,saturation:e.style.saturation,opacity:e.style.opacity,wash:e.style.washColor});e.Children().forEach(visit);}visit(n);return {bright:n.BHasClass('ArchiveArtAlwaysBright'),locked:n.BHasClass('ArchiveContentLocked'),art:out};}
            $.Msg('ARCHIVE_ART '+JSON.stringify(p('ArchiveGrid').Children().filter(function(n){return n.visible&&n.BHasClass('ArchiveCard');}).slice(0,3).map(inspectArt)));
        }
        if(args[0]==='geometry'){
            function detail(e){var at=e.GetPositionWithinWindow();return {text:e.text||'',type:e.paneltype,xy:at,w:e.actuallayoutwidth,h:e.actuallayoutheight,scale:e.actualuiscale_x,width:e.style.width,position:e.style.position,align:e.style.horizontalAlign,textAlign:e.style.textAlign,font:e.style.fontFamily,size:e.style.fontSize,weight:e.style.fontWeight,transform:e.style.transform};}
            var cards=p('ArchiveGrid').Children().filter(function(c){return c.visible&&c.BHasClass('ArchiveCard');});
            function walk(e,list){e.Children().forEach(function(c){if(c.BHasClass('ArchiveArt')||c.BHasClass('ArchiveCount')||c.BHasClass('ArchiveCountHost')||c.BHasClass('ArchiveItemName'))list.push(detail(c));walk(c,list);});}
            $.Msg('ARCHIVE_GEOMETRY '+JSON.stringify({category:(cfg.ArchiveHandoff.snapshot||{}).category_id,cards:cards.slice(0,5).concat(cards.slice(-5)).map(function(c){var list=[];walk(c,list);return {card:detail(c),children:list};})}));
        }
        if(args[0]==='appearance'){
            var nodes=['ArchiveTitle','ArchiveSubtitle','ArchiveBody','ArchiveContent','ArchiveGrid','ArchiveTooltip'];
            var rows=p('ArchiveTabs').Children().filter(function(n){return n.BHasClass('ArchiveTab');});
            function look(n){return {id:n.id,text:n.text||'',font:n.style.fontSize,background:n.style.backgroundColor,xy:n.GetPositionWithinWindow(),w:n.actuallayoutwidth,h:n.actuallayoutheight};}
            $.Msg('ARCHIVE_APPEARANCE '+JSON.stringify({surfaces:nodes.map(function(id){return look(p(id));}),nav:rows.slice(0,9).map(function(n){return n.Children().filter(function(c){return c.BHasClass('ArchiveNavIcon')||c.BHasClass('ArchiveNavLabel');}).map(look);})}));
        }
        if(args[0]==='audit'){
            var data=cfg.ArchiveHandoff.snapshot||{};
            $.Msg('ARCHIVE_AUDIT '+JSON.stringify({open:cfg.SurvivalArchive.IsOpen(),hidden:p('ArchiveWindow').BHasClass('ArchiveHidden'),visible:p('ArchiveWindow').visible,category:data.category_id,categories:data.categories,rows:(data.rows||[]).length,filter:p('ArchiveFilterAllLabel').text,context:p('ArchiveContext').text,tickets:p('ArchiveTickets').text,status:p('ArchiveStatus').text,tipBackground:p('ArchiveTooltip').style.backgroundColor,effect:{text:p('ArchiveTooltipEffect').text,html:p('ArchiveTooltipEffect').html,color:p('ArchiveTooltipEffect').style.color}}));
        }
    },'',0);
    Game.AddCommand('archive_view_open_'+diagnosticGeneration,function(){cfg.SurvivalArchive.Toggle();$.Msg('ARCHIVE_OPENED');},'',0);
    Game.AddCommand('archive_view_dump_'+diagnosticGeneration,function(){
        var d=cfg.ArchiveHandoff.snapshot||{},t=p('ArchiveTooltip');
        $.Msg('ARCHIVE_VIEW '+JSON.stringify({category:d.category_id,rows:d.rows,root:[root.actuallayoutwidth,root.actuallayoutheight,root.actualuiscale_x,root.actualuiscale_y],window:[p('ArchiveWindow').GetPositionWithinWindow(),p('ArchiveWindow').actuallayoutwidth,p('ArchiveWindow').actuallayoutheight],tip:[t.GetPositionWithinWindow(),t.actuallayoutwidth,t.actuallayoutheight,t.actualuiscale_x,t.actualuiscale_y,t.GetAttributeString('expand_side','')],grid:p('ArchiveGrid').Children().filter(function(c){return c.BHasClass('ArchiveCard');}).map(function(c){return {xy:c.GetPositionWithinWindow(),w:c.actuallayoutwidth,h:c.actuallayoutheight};})}));
    },'',0);
    $.Msg('ARCHIVE_DIAGNOSTIC archive_view_dump_'+diagnosticGeneration);
})();
