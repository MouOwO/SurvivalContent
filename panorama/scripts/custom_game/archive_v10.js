(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),D=cfg.ArchiveV10Data,S=cfg.ArchiveV10Semantics,A=cfg.ArchiveHandoff;
    if(!D||!S||!A)return;
    if(cfg.SurvivalArchive&&cfg.SurvivalArchive.Dispose)cfg.SurvivalArchive.Dispose();
    if(cfg.SurvivalArchiveV10&&cfg.SurvivalArchiveV10.Dispose)cfg.SurvivalArchiveV10.Dispose();
    function createView(){
    if(cfg.SurvivalArchiveV10&&cfg.SurvivalArchiveV10.IsAlive&&cfg.SurvivalArchiveV10.IsAlive())return cfg.SurvivalArchiveV10;
    var sharedFrame=null,canvas=null,gridHost=null,sidebar=null,selection=null,tip=null,tipSurface=null,tipViewport=null,tipBody=null,tipBackground=null,tipFrame=null,tipShadow=null,viewScale=1;
    var active=false,disposed=false,current="",rows=[],categoryRows=[],filters={},balances=[],moved=[],subscriptions=[],sidebarKey="",tooltipEpoch=0,tooltipHideEpoch=0,hover=null,displayKey="";
    var textSpecs={},sidebarButtons={},missingIcons={},fitOptions=null,lastReportedCategory="";
    var order=["clear","shadow","map_level","work","gift","fragment","pet","boss","points","shop","endless","fishing","building","friend","ex","beast"];
    var layers=D.layers;layers.forEach(function(layer){if(layer.kind==="text")textSpecs[layer.id]=layer;});
    var marker=$.CreatePanel("Panel",root,"");marker.visible=false;marker.hittest=false;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function alive(){return !disposed&&valid(root)&&valid(marker);}
    function p(id){return valid(root)?root.FindChildTraverse(id):null;}
    function style(node,values){var cache=node.__v10Style||(node.__v10Style={});Object.keys(values).forEach(function(k){if(cache[k]!==values[k]){node.style[k]=values[k];cache[k]=values[k];}});}
    function pos(node,x,y,w,h){style(node,{position:Math.round(x)+"px "+Math.round(y)+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});}
    function make(type,parent,id,cls){var node=$.CreatePanel(type,parent,id||"");if(cls)node.AddClass(cls);return node;}
    function image(parent,key,x,y,w,h,id){var asset=D.assets[key],node=make("Image",parent,id,"ArchiveV10Image");node.SetImage(asset.file);node.SetScaling("stretch-to-fit");node.hittest=false;node.hittestchildren=false;pos(node,x,y,w===undefined?asset.size[0]:w,h===undefined?asset.size[1]:h);return node;}
    function label(parent,value,x,y,w,h,size,color,align,id){var node=make("Label",parent,id,"ArchiveV10Text");node.hittest=false;node.text=String(value===undefined?"":value);pos(node,x,y,w,h);style(node,{fontFamily:'"Source Han Sans SC"',fontWeight:"normal",fontSize:size+"px",color:color,textAlign:align||"left",textShadow:"none",letterSpacing:"0px"});return node;}
    function specText(parent,id,value,offset){var s=textSpecs[id],b=s.bbox,o=offset||[0,0];return label(parent,value===undefined?s.text:value,b[0]-o[0],b[1]-o[1],b[2]-b[0],b[3]-b[1],s.size,s.color,s.align,"ArchiveV10_"+id);}
    function list(value){return Array.isArray(value)?value:value?Object.keys(value).map(function(k){return value[k];}):[];}
    function nineFrame(parent,key){
        var asset=D.assets[key],spec=D.tooltip.assets[key.replace(/^tooltip_/,"")]||{},insets=spec.nine_slice_ltrb||[10,10,10,10],host=make("Panel",parent,"","ArchiveV10NineFrame"),pieces=[];
        host.__v10Slice={asset:key,insets:insets.slice()};
        for(var r=0;r<3;r++)for(var c=0;c<3;c++){
            var clip=make("Panel",host,"","ArchiveV10Crop"),art=make("Panel",clip,"","ArchiveV10Image");
            // Native Image scaling keeps an aspect-fitted raster inside its
            // resized panel. A panel background explicitly stretches both axes.
            style(clip,{flowChildren:"none",overflow:"clip"});
            style(art,{backgroundImage:'url("'+asset.file+'")',backgroundSize:"100% 100%",backgroundPosition:"0px 0px",backgroundRepeat:"no-repeat",flowChildren:"none"});
            clip.hittest=false;clip.hittestchildren=false;art.hittest=false;art.hittestchildren=false;
            pieces.push({clip:clip,art:art,col:c,row:r});
        }
        host.hittest=false;host.hittestchildren=false;
        host.Resize=function(x,y,w,h){var l=insets[0],t=insets[1],r=insets[2],b=insets[3];w=Math.max(w,l+r);h=Math.max(h,t+b);pos(host,x,y,w,h);var xs=[0,l,asset.size[0]-r,asset.size[0]],ys=[0,t,asset.size[1]-b,asset.size[1]],dx=[0,l,w-r,w],dy=[0,t,h-b,h];pieces.forEach(function(cell){var c=cell.col,r=cell.row,sw=xs[c+1]-xs[c],sh=ys[r+1]-ys[r],dw=dx[c+1]-dx[c],dh=dy[r+1]-dy[r],sx=dw/sw,sy=dh/sh;pos(cell.clip,dx[c],dy[r],dw,dh);pos(cell.art,-xs[c]*sx,-ys[r]*sy,asset.size[0]*sx,asset.size[1]*sy);});};return host;
    }
    function move(id,parent){var node=p(id);if(!valid(node))return null;if(!moved.some(function(x){return x.node===node;}))moved.push({node:node,parent:node.GetParent()});
        // Legacy initialization styles these retained panels between view reloads.
        // Their previous V10 cache no longer describes the actual native style.
        node.__v10Style={};node.SetParent(parent);return node;}
    function fit(){if(!active||!alive())return;viewScale=Number(cfg.SurvivalUI.Fit(p("ArchiveWindow"),root,1672,941,{reference:D.canvas}))||1;}
    function wallet(){if(!alive()||!active||!valid(canvas))return;var catalog=cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.GetCatalog(),b=catalog&&catalog.balances||{};["u_coin","shop_points","shop_gold"].forEach(function(key,i){var value=b[key],known=value!==undefined&&value!==null&&String(value).trim()!==""&&isFinite(Number(value)),text=known?String(Math.floor(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g,","):"—";if(balances[i].text!==text)balances[i].text=text;});}
    function build(){
        var win=p("ArchiveWindow");
        sharedFrame=cfg.SurvivalMenuV10.Adopt({id:"archive",navId:"archive",panel:win,root:root,modal:false,canvasId:"ArchiveV10Canvas",closeId:"ArchiveV10Close",titleId:"ArchiveV10_page_title",sidebarId:"ArchiveV10Sidebar",title:"存档",onClose:function(){cfg.SurvivalArchive.Close();}});
        canvas=sharedFrame.canvas;sidebar=sharedFrame.sidebar;selection=sharedFrame.selection;gridHost=sharedFrame.content;
        ["all","unlocked","locked"].forEach(function(mode,i){var b=[[699,143,132,43],[839,143,131,43],[981,144,131,42]][i],button=make("Button",sharedFrame.header,"ArchiveV10Filter_"+mode,"ArchiveV10Button");pos(button,b[0],b[1],b[2],b[3]);var art=image(button,"filter_default",0,0,b[2],b[3]);var text=specText(button,["filter_all_text","filter_owned_text","filter_unowned_text"][i],undefined,b);button.SetPanelEvent("onactivate",function(){if(!alive()||!valid(button))return;hideTooltip();p("ArchiveGrid").ScrollToTop();cfg.SurvivalArchive.Filter(mode);});filters[mode]={panel:button,art:art,text:text};});
        balances=sharedFrame.resources.map(function(cell){return cell.text;});
        var grid=move("ArchiveGrid",gridHost);pos(grid,0,0,1113,669);grid.style.flowChildren="none";
        move("ArchiveEmpty",canvas);move("ArchiveDrawBar",canvas);move("ArchiveFooter",canvas);move("ArchiveContext",canvas);
        var hint=label(canvas,"",417,185,1095,24,16,"#b8accb","left","ArchiveV10Context");hint.visible=false;
        buildTooltip();
        subscriptions.push(GameEvents.Subscribe("survival_commerce_result",function(){if(active)$.Schedule(0,wallet);}));
    }
    function enter(options){var opening=!active;fitOptions=options||fitOptions;if(fitOptions)fitOptions.reference=D.canvas.slice();if(!valid(canvas))build();active=true;sharedFrame.Open();canvas.visible=true;var win=p("ArchiveWindow");if(opening)win.__v10Style={};win.AddClass("ArchiveV10Page");style(win,{width:"1672px",height:"941px",padding:"0px",margin:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderTop:"0px",borderBottom:"0px",borderRadius:"0px",boxShadow:"none",overflow:"noclip"});fit();if(opening&&cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.Refresh)cfg.SurvivalCommerceWallet.Refresh();}
    function categoryName(id){var i=order.indexOf(id),spec=i>=0?D.sidebar_toggles[i]:null,row=categoryRows.filter(function(x){return x.id===id;})[0];return spec?spec.label:row?row.name:id;}
    function renderSidebar(categories){
        var signature=JSON.stringify(categories||[]);if(signature!==sidebarKey){
            sidebar.Children().forEach(function(child){if(child!==selection)child.DeleteAsync(0);});sidebarButtons={};
            var byId={};list(categories).forEach(function(row){byId[row.id]=row;});var ids=order.slice();list(categories).forEach(function(row){if(ids.indexOf(row.id)<0)ids.push(row.id);});
            ids.forEach(function(id,i){var spec=D.sidebar_toggles[i],b=spec?spec.hit_bbox:[136,897+(i-16)*47,394,944+(i-16)*47],button=make("Button",sidebar,"ArchiveV10Category_"+id,"ArchiveV10Button");pos(button,0,b[1]-128,258,b[3]-b[1]);var t=spec?spec.text_bbox:[156,b[1]+5,372,b[3]-3];var name=spec?spec.label:byId[id].name;var text=label(button,name,t[0]-136,t[1]-b[1],t[2]-t[0],t[3]-t[1],23,"#bbb2d2","right");button.SetPanelEvent("onactivate",function(){if(!alive()||!valid(button))return;hideTooltip();cfg.SurvivalArchive.SelectCategory(id);});sidebarButtons[id]={panel:button,text:text,selectedY:spec?spec.selected_position[1]-128:b[1]-128};});sidebarKey=signature;
        }
        Object.keys(sidebarButtons).forEach(function(id){var cell=sidebarButtons[id];cell.panel.SetHasClass("ArchiveV10Selected",id===current);cell.text.style.color=id===current?"#f4d194":"#bbb2d2";if(id===current)pos(selection,0,cell.selectedY,258,51);});
    }
    function findClass(node,cls){if(node.BHasClass(cls))return node;var children=node.Children();for(var i=0;i<children.length;i++){var found=findClass(children[i],cls);if(found)return found;}return null;}
    function decorate(card,item,slot){
        var g=D.grid_template,col=slot%g.columns,row=Math.floor(slot/g.columns),x=g.column_icon_x[col],y=g.first_row_icon_y+row*g.row_step;
        var nativeIcon=cfg.ArchiveV10Icons&&cfg.ArchiveV10Icons.Resolve(item,current);
        var cell=card.__v10,artKey=JSON.stringify([current,item.id,item.icon,item.icon_type,item.icon_style,nativeIcon&&nativeIcon.iconKey]);
        if(!cell||!valid(cell.host)||cell.artKey!==artKey){
            // The controller owns gameplay handlers. Only its old decorative children are hidden.
            card.Children().forEach(function(child){if(!child.BHasClass("ArchivePromote"))child.visible=false;});
            if(cell&&valid(cell.host))cell.host.DeleteAsync(0);
            var host=make("Panel",card,"ArchiveV10Item_"+item.id,"ArchiveV10ItemVisual");pos(host,0,0,144,170);host.hittest=false;host.hittestchildren=false;
            image(host,"slot_shadow",0,0);
            var art;
            if(current==="shadow"&&D.shadow_icons[item.id]){art=make("Image",host,"","ArchiveV10Icon");art.SetImage(D.shadow_icons[item.id]);art.SetScaling("stretch-to-fit-preserve-aspect");}
            else if(nativeIcon){art=make("Image",host,"","ArchiveV10Icon");art.SetImage(nativeIcon.uri);art.SetScaling("stretch-to-fit-preserve-aspect");}
            else {
                art=findClass(card,current==="titles"?"ArchiveTitleArt":"ArchiveArt");
                if(valid(art)){art.SetParent(host);art.visible=true;art.AddClass("ArchiveV10Icon");}
                else {art=make("Panel",host,"","ArchiveV10Icon");label(art,"未配置图标",0,42,120,30,15,"#c8bbd8","center");if(!missingIcons[current+":"+item.id]){$.Msg("ARCHIVE_V10_MISSING_ICON "+current+":"+item.id);missingIcons[current+":"+item.id]=true;}}
            }
            pos(art,12,9,120,120);style(art,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none",overflow:"clip",brightness:"1",saturation:"1",opacity:"1",washColor:"none",transform:"none"});art.hittest=false;
            if(current==="titles"){
                // Title layers share the original 128:55 stage. Resize the stage
                // as a whole; its percentage masks and depth planes stay intact.
                pos(art,12,43,120,120*55/128);art.style.overflow="noclip";
                if(art.SetScaling)art.SetScaling("stretch-to-fit-preserve-aspect");
            }else if(current!=="shadow")art.Children().forEach(function(child){
                if(child.BHasClass("ArchiveRarityBadge"))return;
                if(child.BHasClass("ArchiveEndlessEmblem")){
                    // Scale the complete 72x56 emblem, preserving its two rings.
                    pos(child,0,13,72,56);style(child,{transformOrigin:"0% 0%",transform:"scale3d(1.666667, 1.666667, 1)"});
                    child.Children().forEach(function(ring){if(ring.BHasClass("ArchiveEndlessRing"))ring.style.transformOrigin="50% 50%";});
                }else if(child.SetImage||child.BHasClass("ArchiveRewardIcon")){
                    pos(child,0,0,120,120);if(child.SetScaling)child.SetScaling("stretch-to-fit-preserve-aspect");style(child,{horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",brightness:"1",saturation:"1",opacity:"1",transform:"none"});
                }
            });
            image(host,"slot_inner_shading",12,9);
            var normal=image(host,"slot_frame_normal",9,6),highlight=image(host,"slot_frame_hover",9,6);highlight.AddClass("ArchiveV10HoverFrame");
            var countHost=make("Panel",host,"","ArchiveV10CountHost");pos(countHost,24,16,101,22);countHost.hittest=false;
            var count=label(countHost,"",0,0,101,22,16,"#eeeaf5","right");count.AddClass("ArchiveV10Count");style(count,{width:"fit-children",maxWidth:"101px",horizontalAlign:"right"});count.style.textShadow="#000000 0px 1px 3px 2.0";
            var name=label(host,"",7,134,130,35,18,"#d9d3e5","center");name.AddClass("ArchiveV10Name");
            cell=card.__v10={host:host,artKey:artKey,art:art,countHost:countHost,count:count,name:name,normal:normal};
        }
        if(cell.host.GetParent()!==card)cell.host.SetParent(card);
        cell.host.visible=true;
        card.Children().forEach(function(child){if(child!==cell.host&&!child.BHasClass("ArchivePromote"))child.visible=false;});
        card.AddClass("ArchiveV10Cell");pos(card,x-12-407,y-9-213,144,170);style(card,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none",overflow:"noclip",flowChildren:"none",transform:"none"});
        var countText=S.Quantity(item,current),nameText=String(item.name||"");if(cell.count.text!==countText)cell.count.text=countText;if(cell.name.text!==nameText)cell.name.text=nameText;style(cell.name,{fontSize:"18px",color:"#d9d3e5"});style(cell.count,{fontSize:"16px",color:"#eeeaf5",backgroundColor:"transparent",textAlign:"right"});
        var promote=findClass(card,"ArchivePromote");if(promote){promote.visible=true;pos(promote,73,108,60,23);}
    }
    function render(data,category,mode,categories,options){
        if(!alive())return false;var changed=current!==category;if(changed)hideTooltip();current=category;categoryRows=list(categories);
        var signature=JSON.stringify([category,mode,data&&data.rows,data&&data.pending,data&&data.upgrade_pending,data&&data.social,data&&data.online,data&&data.buildings,data&&data.fishing,data&&data.starjoy,data&&data.has_pass,data&&data.last_draw,data&&data.unavailable,categories,cfg.SurvivalArchiveColors]);
        if(active&&signature===displayKey){wallet();return true;}displayKey=signature;enter(options);renderSidebar(categories);
        p("ArchiveV10_page_title").text=categoryName(current);
        var ownership=["shadow","pet","fishing","friend","ex","beast","points","shop"].indexOf(current)>=0;
        filters.unlocked.text.text=ownership?"已拥有":"已解锁";
        Object.keys(filters).forEach(function(key){filters[key].art.SetImage(D.assets[key===(mode||"all")?"filter_selected":"filter_default"].file);});
        rows=data?list(data.rows):S.Normalize(null,current);var slot=0;
        p("ArchiveGrid").Children().forEach(function(card){if(card.BHasClass("ArchiveCard")&&card.visible&&card.__archiveCategory===current)decorate(card,card.__archiveItem,slot++);});
        if(!data){p("ArchiveGrid").Children().forEach(function(card){card.visible=false;});slot=0;}
        var draw=["friend","ex","beast"].indexOf(current)>=0,context=p("ArchiveV10Context"),details="";
        if(current==="map_level"&&data&&data.online)details="当前地图等级 "+data.online.level;
        if(current==="work"&&data&&data.online)details="软妹币："+data.online.coins;
        if(current==="building"&&data&&data.buildings)details="信仰值："+data.buildings.faith;
        if(current==="fishing"&&data&&data.fishing&&data.fishing.faith!==undefined)details="信仰值："+data.fishing.faith;
        if(current==="starjoy_points"&&data&&data.starjoy)details="累计星悦积分 "+data.starjoy.earned+" · 可用余额 "+data.starjoy.balance;
        context.text=details;context.visible=!!details;
        var empty=p("ArchiveEmpty");pos(empty,417,279,1095,42);style(empty,{fontSize:"21px",color:"#b8accb",textAlign:"center"});empty.SetHasClass("ArchiveHidden",slot>0);empty.text=data&&Number(data.unavailable)===1?"该分类尚未启用，暂无已获得条目":!data?"正在读取存档…":slot===0?(mode!=="all"?"当前筛选下暂无存档":"当前分类暂无存档"):"";
        var grid=p("ArchiveGrid");pos(grid,0,0,1113,draw?610:669);style(grid,{flowChildren:"none"});pos(gridHost,407,213,1113,draw?610:669);
        var drawBar=p("ArchiveDrawBar");pos(drawBar,417,828,1095,54);drawBar.SetHasClass("ArchiveHidden",!draw||!data||!data.social);drawBar.style.visibility=draw&&data&&data.social?"visible":"collapse";
        pos(p("ArchiveTickets"),0,8,280,30);pos(p("ArchiveDrawResult"),288,8,525,30);pos(p("ArchiveDraw"),840,0,240,43);
        var footer=p("ArchiveFooter");pos(footer,417,879,1095,18);footer.visible=false;p("ArchiveContext").visible=false;
        if(valid(hover)&&hover.visible&&hover.__archiveItem)showTooltip(hover.__archiveItem,current,hover);else if(hover)hideTooltip();
        if(A.HideCardText)A.HideCardText();wallet();
        if(Game.IsInToolsMode&&Game.IsInToolsMode()&&lastReportedCategory!==current){lastReportedCategory=current;$.Schedule(.15,function(){if(alive()&&active)$.Msg("ARCHIVE_V10_VIEW "+JSON.stringify(api.Inspect()));});}
        return true;
    }
    function buildTooltip(){
        tip=make("Panel",canvas,"ArchiveV10Tooltip","ArchiveV10Tooltip");tip.hittest=false;tip.hittestchildren=true;tip.visible=false;pos(tip,0,0,368,246);
        tipShadow=nineFrame(tip,"tooltip_shadow");tipShadow.Resize(0,0,368,246);tipBackground=nineFrame(tip,"tooltip_background");tipBackground.Resize(24,24,320,198);tipFrame=nineFrame(tip,"tooltip_frame");tipFrame.Resize(24,24,320,198);
        tipSurface=make("Panel",tip,"ArchiveV10TooltipSurface","");pos(tipSurface,24,24,320,198);tipSurface.hittest=true;
        style(tipSurface,{flowChildren:"none",overflow:"clip"});
        tipSurface.SetPanelEvent("onmouseover",function(){if(alive()&&active)tooltipHideEpoch++;});
        tipSurface.SetPanelEvent("onmouseout",queueTooltipHide);
        tipViewport=make("Panel",tipSurface,"ArchiveV10TooltipViewport","ArchiveV10TooltipViewport");pos(tipViewport,22,19,276,157);style(tipViewport,{flowChildren:"none",overflow:"squish scroll"});
        tipBody=make("Panel",tipViewport,"ArchiveV10TooltipBody","ArchiveV10TooltipBody");pos(tipBody,0,0,276,160);style(tipBody,{height:"fit-children",flowChildren:"down",overflow:"noclip"});
        ["Title","State","EffectCaption","Effect","Condition"].forEach(function(id){var el=make("Label",tipBody,"ArchiveV10Tooltip"+id,"ArchiveV10Text");el.hittest=false;});
        var metric=make("Panel",tipBody,"ArchiveV10TooltipMetric","ArchiveV10TooltipMetric");
        pos(metric,0,0,276,27);style(metric,{flowChildren:"none",marginBottom:"4px"});
        label(metric,"",0,0,162,27,17,D.tooltip.text_colors.caption,"left","ArchiveV10TooltipMetricCaption");
        label(metric,"",162,0,114,27,17,D.tooltip.text_colors.quantity,"right","ArchiveV10TooltipQuantity");
        style(p("ArchiveV10TooltipQuantity"),{position:"0px 0px 0px",width:"fit-children",maxWidth:"114px",horizontalAlign:"right"});
        var sep=image(tipBody,"tooltip_separator",0,0,276,4,"ArchiveV10TooltipSeparator");sep.AddClass("ArchiveV10TooltipSeparator");
        style(sep,{marginBottom:"8px"});
        tipBody.MoveChildBefore(sep,p("ArchiveV10TooltipEffectCaption"));
    }
    function hideTooltip(){tooltipEpoch++;tooltipHideEpoch++;if(valid(hover))hover.RemoveClass("ArchiveHovered");hover=null;if(valid(tip))tip.visible=false;}
    function queueTooltipHide(){if(!alive()||!active)return;var epoch=++tooltipHideEpoch;$.Schedule(.15,function(){if(alive()&&active&&epoch===tooltipHideEpoch)hideTooltip();});}
    function positionTooltip(epoch){
        if(epoch!==tooltipEpoch||!active||!valid(hover)||!valid(tip))return;
        var cp=canvas.GetPositionWithinWindow(),at=hover.GetPositionWithinWindow(),sx=(canvas.actualuiscale_x||1)*viewScale,sy=(canvas.actualuiscale_y||1)*viewScale;
        var x=(at.x-cp.x)/sx+12,y=(at.y-cp.y)/sy+9;
        // Measure the flowing children, not the already constrained scroll body.
        // Otherwise a first-frame 160px height keeps long tooltips permanently short.
        var contentHeight=0;
        tipBody.Children().forEach(function(child){if(child.visible===false)return;var margin=String(child.style.margin||"").split(/\s+/),bottom=child.style.marginBottom||margin[2]||margin[0];contentHeight+=(child.actuallayoutheight||0)/(root.actualuiscale_y||1)+(parseFloat(bottom)||0)+(parseFloat(child.style.marginTop)||0);});
        var height=Math.max(198,Math.min(730,Math.ceil(contentHeight)+41));
        var tx=x+120+13;if(tx+320>1534)tx=x-320-13;tx=Math.max(136,Math.min(1214,tx));var ty=Math.max(27,Math.min(897-height,y+21));
        pos(tip,tx-24,ty-24,368,height+48);tipBackground.Resize(24,24,320,height);pos(tipSurface,24,24,320,height);tipFrame.Resize(24,24,320,height);tipShadow.Resize(0,0,368,height+48);
        tipViewport.style.height=Math.max(130,height-41)+"px";
    }
    function showTooltip(item,category,card,onlyEffect){
        if(!active||!valid(canvas)){originalShow(item,category,card,onlyEffect);return;}
        hideTooltip();originalHide();hover=card;card.AddClass("ArchiveHovered");var state=S.State(item,category),color=D.tooltip.text_colors;
        p("ArchiveV10TooltipTitle").text=String(item.name||"");p("ArchiveV10TooltipState").text=onlyEffect?"":categoryName(category)+" · "+(state===null?"状态待同步":state?(["shadow","pet","fishing","friend","ex","beast","points","shop"].indexOf(category)>=0?"已拥有":"已解锁"):"未解锁");
        p("ArchiveV10TooltipEffectCaption").text="道具效果";var effect=p("ArchiveV10TooltipEffect"),description=String(item.description||"服务端未提供效果说明");
        effect.html=true;effect.text=A.FormatEffects?A.FormatEffects(description,category==="fragment"?(item.level===undefined?0:item.level):undefined,item.id?state:undefined):description;
        var details=item.unlock_condition||item.condition_text||"";
        if(category==="work"||category==="building")details+=(details?"\n":"")+(Number(item.completed)===1?"已达到最高等级":"点击"+(category==="building"?"升级":"激活")+" · 消耗 "+item.cost+(category==="building"?" 信仰值":" 软妹币"));
        if(category==="titles")details+=(details?"\n":"")+(Number(item.equipped)===1?"当前已穿戴 · 点击卸下":state?"点击穿戴称号":"达成条件后解锁称号");
        if(category==="fragment"&&item.level!==undefined)details+=(details?"\n":"")+"神兵等级 LV"+item.level;
        var source=p("ArchiveCurrencySource");if(["building","work","starjoy_points"].indexOf(category)>=0&&source&&source.__archivePlainText)details+=(details?"\n":"")+source.__archivePlainText;
        if(category==="map_level"&&item.count!==undefined)details+=(details?"\n":"")+"累计有效在线 "+item.count+" 分钟";
        p("ArchiveV10TooltipCondition").text=details;p("ArchiveV10TooltipCondition").visible=!!details;
        p("ArchiveV10TooltipMetric").visible=!onlyEffect;
        p("ArchiveV10TooltipMetricCaption").text=S.Metric(item,category);
        p("ArchiveV10TooltipQuantity").text=S.Quantity(item,category);
        ["Title","State","EffectCaption","Effect","Condition"].forEach(function(id){var el=p("ArchiveV10Tooltip"+id);style(el,{width:"276px",height:"fit-children",ignoreParentFlow:"false",fontSize:(id==="Title"?22:id==="State"||id==="EffectCaption"?15:17)+"px",fontFamily:'"Source Han Sans SC"',color:id==="Title"?color.title:id==="Effect"?color.body:id==="State"?color.state:color.caption,margin:"0px 0px "+(id==="Title"?6:id==="State"?8:id==="Effect"?8:4)+"px",whiteSpace:"normal",textOverflow:"clip"});});
        tipBody.style.height="fit-children";tip.visible=true;var epoch=tooltipEpoch;positionTooltip(epoch);[0,.05,.1,.2,.4,.8].forEach(function(delay){$.Schedule(delay,function(){positionTooltip(epoch);});});
    }
    var originalShow=A.__v10OriginalShow||A.Show,originalHide=A.__v10OriginalHide||A.Hide,originalEffect=A.__v10OriginalEffect||A.ShowEffectOnly;
    A.__v10OriginalShow=originalShow;A.__v10OriginalHide=originalHide;A.__v10OriginalEffect=originalEffect;
    A.Show=function(item,category,card,onlyEffect){return showTooltip(item,category,card,onlyEffect);};
    A.ShowEffectOnly=function(item,card){if(active)return showTooltip(item,current,card,true);return originalEffect(item,card);};
    A.Hide=function(){hideTooltip();return originalHide();};
    var api=cfg.SurvivalArchiveV10={
        Render:render,Fit:fit,IsAlive:alive,RequestTooltipHide:queueTooltipHide,Leave:function(){hideTooltip();active=false;displayKey="";if(sharedFrame)sharedFrame.Close();if(valid(canvas))canvas.visible=false;},
        Inspect:function(){var win=p("ArchiveWindow"),cp=valid(canvas)?canvas.GetPositionWithinWindow():null,cards=valid(p("ArchiveGrid"))?p("ArchiveGrid").Children().filter(function(card){return card.visible&&card.__v10;}):[];return {active:active,category:current,categories:order.slice(),shellIdentity:canvas&&canvas.id,rows:rows.map(function(item){return {id:item.id,count:item.count,quantity:S.Quantity(item,current),unlocked:S.State(item,current),name:item.name};}),geometry:{canvas:cp,window:valid(win)?win.GetPositionWithinWindow():null,width:valid(win)?win.actuallayoutwidth:0,height:valid(win)?win.actuallayoutheight:0,firstCount:cards.length?{position:cards[0].__v10.count.GetPositionWithinWindow(),width:cards[0].__v10.count.actuallayoutwidth,textAlign:cards[0].__v10.count.style.textAlign,font:cards[0].__v10.count.style.fontFamily,weight:cards[0].__v10.count.style.fontWeight}:null},tooltipVisible:valid(tip)&&tip.visible,missingIcons:Object.keys(missingIcons)};},
        Dispose:function(){if(disposed)return;hideTooltip();active=false;disposed=true;subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];moved.forEach(function(entry){if(valid(entry.node)&&valid(entry.parent))entry.node.SetParent(entry.parent);});moved=[];if(sharedFrame)sharedFrame.Dispose();else if(valid(canvas))canvas.DeleteAsync(0);sharedFrame=null;if(valid(marker))marker.DeleteAsync(0);canvas=null;balances=[];filters={};sidebarKey="";var win=p("ArchiveWindow");if(valid(win))win.RemoveClass("ArchiveV10Page");}
    };
    return api;
    }
    cfg.SurvivalArchiveV10Factory=createView;
    createView();
})();
