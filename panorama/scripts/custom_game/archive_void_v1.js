(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),D=cfg.ArchiveVoidV1Data;
    if(!D)return;
    // Release the old controller while its own view is still installed.
    // Hot reload must never let the old Dispose release the newly created view.
    if(cfg.SurvivalArchive&&cfg.SurvivalArchive.Dispose)cfg.SurvivalArchive.Dispose();
    if(cfg.SurvivalArchiveVoidV1&&cfg.SurvivalArchiveVoidV1.Dispose)cfg.SurvivalArchiveVoidV1.Dispose();
    var marker=$.CreatePanel("Panel",root,""),disposed=false;
    marker.visible=false;marker.hittest=false;marker.hittestchildren=false;
    function alive(){return !disposed&&valid(root)&&valid(marker);}
    var canvas=null,grid=null,sidebar=null,active=false,saved=null,fitOptions=null,currentFilter="all",latestRows=[],filterButtons={},balances=[],subscriptions=[];
    var panelCache={},rowCards={},sidebarSignature=null,rowsSignature=null,filterSignature=null,hoveredCard=null;
    var sidebarOrder=["clear","shadow","map_level","work","gift","fragment","pet","boss","points","shop","endless","fishing","building","friend","ex","beast"];
    var layers={};D.layers.forEach(function(x){if(x.id)layers[x.id]=x;});
    function p(id){var el=panelCache[id];if(!valid(el))el=panelCache[id]=root.FindChildTraverse(id);return el;}
    function valid(el){return el&&(!el.IsValid||el.IsValid());}
    function set(el,values){Object.keys(values).forEach(function(k){el.style[k]=values[k];});}
    function pos(el,x,y,w,h){set(el,{position:Math.round(x)+"px "+Math.round(y)+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px"});}
    function make(type,parent,id,cls){var el=$.CreatePanel(type,parent,id||"");if(cls)el.AddClass(cls);if(type==="Label")set(el,{fontFamily:'"Source Han Sans SC"',fontWeight:"normal",letterSpacing:"0px",textShadow:"none"});return el;}
    function image(parent,key,x,y,w,h,cls){var asset=D.assets[key],el=make("Image",parent,"",cls||"VoidShadowImage");el.hittest=false;el.hittestchildren=false;el.SetImage(asset.file);el.SetScaling("stretch-to-fit");pos(el,x,y,w===undefined?asset.size[0]:w,h===undefined?asset.size[1]:h);return el;}
    function text(parent,spec,value,id,offset){var b=spec.bbox,el=make("Label",parent,id||"","VoidShadowText");el.hittest=false;el.text=String(value===undefined?spec.text||"":value);pos(el,b[0]-(offset?offset[0]:0),b[1]-(offset?offset[1]:0),b[2]-b[0],b[3]-b[1]);set(el,{fontSize:spec.size+"px",color:spec.color,textAlign:spec.align||"center"});return el;}
    function list(rows){if(Array.isArray(rows))return rows;return rows?Object.keys(rows).map(function(k){return rows[k];}):[];}
    function numberKnown(item){return item.count!==undefined&&item.count!==null&&String(item.count).trim()!==""&&isFinite(Number(item.count))&&Number(item.count)>=0&&(item.count_known===undefined||Number(item.count_known)===1);}
    function capFor(item){var raw=item.max_owned!==undefined?item.max_owned:item.target;return raw!==undefined&&raw!==null&&isFinite(Number(raw))&&Number(raw)>0?Number(raw):null;}
    function join(data){
        var live={},result=[],complete=!!data&&data.rows!==undefined&&data.rows!==null&&(data.ok===true||Number(data.ok)===1);
        list(data&&data.rows).forEach(function(row){if(row&&row.id)live[row.id]=row;});
        D.catalog.forEach(function(entry){
            var item=Object.assign({},entry),row=live[entry.id];
            if(row){Object.keys(row).forEach(function(k){item[k]=row[k];});if(row.target!==undefined&&row.max_owned===undefined)item.max_owned=row.target;delete live[entry.id];}
            else if(complete){item.count=0;item.count_known=1;}
            else {delete item.count;item.count_known=0;}
            var known=numberKnown(item);item.count_known=known?1:0;
            if(known){item.count=Number(item.count);item.unlocked=item.count>0?1:0;}else{delete item.count;delete item.unlocked;}
            if(item.max_owned!==undefined)item.target=item.max_owned;
            result.push(item);
        });
        Object.keys(live).forEach(function(id){var item=Object.assign({},live[id]),known=numberKnown(item);item.count_known=known?1:0;if(known){item.count=Number(item.count);item.unlocked=item.count>0?1:0;}else{delete item.count;delete item.unlocked;}result.push(item);});
        return result;
    }
    function quantity(item){var count=numberKnown(item)?String(item.count):"—",cap=capFor(item);return count+(cap!==null?"/"+cap:"");}
    function fit(){if(!alive()||!active||!valid(p("ArchiveWindow")))return;if(fitOptions)fitOptions.reference=D.canvas.slice();cfg.SurvivalUI.Fit(p("ArchiveWindow"),root,D.canvas[0],D.canvas[1],{reference:D.canvas});}
    function enter(options){
        var win=p("ArchiveWindow"),changed=!active;fitOptions=options||fitOptions;
        if(!active){
            saved={};var fallback={width:"1280px",height:"800px",padding:"0px",margin:"0px",flowChildren:"down",backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#201632),color-stop(.2,#110d21),to(#0c0917))",border:"1px solid #655079",borderTop:"2px solid #987148",borderBottom:"2px solid #987148",borderRadius:"3px",boxShadow:"#000000b8 0px 14px 48px 0px"};
            // Native border getters serialize internal state, which is not valid CSS
            // to feed back to the setter. Restore the shell's authoring literals.
            saved=fallback;active=true;
            win.AddClass("ArchiveVoidPage");
            set(win,{width:"1672px",height:"941px",padding:"0px",margin:"0px",flowChildren:"none",backgroundColor:"transparent",border:"0px",borderTop:"0px",borderBottom:"0px",borderRadius:"0px",boxShadow:"none"});
        }
        if(!valid(canvas)){build();changed=true;}if(canvas.visible!==true)canvas.visible=true;if(changed)fit();
    }
    function leave(){
        if(!active)return;cfg.ArchiveHandoff.Hide();hoveredCard=null;active=false;
        var stateIcon=p("ArchiveTooltipStateIcon");if(valid(stateIcon))stateIcon.visible=true;
        if(valid(canvas))canvas.visible=false;
        var win=p("ArchiveWindow");if(valid(win)){win.RemoveClass("ArchiveVoidPage");if(saved)set(win,saved);}
        if(fitOptions)fitOptions.reference=[1920,1080];
        if(valid(win))cfg.SurvivalUI.Fit(win,root,1280,800,{reference:[1920,1080]});
    }
    function wallet(){
        if(!alive()||!active)return;var catalog=cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.GetCatalog(),b=catalog&&catalog.balances||{};
        var fields=["u_coin","shop_points","shop_gold"];
        balances.forEach(function(cell,i){var value=b[fields[i]],display=value!==undefined&&value!==null&&isFinite(Number(value))?String(value):"—";if(cell.text!==display)cell.text=display;});
    }
    function build(){
        rowCards={};sidebarSignature=null;rowsSignature=null;filterSignature=null;filterButtons={};balances=[];hoveredCard=null;
        canvas=make("Panel",p("ArchiveWindow"),"ArchiveVoidCanvas","VoidShadowCanvas");
        D.layers.forEach(function(layer){
            if(layer.kind!=="image"||/^virtual_/.test(layer.asset)||["quantity_plate","sidebar_selected","filter_selected","filter_default","close"].indexOf(layer.asset)>=0)return;
            image(canvas,layer.asset,layer.x,layer.y,layer.width,layer.height);
        });
        ["project_title","page_title"].forEach(function(id){text(canvas,layers[id],id==="page_title"?(D.categories.filter(function(x){return x.id==="shadow";})[0]||{}).name:undefined,"VoidShadow_"+id);});
        var tabs=["treasure","archive","lottery","commerce","daily_rewards","leaderboard"],bounds=[[330,27,144,63],[474,11,156,80],[630,27,168,63],[798,27,168,63],[966,27,167,63],[1133,27,166,63]];
        tabs.forEach(function(id,i){var b=bounds[i],button=make("Button",canvas,"VoidShadowTop_"+id,"VoidShadowNavButton");pos(button,b[0],b[1],b[2],b[3]);text(button,layers["top_"+i],undefined,"",b);button.SetPanelEvent("onactivate",function(){if(id!=="archive"&&cfg.SurvivalPurpleShell)cfg.SurvivalPurpleShell.Navigate(id);});});
        var close=make("Button",canvas,"VoidShadowClose","VoidShadowNavButton");pos(close,1474,34,49,49);image(close,"close",7,8);close.SetPanelEvent("onactivate",function(){cfg.SurvivalArchive.Close();});
        ["all","unlocked","locked"].forEach(function(mode,i){var b=[[699,143,132,43],[839,143,131,43],[981,144,131,42]][i],button=make("Button",canvas,"VoidShadowFilter_"+mode,"VoidShadowNavButton");pos(button,b[0],b[1],b[2],b[3]);var bg=image(button,"filter_default",0,0,b[2],b[3]);var id=["filter_all_text","filter_owned_text","filter_unowned_text"][i];text(button,layers[id],undefined,"",b);button.SetPanelEvent("onactivate",function(){cfg.SurvivalArchive.Filter(mode);});filterButtons[mode]={panel:button,image:bg};});
        ["gold_text","purple_gem_text","ticket_text"].forEach(function(id,i){var label=text(canvas,layers[id],"—","VoidShadow_"+id);label.hittest=true;balances.push(label);label.SetPanelEvent("onmouseover",function(){$.DispatchEvent("DOTAShowTextTooltip",label,["U币","积分","商城金币"][i]);});label.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip",label);});});
        sidebar=make("Panel",canvas,"VoidShadowSidebar","VoidShadowSidebar");pos(sidebar,136,128,258,769);
        grid=make("Panel",canvas,"VoidShadowGrid","VoidShadowGrid");pos(grid,415,226,1104,649);
        if(GameEvents.Subscribe){subscriptions.push(GameEvents.Subscribe("survival_commerce_result",function(){if(!active)return;$.Schedule(0,function(){if(active&&valid(canvas))wallet();});}));}
    }
    function renderSidebar(categories){
        sidebar.RemoveAndDeleteChildren();var live={};list(categories).forEach(function(x){live[x.id]=x;});var seen={};
        var ordered=sidebarOrder.map(function(id){seen[id]=true;return D.categories.filter(function(x){return x.id===id;})[0]||{id:id,name:id,disabled:1};});
        D.categories.forEach(function(x){if(!seen[x.id]&&!x.disabled)ordered.push(x);});list(categories).forEach(function(x){if(!seen[x.id]&&!ordered.some(function(y){return y.id===x.id;}))ordered.push(x);});
        ordered.forEach(function(entry,i){var spec=layers["sidebar_"+(i+1<10?"0":"")+(i+1)];if(!spec)spec={bbox:[220,902+(i-16)*46,353,941+(i-16)*46],size:23,color:"#F0ECFB",align:"right"};
            var top=spec.bbox[1]-128,button=make("Button",sidebar,"VoidShadowCategory_"+entry.id,"VoidShadowNavButton");pos(button,0,top-5,258,spec.bbox[3]-spec.bbox[1]+10);
            if(entry.id==="shadow")image(button,"sidebar_selected",0,175-128-(top-5),258,51);
            var current=live[entry.id]||entry,label=text(button,spec,current.name||entry.name,"",[136,128+top-5]);
            button.enabled=Number(entry.disabled)!==1&&Number(current.disabled)!==1;
            if(!button.enabled){label.style.color="#9b91ae";button.SetPanelEvent("onmouseover",function(){$.DispatchEvent("DOTAShowTextTooltip",button,"该分类尚未开放");});button.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip",button);});}
            button.SetPanelEvent("onactivate",function(){if(button.enabled)cfg.SurvivalArchive.SelectCategory(entry.id);});
        });
    }
    function itemGeometry(index){if(D.items[index])return D.items[index];var col=index%8,row=Math.floor(index/8),x=D.items[col].icon_bbox[0],y=229+row*193;return {icon_asset:"",icon_bbox:[x,y,x+117,y+120],quantity_bbox:[x+31,y-3,x+118,y+29],name_bbox:[x-5,y+123,x+124,y+158]};}
    function renderItems(rows){
        var slot=0,knownKeys={},visibleKeys={};
        rows.forEach(function(item,index){
            var key=String(item.id||("row_"+index)),cached=rowCards[key],known=numberKnown(item);
            knownKeys[key]=true;if(cached&&valid(cached.panel))cached.panel.__voidItem=item;
            if(currentFilter!=="all"&&(!known||(currentFilter==="unlocked")!==(item.count>0)))return;
            visibleKeys[key]=true;
            var g=itemGeometry(slot++),ownGeometry=D.items.filter(function(entry){return entry.id===item.id;})[0];
            // Move the original icon/plate/name assembly together when filtering.
            // Its notch and plaque are a pair; a different slot's narrower plaque is unsafe.
            if(ownGeometry){var dx=g.icon_bbox[0]-ownGeometry.icon_bbox[0],dy=g.icon_bbox[1]-ownGeometry.icon_bbox[1];g={};["icon_bbox","quantity_bbox","name_bbox"].forEach(function(key){var box=ownGeometry[key];g[key]=[box[0]+dx,box[1]+dy,box[2]+dx,box[3]+dy];});}
            var b=g.icon_bbox,n=g.name_bbox,q=g.quantity_bbox,x=n[0],y=q[1],width=n[2]-x,height=n[3]-y;
            var geometryKey=JSON.stringify([b,n,q]),artKey=ownGeometry?ownGeometry.icon_asset:JSON.stringify(item),rowKey=JSON.stringify(item);
            var card=cached&&valid(cached.panel)?cached.panel:make("Panel",grid,"VoidShadowItem_"+item.id,"VoidShadowItem");
            var fresh=!cached||!valid(cached.panel)||cached.artKey!==artKey;
            if(fresh){
                if(cached&&valid(cached.panel))card.RemoveAndDeleteChildren();
                cached=rowCards[key]={panel:card,artKey:artKey};card.hittest=true;
                if(ownGeometry){cached.art=image(card,ownGeometry.icon_asset,b[0]-x,b[1]-y,b[2]-b[0],b[3]-b[1],"VoidShadowItemIcon");cached.art.SetScaling("stretch-to-fit-preserve-aspect");}
                else {cached.art=make("Panel",card,"","VoidShadowExtraIcon");pos(cached.art,b[0]-x,b[1]-y,b[2]-b[0],b[3]-b[1]);cfg.ArchiveHandoff.Icon(cached.art,item,"shadow",{});}
                cached.plaque=image(card,"quantity_plate",0,0,1,q[3]-q[1],"VoidShadowQuantityPlate");
                cached.count=make("Label",card,"","VoidShadowText");cached.count.AddClass("VoidShadowCount");set(cached.count,{fontSize:"19px",textAlign:"center",color:"#F4F1FF"});
                cached.name=make("Label",card,"","VoidShadowText");cached.name.AddClass("VoidShadowName");set(cached.name,{fontSize:"19px",color:"#F0ECFB",textAlign:"center"});
                card.SetPanelEvent("onmouseover",function(){hoveredCard=card;var live=card.__voidItem;cfg.ArchiveHandoff.Show(live,"shadow",card);var icon=p("ArchiveTooltipStateIcon");if(icon)icon.visible=numberKnown(live);});
                card.SetPanelEvent("onmouseout",function(){if(hoveredCard===card)hoveredCard=null;cfg.ArchiveHandoff.Hide();var icon=p("ArchiveTooltipStateIcon");if(icon)icon.visible=true;});
            }
            card.__voidItem=item;if(card.visible!==true)card.visible=true;
            var moved=cached.geometryKey!==geometryKey;
            if(moved){pos(card,x-415,y-226,width,height);pos(cached.art,b[0]-x,b[1]-y,b[2]-b[0],b[3]-b[1]);pos(cached.name,n[0]-x,n[1]-y,n[2]-n[0],n[3]-n[1]);cached.geometryKey=geometryKey;}
            var value=quantity(item),plateWidth=Math.max(q[2]-q[0],Math.min(width,Math.ceil(value.length*10.6+12))),right=q[2]-x;
            // Fixed right anchor; retain each notch-covering minimum even for zero/unknown.
            var quantityGeometry=JSON.stringify([right-plateWidth,plateWidth,q[3]-q[1]]);
            if(moved||cached.quantityGeometry!==quantityGeometry){pos(cached.plaque,right-plateWidth,0,plateWidth,q[3]-q[1]);pos(cached.count,right-plateWidth,0,plateWidth,q[3]-q[1]);cached.quantityGeometry=quantityGeometry;}
            if(cached.count.text!==value)cached.count.text=value;
            if(cached.name.text!==String(item.name||""))cached.name.text=String(item.name||"");
            if(cached.rowKey!==rowKey&&hoveredCard===card){cfg.ArchiveHandoff.Show(item,"shadow",card);var icon=p("ArchiveTooltipStateIcon");if(icon)icon.visible=known;}
            cached.rowKey=rowKey;
        });
        Object.keys(rowCards).forEach(function(key){var cached=rowCards[key],card=cached.panel;
            if(visibleKeys[key])return;
            if(hoveredCard===card){cfg.ArchiveHandoff.Hide();hoveredCard=null;var icon=p("ArchiveTooltipStateIcon");if(icon)icon.visible=true;}
            if(!knownKeys[key]){if(valid(card))card.DeleteAsync(0);delete rowCards[key];}
            else if(valid(card)&&card.visible!==false)card.visible=false;
        });
    }
    function inspectGeometry(){
        if(!valid(canvas))return null;
        function detail(el){return {id:el.id,type:el.paneltype,text:el.text||"",position:el.GetPositionWithinWindow(),size:[el.actuallayoutwidth,el.actuallayoutheight],width:el.style.width,align:el.style.textAlign,font:el.style.fontFamily,weight:el.style.fontWeight,fontSize:el.style.fontSize};}
        return {root:[root.actuallayoutwidth,root.actuallayoutheight,root.actualuiscale_x],window:p("ArchiveWindow").GetPositionWithinWindow(),size:[p("ArchiveWindow").actuallayoutwidth,p("ArchiveWindow").actuallayoutheight],scale:p("ArchiveWindow").style.transform,first:valid(grid)&&grid.Children().length?grid.Children()[0].Children().map(detail):[]};
    }
    function renderView(data,category,mode,categories,options){
            if(!alive())return false;if(category!=="shadow"){leave();return false;}
            currentFilter=mode||"all";enter(options);
            var sidebarKey=JSON.stringify(categories||[]);if(sidebarKey!==sidebarSignature){renderSidebar(categories);sidebarSignature=sidebarKey;}
            latestRows=join(data);var rowsKey=JSON.stringify([currentFilter,latestRows]);if(rowsKey!==rowsSignature){renderItems(latestRows);rowsSignature=rowsKey;}
            var hint=p("ArchiveHint"),hintText="挑战虚空之影独立随机"+(data&&Number(data.has_pass)===1?"3":"2")+"次 · 允许重复";if(valid(hint)&&hint.text!==hintText)hint.text=hintText;
            if(filterSignature!==currentFilter){Object.keys(filterButtons).forEach(function(key){var button=filterButtons[key];button.image.SetImage(D.assets[key===currentFilter?"filter_selected":"filter_default"].file);button.panel.SetHasClass("VoidShadowSelected",key===currentFilter);});filterSignature=currentFilter;}
            wallet();return true;
    }
    function registerToolsProbe(){
        if(!alive()||!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var probe=cfg.SurvivalClientCallbackProbe;
        if(!probe||!probe.RegisterModule)return false;
        return probe.RegisterModule("archiveVoid",[
            {name:"render",get:function(){return renderView;},set:function(fn){renderView=fn;}},
            {name:"renderSidebar",get:function(){return renderSidebar;},set:function(fn){renderSidebar=fn;}},
            {name:"renderItems",get:function(){return renderItems;},set:function(fn){renderItems=fn;}},
            {name:"enter",get:function(){return enter;},set:function(fn){enter=fn;}},
            {name:"fit",get:function(){return fit;},set:function(fn){fit=fn;}},
            {name:"wallet",get:function(){return wallet;},set:function(fn){wallet=fn;}},
            {name:"leave",get:function(){return leave;},set:function(fn){leave=fn;}}
        ],Number(cfg.HandoffGeneration||0));
    }
    var api=cfg.SurvivalArchiveVoidV1={
        Render:function(data,category,mode,categories,options){return renderView(data,category,mode,categories,options);},
        Leave:function(){return leave();},Fit:function(){return fit();},Rows:function(){return latestRows.slice();},Quantity:quantity,Join:join,
        RegisterToolsProbe:registerToolsProbe,
        IsAlive:alive,
        Dispose:function(){if(disposed)return;leave();disposed=true;subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];if(valid(canvas))canvas.DeleteAsync(0);if(valid(marker))marker.DeleteAsync(0);if(cfg.SurvivalArchiveVoidV1===api)delete cfg.SurvivalArchiveVoidV1;}
    };
    registerToolsProbe();
    if(Game.IsInToolsMode&&Game.IsInToolsMode()){
        var generation=Date.now();Game.AddCommand("survival_void_v1_review_"+generation,function(){if(!alive())return;var args=Array.prototype.slice.call(arguments);if(String(args[0]).indexOf("survival_void_v1_review_")===0)args.shift();if(args[0]==="hover"){var card=p("VoidShadowItem_"+(args[1]||"shadow_01"));if(card&&card.__voidItem){cfg.ArchiveHandoff.Show(card.__voidItem,"shadow",card);p("ArchiveTooltipStateIcon").visible=numberKnown(card.__voidItem);}}else if(args[0]==="filter")cfg.SurvivalArchive.Filter(args[1]);else if(args[0]==="close")cfg.SurvivalArchive.Close();else if(args[0]==="hide")cfg.ArchiveHandoff.Hide();
            else $.Msg("VOID_V1_STATE "+JSON.stringify({active:active,filter:currentFilter,items:latestRows.map(function(item){return {id:item.id,name:item.name,known:numberKnown(item),quantity:quantity(item)};}),geometry:inspectGeometry()}));
        },"Read-only void page UI review",0);$.Msg("VOID_V1_REVIEW survival_void_v1_review_"+generation);
    }
})();
