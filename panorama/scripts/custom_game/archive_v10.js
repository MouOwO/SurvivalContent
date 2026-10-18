(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),D=cfg.ArchiveV10Data,S=cfg.ArchiveV10Semantics,A=cfg.ArchiveHandoff;
    if(!D||!S||!A)return;
    if(cfg.SurvivalArchive&&cfg.SurvivalArchive.Dispose)cfg.SurvivalArchive.Dispose();
    if(cfg.SurvivalArchiveV10&&cfg.SurvivalArchiveV10.Dispose)cfg.SurvivalArchiveV10.Dispose();
    function createView(){
    if(cfg.SurvivalArchiveV10&&cfg.SurvivalArchiveV10.IsAlive&&cfg.SurvivalArchiveV10.IsAlive())return cfg.SurvivalArchiveV10;
    var P=cfg.ArchiveParchmentData||{},size=(P.canvas||[1200,900]).slice();
    // Keep the content rows and typography at their original size as the rail narrows.
    var sidebarWidth=326*2/3,sidebarReduction=326-sidebarWidth;
    size[0]-=sidebarReduction;
    function narrow(width){return width-sidebarReduction;}
    function contentX(x){return x-sidebarReduction;}
    var canvas=null,gridHost=null,sidebar=null,filterMenu=null,search=null,headerIcon=null,tip=null,tooltip=null,viewScale=1;
    var active=false,disposed=false,current="",rows=[],categoryRows=[],filters={},balances=[],moved=[],subscriptions=[],sidebarKey="",hover=null,displayKey="";
    var textSpecs={},sidebarButtons={},missingIcons={},fitOptions=null,lastReportedCategory="";
    var searchValue="",order=["clear","shadow","map_level","work","gift","fragment","pet","boss","points","commerce_goods","shop","endless","fishing","building","starjoy_points","titles"];
    var names={clear:"通关存档",shadow:"虚空之影",map_level:"地图等级",work:"上班福利",gift:"福利礼包",fragment:"神兵碎片",pet:"秘法牢笼",boss:"BOSS存档",points:"积分道具",commerce_goods:"商城道具",shop:"排行榜",endless:"无尽存档",fishing:"钓鱼存档",building:"存档神器",friend:"我的好基友",ex:"我的前女友",beast:"瑞兽赐福",starjoy_points:"星悦积分",titles:"称号"};
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
    function asset(key){return P.assets&&P.assets[key];}
    function skin(node,key){var value=asset(key);if(value)style(node,{backgroundImage:'url("'+(typeof value==="string"?value:value.file)+'")',backgroundColor:"transparent",backgroundSize:"100% 100%",backgroundRepeat:"no-repeat"});}
    function component(parent,key,x,y,w,h,id){var node=make("Panel",parent,id,"ArchiveV10Image");node.hittest=false;node.hittestchildren=false;pos(node,x,y,w,h);skin(node,key);return node;}
    function serif(node){style(node,{fontFamily:'"SimSun"'});return node;}
    function categoryIcon(id){
        if(id==="commerce_goods")return "file://{images}/custom_game/archive_polish_v1/nav/gift.svg";
        if(id==="shop")return "file://{images}/custom_game/archive_polish_v1/nav/endless.svg";
        if(P.nav_icons&&P.nav_icons[id])return P.nav_icons[id];
        if(["clear","endless","map_level","work","fishing","building","boss","gift"].indexOf(id)>=0)return "file://{images}/custom_game/archive_polish_v1/nav/"+id+".svg";
        if(id==="shadow")return D.shadow_icons.shadow_01;
        var keys={points:"points",fragment:"weapon",pet:"spell",friend:"friends",ex:"ex",beast:"blessing",shop:"points",titles:"clear",starjoy_points:"points"};
        return (cfg.ArchiveHandoffAssets||{})["archive_ui_kit_v1_"+(keys[id]||"clear")+"_normal.png"]||D.assets.archive_icon.file;
    }
    function headerEmblem(id){return id==="shadow"&&asset("archive_emblem")?asset("archive_emblem").file:categoryIcon(id);}
    function icon(parent,uri,x,y,w,h,id){var node=make("Image",parent,id,"ArchiveV10Icon");node.SetImage(uri);node.SetScaling("stretch-to-fit-preserve-aspect");node.hittest=false;pos(node,x,y,w,h);return node;}
    function move(id,parent){var node=p(id);if(!valid(node))return null;if(!moved.some(function(x){return x.node===node;}))moved.push({node:node,parent:node.GetParent()});
        // Legacy initialization styles these retained panels between view reloads.
        // Their previous V10 cache no longer describes the actual native style.
        node.__v10Style={};node.SetParent(parent);return node;}
    function fit(){if(!active||!alive())return;viewScale=Number(cfg.SurvivalUI.Fit(p("ArchiveWindow"),root,size[0],size[1],{reference:size.slice()}))||1;}
    function build(){
        canvas=make("Panel",p("ArchiveWindow"),"ArchiveV10Canvas","ArchiveParchmentCanvas");pos(canvas,0,0,size[0],size[1]);canvas.hittest=false;canvas.hittestchildren=true;
        component(canvas,"window_background",18,20,narrow(1164),860,"ArchiveV10Shell_Background");
        component(canvas,"sidebar_background",30,76,sidebarWidth,788,"ArchiveV10Shell_Sidebar");
        component(canvas,"content_background",contentX(356),76,808,788,"ArchiveV10Shell_Content");
        component(canvas,"header_strip",18,20,narrow(1164),56,"ArchiveV10Shell_Header");
        serif(label(canvas,"存档",53,30,330,44,34,"#fff5d9","left","ArchiveV10WindowTitle"));
        var close=make("Button",canvas,"ArchiveV10Close","ArchiveV10Button ArchiveParchmentClose");pos(close,contentX(1123),33,31,31);skin(close,"close");
        if(!asset("close"))label(close,"×",0,-3,31,35,30,"#17150f","center");
        close.SetPanelEvent("onactivate",function(){if(alive())cfg.SurvivalArchive.Close();});
        serif(label(canvas,"存档总览",52,100,narrow(285),36,28,"#fff5df","left","ArchiveV10OverviewTitle"));
        label(canvas,"正在读取…",52,143,narrow(292),38,21,"#eda42c","left","ArchiveV10Overview");
        var filter=make("Button",canvas,"ArchiveV10FilterToggle","ArchiveV10Button ArchiveParchmentInput");pos(filter,48,191,narrow(290),34);
        label(filter,"全部存档",10,3,narrow(240),29,21,"#f4edda","left","ArchiveV10FilterText");label(filter,"▾",narrow(258),2,22,28,20,"#ddcfb0","center");
        filter.SetPanelEvent("onactivate",function(){if(alive()){hideTooltip();filterMenu.visible=!filterMenu.visible;}});
        search=make("TextEntry",canvas,"ArchiveV10Search","ArchiveParchmentSearch");pos(search,48,234,narrow(290),34);search.text="";
        var searchHint=label(canvas,"搜索分类…",59,237,narrow(258),30,20,"#a7a393","left","ArchiveV10SearchHint");
        search.SetPanelEvent("ontextentrychange",function(){if(!alive())return;searchValue=String(search.text||"").replace(/^\s+|\s+$/g,"");searchHint.visible=!searchValue;filterMenu.visible=false;hideTooltip();layoutSidebar();sidebar.ScrollToTop();});
        component(canvas,"section_strip",36,278,narrow(310),34,"ArchiveV10SidebarStrip");serif(label(canvas,"分类",54,281,narrow(260),29,23,"#f4eeda"));
        sidebar=make("Panel",canvas,"ArchiveV10Sidebar","ArchiveV10Sidebar");pos(sidebar,42,314,narrow(302),531);sidebar.hittest=false;sidebar.hittestchildren=true;
        label(canvas,"未找到匹配分类",52,333,narrow(280),29,19,"#b5ac98","left","ArchiveV10SearchEmpty").visible=false;
        headerIcon=icon(canvas,categoryIcon("clear"),contentX(394),95,68,68,"ArchiveV10CategoryIcon");component(canvas,"icon_ring",contentX(392),93,72,72);
        serif(label(canvas,"存档",contentX(480),103,650,54,42,"#fff5df","left","ArchiveV10_page_title"));
        component(canvas,"section_strip",contentX(375),195,780,35,"ArchiveV10SectionStrip");serif(label(canvas,"收集条目",contentX(392),198,700,28,23,"#fff1d6","left","ArchiveV10SectionTitle"));
        gridHost=make("Panel",canvas,"ArchiveV10GridHost","ArchiveV10GridHost");pos(gridHost,contentX(385),235,767,577);gridHost.hittest=false;gridHost.hittestchildren=true;
        var grid=move("ArchiveGrid",gridHost);pos(grid,0,0,767,577);grid.style.flowChildren="none";
        move("ArchiveEmpty",canvas);move("ArchiveDrawBar",canvas);move("ArchiveFooter",canvas);move("ArchiveContext",canvas);
        var hint=label(canvas,"",contentX(391),170,741,25,17,"#d0c0a2","left","ArchiveV10Context");hint.visible=false;
        filterMenu=make("Panel",canvas,"ArchiveV10FilterMenu","ArchiveParchmentFilterMenu");pos(filterMenu,48,226,narrow(290),111);filterMenu.visible=false;
        ["all","unlocked","locked"].forEach(function(mode,i){var button=make("Button",filterMenu,"ArchiveV10Filter_"+mode,"ArchiveV10Button ArchiveParchmentFilterOption");pos(button,1,1+i*36,narrow(288),36);var text=label(button,["全部存档","已解锁 / 已拥有","未解锁 / 未拥有"][i],10,5,narrow(260),29,20,"#f5ecd5");button.SetPanelEvent("onactivate",function(){if(!alive()||!valid(button))return;filterMenu.visible=false;hideTooltip();p("ArchiveGrid").ScrollToTop();cfg.SurvivalArchive.Filter(mode);});filters[mode]={panel:button,text:text};});
        buildTooltip();
    }
    function enter(options){var opening=!active;fitOptions=options||fitOptions;if(fitOptions)fitOptions.reference=size.slice();if(!valid(canvas))build();active=true;canvas.visible=true;var win=p("ArchiveWindow");if(opening)win.__v10Style={};win.AddClass("ArchiveV10Page");win.AddClass("ArchiveParchmentPage");style(win,{width:size[0]+"px",height:size[1]+"px",padding:"0px",margin:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderTop:"0px",borderBottom:"0px",borderRadius:"0px",boxShadow:"none",overflow:"noclip"});fit();}
    function categoryName(id){var row=categoryRows.filter(function(x){return x.id===id;})[0];return names[id]||row&&row.name||id;}
    function layoutSidebar(){
        if(!valid(sidebar))return;var index=0,needle=searchValue.toLowerCase();
        Object.keys(sidebarButtons).forEach(function(id){var cell=sidebarButtons[id],show=!needle||categoryName(id).toLowerCase().indexOf(needle)>=0;cell.panel.visible=show;cell.panel.SetHasClass("ArchiveV10Selected",id===current);cell.text.style.color=id===current?"#ffe6a6":"#f0eadb";if(show)pos(cell.panel,0,(index++)*35,narrow(285),35);});
        p("ArchiveV10SearchEmpty").visible=index===0;
    }
    function renderSidebar(categories){
        var signature=JSON.stringify(categories||[]);if(signature!==sidebarKey){
            sidebar.RemoveAndDeleteChildren();sidebarButtons={};var ids=order.slice();list(categories).forEach(function(row){if(row.id!=="ex"&&row.id!=="friend"&&row.id!=="wife"&&row.id!=="beast"&&ids.indexOf(row.id)<0)ids.push(row.id);});
            ids.forEach(function(id){var button=make("Button",sidebar,"ArchiveV10Category_"+id,"ArchiveV10Button ArchiveParchmentCategory");button.hittestchildren=false;icon(button,categoryIcon(id),6,3,28,28);component(button,"icon_ring",4,1,32,32);var text=serif(label(button,categoryName(id),47,5,narrow(231),29,21,"#f0eadb"));button.SetPanelEvent("onactivate",function(){if(!alive()||!valid(button))return;hideTooltip();filterMenu.visible=false;cfg.SurvivalArchive.SelectCategory(id);});sidebarButtons[id]={panel:button,text:text};});sidebarKey=signature;
        }
        layoutSidebar();
    }
    function findClass(node,cls){if(node.BHasClass(cls))return node;var children=node.Children();for(var i=0;i<children.length;i++){var found=findClass(children[i],cls);if(found)return found;}return null;}
    function fillItemIcon(node,item){var presentation=cfg.SurvivalRewardPresentation;if(presentation&&presentation.FillIcon)presentation.FillIcon(node,item);}
    function decorateCommerce(card,item,slot){
        var resource=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item);
        var key=JSON.stringify([current,item.id,item.icon,item.icon_type,item.icon_style,resource&&resource.id,resource&&resource.uri]),cell=card.__v10;
        if(!cell||!valid(cell.host)||cell.artKey!==key){
            card.Children().forEach(function(child){child.visible=false;});if(cell&&valid(cell.host))cell.host.DeleteAsync(0);
            var host=make("Panel",card,"ArchiveV10Goods_"+item.id,"ArchiveV10ItemVisual ArchiveCommerceItemVisual");pos(host,0,0,104,112);host.hittest=false;host.hittestchildren=false;
            var backing=make("Panel",host,"","ArchiveCommerceIconBacking");pos(backing,12,5,80,80);backing.hittest=false;
            var art=resource&&cfg.SurvivalRewardPresentation.CreateRegisteredIcon(backing,item,"ArchiveCommerceIcon");
            if(!art)art=findClass(card,"ArchiveArt");
            if(valid(art)){art.SetParent(backing);art.visible=true;art.AddClass("ArchiveCommerceIcon");style(art,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",overflow:"clip"});if(!art.__survivalVIPBadge)art.Children().forEach(function(child){if(child.SetImage){pos(child,0,0,78,78);style(child,{horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px"});}});}
            else art=cfg.SurvivalRewardPresentation.CreateIcon(backing,item,"ArchiveCommerceIcon");
            pos(art,1,1,78,78);fillItemIcon(art,item);
            var vipLevel=cfg.SurvivalVIPBadges&&cfg.SurvivalVIPBadges.Resolve(item);
            if(vipLevel&&!resource){art.visible=false;art=make("Panel",backing,"","ArchiveCommerceIcon");pos(art,3,3,74,74);cfg.SurvivalVIPBadges.Render(art,vipLevel);}
            var badge=make("Panel",host,"","ArchiveCommerceQuantityBadge");pos(badge,48,5,44,23);badge.hittest=false;
            var count=label(badge,"",2,1,40,21,15,"#fff0cb","right");count.AddClass("ArchiveV10Count");
            var name=label(host,"",1,89,102,22,16,"#f6edd4","center");name.AddClass("ArchiveV10Name");style(name,{textOverflow:"ellipsis"});
            cell=card.__v10={host:host,artKey:key,sourceArtKey:JSON.stringify([current,item.id,item.icon,item.icon_type,item.icon_style]),art:art,countHost:badge,count:count,name:name,normal:backing};
        }
        if(cell.host.GetParent()!==card)cell.host.SetParent(card);cell.host.visible=true;
        card.Children().forEach(function(child){if(child!==cell.host)child.visible=false;});
        card.AddClass("ArchiveV10Cell");card.AddClass("ArchiveCommerceCell");card.RemoveClass("ArchiveParchmentRowAlternate");
        pos(card,Math.floor(slot%7)*106,Math.floor(slot/7)*116,104,112);style(card,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none",flowChildren:"none",overflow:"noclip",transform:"none"});
        var state=S.State(item,current),quantity=S.Quantity(item,current),known=state!==null;
        card.SetHasClass("ArchiveCommerceOwned",state===true);card.SetHasClass("ArchiveCommerceUnowned",state===false);card.SetHasClass("ArchiveCommerceUnknown",!known);
        style(cell.art,{brightness:state===false?".38":known?"1":".62",saturation:state===false?"0":known?"1":".3",opacity:state===false?".82":known?"1":".9"});
        style(cell.name,{color:state===false?"#a5a396":"#f6edd4"});
        // One-time entitlements need no repeated 0/1 label; real stacks/caps and
        // pending quantities retain their independent authoritative text.
        cell.countHost.visible=!known||Number(item.count)>1||Number(item.target)>1||Number(item.max_owned)>1;
        var compactName=String(item.name||"").replace(/\s*[（(]功能版[）)]\s*$/,"").replace(/[·・]\s*永久\s*$/,"");
        if(cell.count.text!==quantity)cell.count.text=quantity;if(cell.name.text!==compactName)cell.name.text=compactName;
    }
    function decorate(card,item,slot){
        if(current==="commerce_goods"){decorateCommerce(card,item,slot);return;}
        var resource=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item);
        var nativeIcon=cfg.ArchiveV10Icons&&cfg.ArchiveV10Icons.Resolve(item,current),cell=card.__v10,artKey=JSON.stringify([current,item.id,item.icon,item.icon_type,item.icon_style,nativeIcon&&nativeIcon.iconKey,resource&&resource.id,resource&&resource.uri]);
        if(!cell||!valid(cell.host)||cell.artKey!==artKey){
            // The original Button and its gameplay callbacks survive every paint.
            card.Children().forEach(function(child){if(!child.BHasClass("ArchivePromote"))child.visible=false;});if(cell&&valid(cell.host))cell.host.DeleteAsync(0);
            var host=make("Panel",card,"ArchiveV10Item_"+item.id,"ArchiveV10ItemVisual");pos(host,0,0,745,80);host.hittest=false;host.hittestchildren=false;
            var backdrop=component(host,"row_background",0,0,745,80);backdrop.AddClass("ArchiveParchmentRowBacking");
            var highlight=component(host,"row_hover",0,0,745,80);highlight.AddClass("ArchiveV10HoverFrame");
            var name=serif(label(host,"",13,9,610,32,25,"#f6edd4","left"));name.AddClass("ArchiveV10Name");
            var countHost=make("Panel",host,"","ArchiveV10CountHost");pos(countHost,15,44,235,25);countHost.hittest=false;
            var count=label(countHost,"",0,0,235,25,19,"#f3f0df","left");count.AddClass("ArchiveV10Count");
            var track=component(host,"progress_track",284,48,306,20);track.AddClass("ArchiveParchmentTrack");
            var fill=component(track,"progress_fill",2,2,0,16);fill.AddClass("ArchiveParchmentFill");
            var glint=component(track,"progress_glint",0,2,9,16);glint.visible=false;
            var state=label(host,"",284,43,306,29,18,"#bcb299","left");state.visible=false;
            var artStage=make("Panel",host,"","ArchiveParchmentIconStage");pos(artStage,663,8,62,62);artStage.hittest=false;artStage.hittestchildren=false;
            var art=resource&&current!=="titles"&&cfg.SurvivalRewardPresentation.CreateRegisteredIcon(artStage,item,"ArchiveV10Icon");
            if(art){}
            else if(current==="shadow"&&D.shadow_icons[item.id])art=icon(artStage,D.shadow_icons[item.id],0,0,62,62);
            else if(nativeIcon)art=icon(artStage,nativeIcon.uri,0,0,62,62);
            else{
                art=findClass(card,current==="titles"?"ArchiveTitleArt":"ArchiveArt");
                if(valid(art)){art.SetParent(artStage);art.visible=true;art.AddClass("ArchiveV10Icon");}
                else{art=make("Panel",artStage,"","ArchiveV10Icon");label(art,"?",0,9,62,40,28,"#b9aa8c","center");if(!missingIcons[current+":"+item.id]){$.Msg("ARCHIVE_V10_MISSING_ICON "+current+":"+item.id);missingIcons[current+":"+item.id]=true;}}
            }
            pos(art,0,0,62,62);style(art,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none",overflow:"noclip",brightness:"1",saturation:"1",opacity:"1",washColor:"none",transform:"none"});art.hittest=false;if(current!=="titles")fillItemIcon(art,item);
            if(art.BHasClass("ArchiveEndlessEmblem")){pos(art,0,7,72,56);style(art,{transformOrigin:"0% 0%",transform:"scale3d(0.861111, 0.861111, 1)"});}
            if(current==="titles"){pos(art,0,18,62,62*55/128);if(art.SetScaling)art.SetScaling("stretch-to-fit-preserve-aspect");}
            else if(current!=="shadow"&&!art.__survivalVIPBadge)art.Children().forEach(function(child){
                if(child.BHasClass("ArchiveRarityBadge")){child.visible=false;return;}
                if(child.BHasClass("ArchiveEndlessEmblem")){pos(child,0,7,72,56);style(child,{transformOrigin:"0% 0%",transform:"scale3d(0.861111, 0.861111, 1)"});}
                else if(child.SetImage||child.BHasClass("ArchiveRewardIcon")){pos(child,0,0,62,62);fillItemIcon(child,item);style(child,{horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",brightness:"1",saturation:"1",opacity:"1",transform:"none"});}
            });
            var normal=component(host,"icon_ring",659,4,70,70);normal.AddClass("ArchiveParchmentIconRing");
            cell=card.__v10={host:host,artKey:artKey,sourceArtKey:JSON.stringify([current,item.id,item.icon,item.icon_type,item.icon_style]),art:art,countHost:countHost,count:count,name:name,normal:normal,track:track,fill:fill,glint:glint,state:state};
        }
        if(cell.host.GetParent()!==card)cell.host.SetParent(card);cell.host.visible=true;
        card.Children().forEach(function(child){if(child!==cell.host&&!child.BHasClass("ArchivePromote"))child.visible=false;});
        card.AddClass("ArchiveV10Cell");card.SetHasClass("ArchiveParchmentRowAlternate",slot%2===1);pos(card,0,slot*82,745,80);style(card,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none",overflow:"noclip",flowChildren:"none",transform:"none"});
        var progress=S.Progress(item,current),countText=progress.text,nameText=String(item.name||"");
        if(cell.count.text!==countText)cell.count.text=countText;if(cell.name.text!==nameText)cell.name.text=nameText;
        cell.track.visible=progress.ratio!==null;cell.fill.visible=cell.track.visible&&progress.ratio>0;cell.fill.style.width=(302*(progress.ratio||0))+"px";
        cell.glint.visible=cell.fill.visible;pos(cell.glint,Math.max(2,302*(progress.ratio||0)-7),2,Math.min(9,302*(progress.ratio||0)),16);
        cell.state.visible=!cell.track.visible;cell.state.text=!progress.known?"待同步":current==="titles"?(Number(item.equipped)===1?"已穿戴 · 点击卸下":S.State(item,current)?"点击穿戴":"达成条件后解锁"):"";
        var promote=findClass(card,"ArchivePromote");if(promote){promote.visible=true;pos(promote,588,7,62,29);cell.name.style.width="550px";}
        if(current==="work"||current==="building"){cell.state.visible=true;pos(cell.state,284,12,338,25);cell.state.text=Number(item.completed)===1?(current==="building"?"已满级":"已激活"):"点击"+(current==="building"?"升级":"激活")+" · "+item.cost+(current==="building"?" 信仰值":" 软妹币");cell.name.style.width="260px";}
    }

    function render(data,category,mode,categories,options){
        if(!alive())return false;var changed=current!==category;if(changed)hideTooltip();current=category;categoryRows=list(categories);
        var signature=JSON.stringify([category,mode,data&&data.rows,data&&data.pending,data&&data.upgrade_pending,data&&data.social,data&&data.online,data&&data.buildings,data&&data.fishing,data&&data.starjoy,data&&data.has_pass,data&&data.last_draw,data&&data.unavailable,categories,cfg.SurvivalArchiveColors]);
        if(active&&signature===displayKey)return true;displayKey=signature;enter(options);renderSidebar(categories);
        p("ArchiveV10_page_title").text=categoryName(current);headerIcon.SetImage(headerEmblem(current));
        var leaderboard=current==="shop",leaderboardView=cfg.SurvivalEndlessLeaderboard;
        p("ArchiveV10FilterToggle").visible=!leaderboard;
        if(leaderboard&&leaderboardView){
            p("ArchiveGrid").visible=false;gridHost.visible=true;pos(gridHost,contentX(385),235,767,577);
            p("ArchiveEmpty").AddClass("ArchiveHidden");p("ArchiveDrawBar").AddClass("ArchiveHidden");p("ArchiveDrawBar").style.visibility="collapse";
            p("ArchiveFooter").visible=false;p("ArchiveContext").visible=false;
            p("ArchiveV10SectionTitle").text="前100名 · 前三名置顶";
            p("ArchiveV10Overview").text="无尽排行榜";
            var rankingContext=p("ArchiveV10Context");rankingContext.text="最高通关层数 · 同层按无尽积分排序";rankingContext.visible=true;
            leaderboardView.Show(gridHost);return true;
        }
        if(leaderboardView)leaderboardView.Hide();p("ArchiveGrid").visible=true;p("ArchiveV10SectionTitle").text="收集条目";
        var ownership=["shadow","pet","fishing","friend","ex","wife","beast","commerce_goods","shop"].indexOf(current)>=0;
        filters.unlocked.text.text=ownership?"已拥有":"已解锁";filters.locked.text.text=ownership?"未拥有":"未解锁";
        p("ArchiveV10FilterText").text=mode==="unlocked"?filters.unlocked.text.text:mode==="locked"?filters.locked.text.text:"全部存档";
        Object.keys(filters).forEach(function(key){filters[key].panel.SetHasClass("ArchiveV10Selected",key===(mode||"all"));});
        rows=data?list(data.rows):S.Normalize(null,current);var slot=0;
        p("ArchiveGrid").Children().forEach(function(card){if(card.BHasClass("ArchiveCard")&&card.visible&&card.__archiveCategory===current)decorate(card,card.__archiveItem,slot++);});
        if(!data){p("ArchiveGrid").Children().forEach(function(card){card.visible=false;});slot=0;}
        var known=rows.filter(function(item){return S.State(item,current)!==null;}).length,owned=rows.filter(function(item){return S.State(item,current)===true;}).length;
        p("ArchiveV10Overview").text=!data?"正在读取…":Number(data.unavailable)===1?"分类尚未启用":(ownership?"已拥有 ":"已解锁 ")+owned+" / "+rows.length+" 项"+(known<rows.length?" · 同步中":"");
        var draw=["friend","ex","wife","beast"].indexOf(current)>=0,context=p("ArchiveV10Context"),details="";
        if(current==="map_level"&&data&&data.online)details="当前地图等级 "+data.online.level;
        if(current==="work"&&data&&data.online)details="软妹币："+data.online.coins;
        if(current==="building"&&data&&data.buildings)details="信仰值："+data.buildings.faith;
        if(current==="fishing"&&data&&data.fishing&&data.fishing.faith!==undefined)details="信仰值："+data.fishing.faith;
        if(current==="starjoy_points"&&data&&data.starjoy)details="累计星悦积分 "+data.starjoy.earned+" · 可用余额 "+data.starjoy.balance;
        if(current==="commerce_goods")details="购买或兑换后自动点亮 · 悬停查看效果与解锁条件";
        if(current==="commerce_goods")p("ArchiveStatus").text="购买或兑换成功后点亮 · 效果沿用已有商品与存档记录";
        context.text=details;context.visible=!!details;
        var empty=p("ArchiveEmpty");pos(empty,contentX(399),280,731,50);style(empty,{fontSize:"21px",color:"#d0c4aa",textAlign:"center"});empty.SetHasClass("ArchiveHidden",slot>0);empty.text=data&&Number(data.unavailable)===1?"该分类尚未启用，暂无已获得条目":!data?"正在读取存档…":slot===0?(mode!=="all"?"当前筛选下暂无存档":"当前分类暂无存档"):"";
        var grid=p("ArchiveGrid");pos(grid,0,0,767,draw?511:577);style(grid,{flowChildren:"none"});pos(gridHost,contentX(385),235,767,draw?511:577);
        var drawBar=p("ArchiveDrawBar");pos(drawBar,contentX(397),755,735,52);drawBar.SetHasClass("ArchiveHidden",!draw||!data||!data.social);drawBar.style.visibility=draw&&data&&data.social?"visible":"collapse";
        pos(p("ArchiveTickets"),0,0,515,23);pos(p("ArchiveDrawResult"),0,26,515,23);pos(p("ArchiveDraw"),537,4,190,42);
        var footer=p("ArchiveFooter");pos(footer,contentX(390),815,748,24);style(footer,{flowChildren:"none",backgroundColor:"transparent",border:"0px",marginTop:"0px",marginBottom:"0px",marginLeft:"0px",marginRight:"0px"});footer.visible=true;pos(p("ArchiveStatus"),0,0,748,24);style(p("ArchiveStatus"),{fontSize:"15px",color:"#c4b89e",textOverflow:"ellipsis",marginTop:"0px",marginBottom:"0px",marginLeft:"0px",marginRight:"0px",horizontalAlign:"left",verticalAlign:"top"});p("ArchiveContext").visible=false;
        if(valid(hover)&&hover.visible&&hover.__archiveItem)showTooltip(hover.__archiveItem,current,hover);else if(hover)hideTooltip();
        if(A.HideCardText)A.HideCardText();
        if(Game.IsInToolsMode&&Game.IsInToolsMode()&&lastReportedCategory!==current){lastReportedCategory=current;$.Schedule(.15,function(){if(alive()&&active)$.Msg("ARCHIVE_V10_VIEW "+JSON.stringify(api.Inspect()));});}
        return true;
    }
    function buildTooltip(){
        tooltip=cfg.SurvivalArchiveTooltip.Create({parent:canvas,root:root,idPrefix:"ArchiveV10Tooltip",isAlive:alive,isActive:function(){return active;},getScale:function(){return viewScale;},getBounds:function(){return size.slice();},maxHeight:778,categoryName:categoryName,currencySourceText:function(){var source=p("ArchiveCurrencySource");return source&&source.__archivePlainText||"";},onHide:function(){hover=null;}});
        tip=tooltip.panel;
    }
    function hideTooltip(){if(tooltip)tooltip.Hide();hover=null;}
    function queueTooltipHide(){if(tooltip)tooltip.QueueHide();}
    function showTooltip(item,category,card,onlyEffect){
        if(!active||!valid(canvas)){originalShow(item,category,card,onlyEffect);return;}
        originalHide();if(tooltip.Show(item,category,card,onlyEffect))hover=card;
    }
    var originalShow=A.__v10OriginalShow||A.Show,originalHide=A.__v10OriginalHide||A.Hide,originalEffect=A.__v10OriginalEffect||A.ShowEffectOnly;
    A.__v10OriginalShow=originalShow;A.__v10OriginalHide=originalHide;A.__v10OriginalEffect=originalEffect;
    A.Show=function(item,category,card,onlyEffect){return showTooltip(item,category,card,onlyEffect);};
    A.ShowEffectOnly=function(item,card){if(active)return showTooltip(item,current,card,true);return originalEffect(item,card);};
    A.Hide=function(){hideTooltip();return originalHide();};
    var api=cfg.SurvivalArchiveV10={
        Render:render,Fit:fit,IsAlive:alive,RequestTooltipHide:queueTooltipHide,Leave:function(){hideTooltip();active=false;displayKey="";if(cfg.SurvivalEndlessLeaderboard)cfg.SurvivalEndlessLeaderboard.Hide();if(valid(filterMenu))filterMenu.visible=false;if(valid(canvas))canvas.visible=false;},
        Inspect:function(){var win=p("ArchiveWindow"),cp=valid(canvas)?canvas.GetPositionWithinWindow():null,cards=valid(p("ArchiveGrid"))?p("ArchiveGrid").Children().filter(function(card){return card.visible&&card.__v10;}):[];return {active:active,category:current,categories:order.slice(),shellIdentity:canvas&&canvas.id,layout:current==="commerce_goods"?"commerce_goods_grid":"parchment_rows",search:searchValue,rows:rows.map(function(item){return {id:item.id,count:item.count,quantity:S.Quantity(item,current),unlocked:S.State(item,current),name:item.name};}),geometry:{canvas:cp,window:valid(win)?win.GetPositionWithinWindow():null,width:valid(win)?win.actuallayoutwidth:0,height:valid(win)?win.actuallayoutheight:0,firstCount:cards.length?{position:cards[0].__v10.count.GetPositionWithinWindow(),width:cards[0].__v10.count.actuallayoutwidth,textAlign:cards[0].__v10.count.style.textAlign,font:cards[0].__v10.count.style.fontFamily,weight:cards[0].__v10.count.style.fontWeight}:null},tooltipVisible:valid(tip)&&tip.visible,missingIcons:Object.keys(missingIcons)};},
        Dispose:function(){if(disposed)return;hideTooltip();if(tooltip)tooltip.Dispose();tooltip=null;active=false;disposed=true;subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];moved.forEach(function(entry){if(valid(entry.node)&&valid(entry.parent))entry.node.SetParent(entry.parent);});moved=[];if(valid(canvas))canvas.DeleteAsync(0);if(valid(marker))marker.DeleteAsync(0);canvas=null;balances=[];filters={};sidebarKey="";var win=p("ArchiveWindow");if(valid(win)){win.RemoveClass("ArchiveV10Page");win.RemoveClass("ArchiveParchmentPage");}}
    };
    return api;
    }
    cfg.SurvivalArchiveV10Factory=createView;
    createView();
})();
