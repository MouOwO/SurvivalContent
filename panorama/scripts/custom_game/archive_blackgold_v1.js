(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel();
    if(cfg.SurvivalArchiveBlackGold&&cfg.SurvivalArchiveBlackGold.Dispose)cfg.SurvivalArchiveBlackGold.Dispose();
    if(cfg.ArchiveBlackGoldDisabled)return;
    var stage=Math.max(1,Math.min(5,Number(cfg.ArchiveBlackGoldStage)||5)),disposed=false,views=[],panelCache={};
    var originalFactory=cfg.SurvivalArchiveV10Factory;
    var uri={
        header:'url("s2r://panorama/images/dota_plus/dota_plus_horizontal_banner_background_png.vtex")',
        section:'url("s2r://panorama/images/textures/header_texture_png.vtex")'
    };
    // Request native vector raster sizes explicitly, as the official settings UI
    // does. CSS size alone leaves a 24px source texture underneath a large badge.
    var navigationIcons={clear:"emblems",shadow:"unusual",map_level:"stats",work:"home",gift:"treasure",fragment:"skull",pet:"unusual",boss:"skull",points:"treasure",commerce_goods:"treasure",shop:"stats",endless:"skull",fishing:"unusual",building:"emblems",starjoy_points:"stats",titles:"profile"};
    function symbolUri(key){return key==="stats"?"s2r://panorama/images/control_icons/stats_icon_png.vtex":"s2r://panorama/images/control_icons/24px/"+key+".vsvg";}
    function symbol(legacy,key,large,selected){
        if(!valid(legacy)||!key)return;
        var glyph=legacy.__archiveBlackGoldSymbol,textureSize=large?112:48;
        if(!valid(glyph)){
            glyph=$.CreatePanel("Image",legacy.GetParent(),"",{texturewidth:textureSize+"px",textureheight:textureSize+"px",scaling:"stretch-to-fit-preserve-aspect"});
            glyph.AddClass("ArchiveBlackGoldSymbol");glyph.hittest=false;glyph.hittestchildren=false;
            glyph.SetScaling("stretch-to-fit-preserve-aspect");legacy.__archiveBlackGoldSymbol=glyph;
        }
        legacy.visible=false;glyph.visible=true;
        var image=symbolUri(key);
        // The original view refreshes the hidden legacy image on each snapshot;
        // the official replacement keeps its own native texture and identity.
        if(glyph.__archiveBlackGoldImage!==image){glyph.SetImage(image);glyph.__archiveBlackGoldImage=image;}
        var origin=String(legacy.style.position||"0px 0px 0px").split(/\s+/);
        paint(glyph,{position:large?((parseFloat(origin[0])||0)+12)+"px "+((parseFloat(origin[1])||0)+12)+"px 0px":"7px 7px 0px",width:large?"48px":"18px",height:large?"48px":"18px",opacity:large?".9":selected?"1":".62"});
    }
    function navigationIcon(button,selected){
        var key=navigationIcons[String(button.id||"").replace(/^ArchiveV10Category_/,"")];
        if(!key)return;
        walk(button,function(child){
            if(is(child,"ArchiveParchmentIconRing"))child.visible=false;
            if(is(child,"ArchiveV10Icon"))symbol(child,key,false,selected);
        });
    }
    function headerSymbol(category){
        var legacy=find("ArchiveV10CategoryIcon");if(!valid(legacy))return;
        legacy.GetParent().Children().forEach(function(child){if(is(child,"ArchiveParchmentIconRing"))child.visible=false;});
        symbol(legacy,navigationIcons[category]||"emblems",true,true);
    }
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function find(id){if(!valid(root))return null;var node=panelCache[id];if(!valid(node))node=panelCache[id]=root.FindChildTraverse(id);return node;}
    function paint(node,values,force){if(!valid(node))return;var cache=node.__archiveBlackGoldPaint||(node.__archiveBlackGoldPaint={});Object.keys(values).forEach(function(key){if(force||cache[key]!==values[key]){node.style[key]=values[key];cache[key]=values[key];}});}
    function walk(node,fn){if(!valid(node))return;fn(node);node.Children().forEach(function(child){if(child.id!=="ArchiveFontV36Glyphs")walk(child,fn);});}
    function is(node,name){return node.BHasClass&&node.BHasClass(name);}
    function rowBacking(card,node){
        // The retained view assigns parity from the visible slot after filtering.
        // Use opaque surfaces: stacked alpha previously made both rows near-black.
        var dark=is(card,"ArchiveParchmentRowAlternate");
        paint(node,{backgroundImage:"none",backgroundColor:dark?
            "gradient(linear,0% 0%,100% 0%,from(#191e19),to(#171c18))":
            "gradient(linear,0% 0%,100% 0%,from(#363c30),to(#2c332a))",opacity:"1"});
    }
    function raiseSection(node){
        if(!valid(node))return;
        var original=node.__archiveBlackGoldSectionPosition;
        if(!original)original=node.__archiveBlackGoldSectionPosition=String(node.style.position);
        var xy=original.split(/\s+/),y=parseFloat(xy[1]);
        if(isFinite(y))paint(node,{position:xy[0]+" "+(y-5)+"px 0px"},true);
    }
    function divider(button,key,y,width){
        var line=button[key];
        if(!valid(line)){line=$.CreatePanel("Panel",button,"");line.AddClass("ArchiveBlackGoldDivider");line.hittest=false;line.hittestchildren=false;button[key]=line;}
        paint(line,{position:"-3px "+y+"px 0px",width:width,height:"1px",backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#c4b87b00),color-stop(.18,#c4b87b33),color-stop(.82,#c4b87b33),to(#c4b87b00))",zIndex:"1"});
        return line;
    }
    function fitSidebar(sidebar){
        if(!valid(sidebar))return;
        var backing=find("ArchiveV10Shell_Sidebar");if(!valid(backing))return;
        // Extend the selection to both rail edges, keeping the glyphs and labels
        // at their existing screen positions (the viewport starts 12px earlier).
        // Two extra pixels at the top let the first selection reach its divider.
        paint(sidebar,{position:"30px 268px 0px",width:backing.style.width,height:"577px"},true);
        var buttons=sidebar.Children();buttons.forEach(function(button,index){
            var selected=is(button,"ArchiveV10Selected"),original=button.__archiveBlackGoldRowPosition;
            if(!original)original=button.__archiveBlackGoldRowPosition=String(button.style.position);
            var y=parseFloat(original.split(/\s+/)[1])||0;
            // layoutSidebar owns the row widths and runs on each snapshot.
            paint(button,{position:"0px "+(y+(selected?0:2))+"px 0px",width:"100%",height:selected?"37px":"35px",overflow:"noclip",borderBottom:"0px"},true);
            button.Children().forEach(function(child){
                if(is(child,"ArchiveParchmentCategoryBadge"))paint(child,{position:selected?"16px 3px 0px":"16px 1px 0px"},true);
                // Keep the confirmed Source Han glyph baseline after remote synchronization.
                if(is(child,"ArchiveV10Text"))paint(child,{position:selected?"59px 7px 0px":"59px 5px 0px"},true);
            });
            // Replace solid borders with decorative lines. The selected top line
            // takes over the preceding divider so the highlight meets it exactly.
            divider(button,"__archiveBlackGoldBottomDivider",selected?36:34,backing.style.width).visible=index===buttons.length-1||!is(buttons[index+1],"ArchiveV10Selected");
            if(selected)divider(button,"__archiveBlackGoldTopDivider",1,backing.style.width).visible=true;
            else if(valid(button.__archiveBlackGoldTopDivider))button.__archiveBlackGoldTopDivider.visible=false;
        });
    }
    function frame(background){
        if(!valid(background))return;
        var corners=background.__archiveBlackGoldCorners;
        if(!corners){corners=[];["TopLeft","TopRight","BottomLeft","BottomRight"].forEach(function(side){var p=$.CreatePanel("Panel",background,"");p.AddClass("ArchiveBlackGoldCorner");p.AddClass("ArchiveBlackGoldCorner"+side);p.hittest=false;p.hittestchildren=false;corners.push(p);});background.__archiveBlackGoldCorners=corners;}
        corners.forEach(function(p){p.visible=stage>=5;});
    }
    function apply(){
        if(disposed)return;var canvas=find("ArchiveV10Canvas"),windowPanel=find("ArchiveWindow");if(!valid(canvas)||!valid(windowPanel))return;
        windowPanel.AddClass("ArchiveBlackGoldPage");
        for(var i=1;i<=5;i++)windowPanel.SetHasClass("ArchiveBlackGoldRound"+i,stage===i);
        // Official dotastyles.css dotaPlusBgGradient, with its brown token
        // expanded. The engine draws this surface without a scaled bitmap.
        paint(find("ArchiveV10Shell_Background"),{backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#433620),color-stop(.5,#141b21ef),to(#141b21ef))",opacityMask:"none",border:stage>=5?"1px solid #b29b675c":"1px solid #6a65504d",boxShadow:"none"});
        paint(find("ArchiveV10Shell_Header"),{backgroundImage:uri.header,backgroundSize:"cover",backgroundPosition:"0% 45%",backgroundRepeat:"no-repeat",backgroundColor:"#171713",opacityMask:"none",borderBottom:"1px solid #b6a47755"});
        paint(find("ArchiveV10Shell_Sidebar"),{backgroundImage:"none",backgroundColor:stage>=2?"#101210d9":"#1012108c",borderRight:stage>=2?"1px solid #bdab7933":"0px"});
        paint(find("ArchiveV10Shell_Content"),{backgroundImage:"none",backgroundColor:stage>=2?"#171a17d9":"#171a1799"});
        ["ArchiveV10SectionStrip","ArchiveV10SidebarStrip"].forEach(function(id){paint(find(id),{backgroundImage:stage>=3?uri.section:"none",backgroundSize:"100% 100%",backgroundColor:stage>=3?"#080e1080":"#ffffff04",opacity:stage>=3?".42":"1",borderBottom:"1px solid #a3946330"});});
        ["ArchiveV10WindowTitle","ArchiveV10OverviewTitle","ArchiveV10_page_title"].forEach(function(id){paint(find(id),{color:"#eee6cf",textShadow:stage>=5?"#00000088 0px 2px 3px 1.0":"none"});});
        paint(find("ArchiveV10Overview"),{color:"#c6ac70"});
        ["ArchiveV10SectionTitle","ArchiveV10FilterText"].forEach(function(id){paint(find(id),{color:"#d9d6c4"});});
        paint(find("ArchiveV10Context"),{color:"#a7ab9d"});paint(find("ArchiveStatus"),{color:"#989e91"});
        ["ArchiveV10Context","ArchiveV10SectionStrip","ArchiveV10SectionTitle"].forEach(function(id){raiseSection(find(id));});
        paint(find("ArchiveEmpty"),{color:"#a5ac9d"});
        // layoutSidebar writes label colors directly on every snapshot. Reapply
        // just these labels even when our own material cache has not changed.
        var sidebar=find("ArchiveV10Sidebar"),category="";if(valid(sidebar))sidebar.Children().forEach(function(button){var selected=is(button,"ArchiveV10Selected");if(selected)category=String(button.id||"").replace(/^ArchiveV10Category_/,"");navigationIcon(button,selected);paint(button,{backgroundImage:"none",backgroundColor:selected?(stage>=2?"#b69a5030":"#b69a5018"):"transparent",borderLeft:selected?"3px solid #bda96c":"3px solid transparent",borderBottom:stage>=2?"1px solid #c4b87b12":"1px solid transparent"});walk(button,function(child){if(is(child,"ArchiveV10Text"))paint(child,{color:selected?"#f0dfae":"#b6beb1"},true);});});
        fitSidebar(sidebar);
        if(category)headerSymbol(category);
        paint(find("ArchiveV10FilterToggle"),{backgroundImage:"none",backgroundColor:stage>=4?"gradient(linear,0% 0%,0% 100%,from(#30352e),to(#1d231e))":"#192019b8",border:stage>=4?"1px solid #8b855466":"1px solid #62694c66",boxShadow:stage>=4?"inset #00000066 0px 1px 3px 1px":"none"});
        paint(find("ArchiveV10FilterMenu"),{backgroundImage:"none",backgroundColor:"#151b17fc",border:"1px solid #8d8254",boxShadow:"#000000aa 0px 5px 16px 1px"});
        ["all","unlocked","locked"].forEach(function(id){var p=find("ArchiveV10Filter_"+id);if(!valid(p))return;paint(p,{backgroundColor:is(p,"ArchiveV10Selected")?"#ad985333":"transparent"});walk(p,function(child){if(is(child,"ArchiveV10Text"))paint(child,{color:"#d8ddcd"});});});
        paint(find("ArchiveV10Close"),{backgroundImage:"none",backgroundColor:stage>=4?"gradient(linear,0% 0%,0% 100%,from(#373d36),to(#20251f))":"#24291f",border:"1px solid #96956d66"});
        var close=find("ArchiveV10Close");if(valid(close)){if(!valid(close.__archiveBlackGoldGlyph)){var glyph=$.CreatePanel("Image",close,"");glyph.hittest=false;glyph.hittestchildren=false;glyph.SetImage("file://{images}/control_icons/24px/x_close.svg");glyph.SetScaling("stretch-to-fit-preserve-aspect");paint(glyph,{position:"6px 6px 0px",width:"17px",height:"17px"});close.__archiveBlackGoldGlyph=glyph;}walk(close,function(child){if(is(child,"ArchiveV10Text"))paint(child,{color:"#dddac5"});});}
        var grid=find("ArchiveGrid");if(valid(grid))grid.Children().forEach(function(card){if(!card.visible||!card.__v10)return;var cell=card.__v10,unowned=is(card,"ArchiveCommerceUnowned"),unknown=is(card,"ArchiveCommerceUnknown");paint(cell.name,{color:unowned?"#7e887c":unknown?"#a0a997":"#e0e3d2"});
            walk(card,function(node){if(is(node,"ArchiveParchmentRowBacking"))rowBacking(card,node);if(is(node,"ArchiveV10HoverFrame"))paint(node,{backgroundImage:"none",backgroundColor:"#d9c17a0b",border:"1px solid #c5b57b55"});if(is(node,"ArchiveCommerceIconBacking"))paint(node,{backgroundImage:"none",backgroundColor:"#080e0bee",border:unowned?"1px solid #777f6166":"1px solid #b1a26b99",boxShadow:stage>=5&&!unowned?"#c2b77b12 0px 0px 6px 1px":"inset #00000099 0px 0px 3px 1px"});});
            if(valid(cell.track))paint(cell.track,{backgroundImage:"none",backgroundColor:"#080d09cc",border:"1px solid #6b745455"});
            if(valid(cell.fill))paint(cell.fill,{backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#70673e),color-stop(.7,#b9aa64),to(#e2d69b))"});
        });
        frame(find("ArchiveV10Shell_Background"));
    }
    function wrap(view){if(!view||views.some(function(entry){return entry.view===view;}))return view;var render=view.Render;var wrapped=function(){var result=render.apply(this,arguments);apply();if(view.ApplyTypography)view.ApplyTypography();return result;};view.Render=wrapped;views.push({view:view,render:render,wrapped:wrapped});apply();return view;}
    var factory=function(){return wrap(originalFactory.apply(this,arguments));};
    if(originalFactory)cfg.SurvivalArchiveV10Factory=factory;
    wrap(cfg.SurvivalArchiveV10);
    cfg.SurvivalArchiveBlackGold={Apply:apply,SetStage:function(value){stage=Math.max(1,Math.min(5,Number(value)||5));cfg.ArchiveBlackGoldStage=stage;apply();return stage;},Stage:function(){return stage;},Dispose:function(){if(disposed)return;disposed=true;if(cfg.SurvivalArchiveV10Factory===factory)cfg.SurvivalArchiveV10Factory=originalFactory;views.forEach(function(entry){if(entry.view.Render===entry.wrapped)entry.view.Render=entry.render;});views=[];}};
})();
