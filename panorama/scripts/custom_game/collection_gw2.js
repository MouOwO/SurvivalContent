(function(){
"use strict";
var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,A=cfg.ArchiveHandoff,root=$.GetContextPanel();
if(!U||!A)return;
if(cfg.SurvivalCollection&&cfg.SurvivalCollection.Dispose)cfg.SurvivalCollection.Dispose();
var size=[960,548],fitOptions={widthFraction:.95,heightFraction:.9,maxScale:1},life=U.Lifecycle(),viewLife=U.Lifecycle(),highlightLife=U.Lifecycle();
var columns=10,slotSize=78,portraitSize=76,pitch=84,rowsPerPage=4;
var gridWidth=(columns-1)*pitch+slotSize,gridHeight=(rowsPerPage-1)*pitch+slotSize;
// Intent and authoritative caches outlive an individual layout/script instance.
// Closing or reloading must never turn one pending draw into another purchase.
var shared=cfg.SurvivalCollectionState||(cfg.SurvivalCollectionState={pages:{},versions:{},pending:null,serial:0});
// Catalog probabilities and rarities require fresh authoritative snapshots.
// Migrate only the cached view: an unresolved purchase keeps its original nonce.
if(shared.raritySchema!==1){shared.pages={};shared.versions={};shared.raritySchema=1;}
var active=true,opened=false,current="beast",assemblies={},resync={},fetchJob=null,fetching=false;
var canvas,grid,gridBody,empty,draw,drawText,drawCost,tickets,currencyName,summary,result,tooltip,tipPanel,ownershipFilter=0;
var filterOpen=false,filterDismiss,filterMenu,filterItems=[];
var rewardHighlight=null;
var scale=1,cardsKey="",visibleRows=[],slots=[],tabs={},nodes={},api,createdRoots=[];
var names={beast:"瑞兽赐福",ex:"我的前女友",friend:"我的前男友",wife:"我的老婆"};
var filterNames=["全部收藏","已拥有","未拥有"];
var rarityColors={UR:"#ef5350",SSR:"#f5c65e",SR:"#b680ee",R:"#74c8f2",N:"#8fc47b"};
function rarity(item){var quality=String(item.quality||"").trim().toUpperCase(),recognized=Object.prototype.hasOwnProperty.call(rarityColors,quality);return {quality:recognized?quality:"",color:recognized?rarityColors[quality]:"#88939b"};}
function valid(n){return n&&(!n.IsValid||n.IsValid());}
function p(id){return valid(root)?root.FindChildTraverse(id):null;}
function make(type,parent,id,cls){var n=$.CreatePanel(type,parent,id||"");if(cls)n.AddClass(cls);if(id)nodes[id]=n;return n;}
function style(n,values){Object.keys(values).forEach(function(k){if(n.style[k]!==values[k])n.style[k]=values[k];});}
function rect(n,x,y,w,h){style(n,{position:x+"px "+y+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});}
// Source pixels are cropped into nine UV regions. Fixed corners never follow
// the host's aspect ratio; only the center and straight edges expand.
var goldArt={
 frame:{uri:"s2r://panorama/images/events/dark_carnival/overworld/inner_panel_border_png.vtex",size:[400,400],cut:[20,20,20,20],edge:[10,10,10,10],fill:false},
 button:{uri:"s2r://panorama/images/dota_plus/relic_rare_button_psd.vtex",size:[290,100],cut:[16,12,16,12],edge:[8,6,8,6],fill:true},
 slot:{uri:"s2r://panorama/images/hud/passive_ability_border_png.vtex",size:[105,105],cut:[8,8,8,8],edge:[2,2,2,2],fill:false}
};
function nine(parent,key,x,y,w,h,cls){
 var a=goldArt[key],n=make("Panel",parent,"",cls||"CollectionGoldNine");rect(n,x,y,w,h);n.hittest=false;n.hittestchildren=false;
 n.__collectionNine={key:key,cut:a.cut.slice(),edge:a.edge.slice(),pieces:[]};
 var sx=[0,a.cut[0],a.size[0]-a.cut[2],a.size[0]],sy=[0,a.cut[1],a.size[1]-a.cut[3],a.size[1]],dx=[0,a.edge[0],w-a.edge[2],w],dy=[0,a.edge[1],h-a.edge[3],h];
 for(var r=0;r<3;r++)for(var c=0;c<3;c++){
  var piece=make("Panel",n,"","CollectionGoldNinePiece"),sw=sx[c+1]-sx[c],sh=sy[r+1]-sy[r];rect(piece,dx[c],dy[r],dx[c+1]-dx[c],dy[r+1]-dy[r]);piece.hittest=false;piece.hittestchildren=false;
  var px=a.size[0]===sw?0:sx[c]/(a.size[0]-sw)*100,py=a.size[1]===sh?0:sy[r]/(a.size[1]-sh)*100;
  style(piece,{backgroundImage:!a.fill&&r===1&&c===1?"none":'url("'+a.uri+'")',backgroundSize:(a.size[0]/sw*100)+"% "+(a.size[1]/sh*100)+"%",backgroundPosition:px+"% "+py+"%",backgroundRepeat:"no-repeat",backgroundColor:"transparent",overflow:"clip"});n.__collectionNine.pieces.push(piece);
 }
 return n;
}
function label(parent,text,x,y,w,h,font,color,id){var n=make("Label",parent,id,"CollectionGW2Text");rect(n,x,y,w,h);n.text=String(text===undefined?"":text);n.hittest=false;style(n,{fontSize:font+"px",color:color||"#dfdfd6",fontFamily:'"Source Han Sans SC"',fontWeight:"normal",fontStyle:"normal",textShadow:"none",whiteSpace:"nowrap",textOverflow:"ellipsis"});return n;}
function image(parent,uri,x,y,w,h,id,cls){var n=make("Image",parent,id,cls);rect(n,x,y,w,h);n.SetImage(uri);n.hittest=false;n.hittestchildren=false;return n;}
function array(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
function copy(v){return JSON.parse(JSON.stringify(v));}
function known(v){return v!==undefined&&v!==null&&String(v).trim()!==""&&isFinite(Number(v))&&Number(v)>=0;}
function number(v){return known(v)?String(v):"—";}
function countKnown(item){return Number(item.count_known)!==0&&known(item.count);}
function alive(){if(!active)return false;if(valid(root)&&valid(canvas)&&cfg.SurvivalCollection===api)return true;dispose();return false;}
var win=p("CollectionWindow"),scrim=p("CollectionScrim");
if(!valid(scrim)){scrim=make("Button",root,"CollectionScrim","ArchiveHidden");createdRoots.push(scrim);}
if(!valid(win)){win=make("Panel",root,"CollectionWindow","ArchiveHidden");createdRoots.push(win);}
win.AddClass("CollectionGW2Page");
var shell=U.ModalShell.Adopt({id:"collection",panel:win,root:root,scrim:scrim,width:size[0],height:size[1],fit:fitOptions,onClose:function(){if(filterOpen)hideFilterMenu();else close();}});
style(scrim,{backgroundColor:"#00000022"});
// ModalShell establishes input/layer ownership and writes its generic fallback.
// The opaque surface also covers the source texture's partially transparent pixels.
style(win,{width:size[0]+"px",height:size[1]+"px",horizontalAlign:"center",verticalAlign:"center",flowChildren:"none",backgroundColor:"#111413",backgroundImage:"none",border:"0px",boxShadow:"none",padding:"0px",margin:"0px",overflow:"noclip",transformOrigin:"50% 50%"});
canvas=make("Panel",win,"CollectionGW2Canvas","CollectionGW2Canvas");rect(canvas,0,0,size[0],size[1]);canvas.hittest=false;canvas.hittestchildren=true;

var background=make("Panel",canvas,"CollectionGW2Background","CollectionGW2Art");rect(background,0,0,size[0],size[1]);background.hittest=false;background.hittestchildren=false;style(background,{backgroundImage:'url("s2r://panorama/images/dota_plus/dota_plus_background_texture_large_png.vtex")',backgroundSize:"cover",backgroundPosition:"30% 50%",backgroundRepeat:"no-repeat",opacity:"1",backgroundColor:"#111413"});
var header=make("Panel",canvas,"CollectionGW2Header","CollectionGW2FlatRegion");rect(header,9,7,size[0]-18,44);style(header,{backgroundImage:'url("s2r://panorama/images/dota_plus/dota_plus_horizontal_banner_background_png.vtex")',backgroundSize:"cover",backgroundColor:"#111414e8",borderBottom:"1px solid #92764288"});header.hittest=false;
var sidebar=make("Panel",canvas,"CollectionGW2Sidebar","CollectionGW2FlatRegion");rect(sidebar,8,58,54,size[1]-68);style(sidebar,{backgroundImage:"none",backgroundColor:"#191b19d9"});sidebar.hittest=false;
nine(sidebar,"frame",0,0,54,size[1]-68,"CollectionGoldRailFrame");
var footer=make("Panel",canvas,"CollectionGW2Footer","CollectionGW2FlatRegion");rect(footer,80,size[1]-68,size[0]-120,68);style(footer,{backgroundImage:"none",backgroundColor:"transparent",borderTop:"1px solid #92764255"});footer.hittest=false;
var windowFrame=nine(canvas,"frame",0,0,size[0],size[1],"CollectionGoldWindowFrame");
image(canvas,"file://{images}/control_icons/24px/treasure.svg",21,17,24,24,"CollectionGW2Mark");
var title=label(canvas,"收藏",54,14,70,30,24,"#f0e5c9","CollectionGW2Title");style(title,{letterSpacing:"2px",fontWeight:"semi-bold"});
var divider=make("Panel",canvas,"CollectionGW2HeaderDivider");rect(divider,139,20,1,18);style(divider,{backgroundColor:"#ac8e4d49"});divider.hittest=false;
label(canvas,"",157,18,300,24,16,"#b8aa88","CollectionGW2Category");
var closeButton=make("Button",canvas,"CollectionGW2Close","CollectionGW2Button");rect(closeButton,size[0]-39,14,28,28);style(closeButton,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",zIndex:"104"});
nine(closeButton,"button",0,0,28,28,"CollectionGoldQuietControl");
image(closeButton,"file://{images}/control_icons/24px/x_close.svg",2,2,24,24,"CollectionGW2CloseIcon");
closeButton.hittestchildren=false;closeButton.SetPanelEvent("onactivate",function(){if(alive()){hideFilterMenu();shell.RequestClose("button");}});
scrim.SetPanelEvent("onactivate",function(){if(alive())shell.RequestClose("scrim");});
Object.keys(names).forEach(function(id,i){
 var tab=make("Button",canvas,"CollectionGW2Tab_"+id,"CollectionGW2Tab");rect(tab,13,68+i*54,44,44);style(tab,{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});tab.hittestchildren=false;
 nine(tab,"button",0,0,44,44,"CollectionGoldTabSkin");
 var selectedArt=make("Panel",tab,"","CollectionGW2TabSelected");rect(selectedArt,-4,10,2,24);style(selectedArt,{backgroundColor:"#debc6f"});selectedArt.hittest=false;
 image(tab,"file://{images}/control_icons/24px/"+({ex:"star.svg",friend:"profile.svg",wife:"rewards.svg",beast:"trophy.svg"}[id]),10,10,id==="ex"?25:24,24,"","CollectionGoldTabIcon");
 tab.SetPanelEvent("onactivate",function(){if(alive())select(id);});
 tab.SetPanelEvent("onmouseover",function(){if(alive()&&opened)$.DispatchEvent("DOTAShowTextTooltip",tab,names[id]);});tab.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip");});tabs[id]=tab;
});
var filter=make("Button",canvas,"CollectionGW2OwnershipFilter","CollectionGW2Button");rect(filter,789,65,125,27);filter.hittestchildren=false;style(filter,{zIndex:"103"});
label(filter,filterNames[0],11,4,91,20,13,"#eee5ce","CollectionGW2FilterText");label(filter,"▾",104,4,12,20,13,"#c8b88d","CollectionGW2FilterArrow");
filter.SetPanelEvent("onactivate",function(){if(!alive()||!opened)return;if(filterOpen)hideFilterMenu();else showFilterMenu();});
// Use the native dropdown's flat gradient for this small control. Compressing
// the tall gold button's bevel into 27px exposed a dark edge/sampling seam.
filterDismiss=make("Button",canvas,"CollectionGW2FilterDismiss","CollectionGW2FilterDismiss");rect(filterDismiss,0,0,size[0],size[1]);style(filterDismiss,{zIndex:"100"});filterDismiss.hittestchildren=false;filterDismiss.visible=false;
filterDismiss.SetPanelEvent("onactivate",function(){if(alive())hideFilterMenu();return true;});
filterMenu=make("Panel",canvas,"CollectionGW2FilterMenu","CollectionGW2FilterMenu");rect(filterMenu,789,96,125,100);style(filterMenu,{zIndex:"102"});filterMenu.visible=false;
var menuFrame=nine(filterMenu,"frame",0,0,125,100,"CollectionGoldFilterFrame");style(menuFrame,{zIndex:"5",washColor:"#e7ce91"});
filterNames.forEach(function(text,index){
 var option=make("Button",filterMenu,"CollectionGW2FilterOption_"+(["all","owned","unowned"][index]),"CollectionGW2Button CollectionGW2FilterOption");rect(option,5,5+index*30,115,30);option.hittestchildren=false;
 var caption=label(option,text,10,5,95,20,13,"#d9d1bd");
 option.SetPanelEvent("onactivate",function(){if(!alive()||!opened||!filterOpen)return;hideFilterMenu();if(ownershipFilter===index)return;ownershipFilter=index;clearRewardHighlight();grid.ScrollToTop();hideTooltip();render();});
 filterItems.push({panel:option,text:caption});
});
grid=make("Panel",canvas,"CollectionGW2Grid","CollectionGW2Grid");rect(grid,80,108,gridWidth,gridHeight);
gridBody=make("Panel",grid,"CollectionGW2GridBody","CollectionGW2GridBody");rect(gridBody,0,0,gridWidth,gridHeight);
empty=label(canvas,"",80,210,gridWidth,54,19,"#c4c7c6","CollectionGW2Empty");style(empty,{whiteSpace:"normal",textAlign:"center"});empty.visible=false;
summary=label(canvas,"",80,68,600,24,15,"#debc6f","CollectionGW2Summary");
image(canvas,"s2r://panorama/images/icon_ticket_png.vtex",80,size[1]-44,24,20,"CollectionGW2TicketIcon");
currencyName=label(canvas,"",111,size[1]-45,72,24,15,"#aa9c7e","CollectionGW2CurrencyName");
tickets=label(canvas,"",188,size[1]-49,100,30,18,"#debc6f","CollectionGW2Tickets");
var monthlyNote=label(canvas,"月卡玩家每次胜利额外获取+1",280,size[1]-45,450,24,15,"#d3c8ae","CollectionGW2MonthlyNote");monthlyNote.hittest=false;
result=label(canvas,"",280,size[1]-23,450,21,14,"#a5987c","CollectionGW2Result");
draw=make("Button",canvas,"CollectionGW2Draw","CollectionGW2Button CollectionGW2Draw");rect(draw,size[0]-216,size[1]-54,176,40);style(draw,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none"});draw.hittestchildren=false;
nine(draw,"button",0,0,176,40,"CollectionGoldPrimary");
var drawHover=make("Panel",draw,"","CollectionGW2Hover");rect(drawHover,0,0,176,40);style(drawHover,{backgroundColor:"#fff1bf0c",border:"1px solid #e8ce8555"});drawHover.hittest=false;
drawText=label(draw,"抽取",24,9,64,24,17,"#fff0ca","CollectionGW2DrawText");style(drawText,{textAlign:"center",textShadow:"0px 1px 2px #1a1208"});
drawCost=make("Panel",draw,"CollectionGW2DrawCost");rect(drawCost,104,10,52,22);drawCost.hittest=false;drawCost.hittestchildren=false;
image(drawCost,"s2r://panorama/images/icon_ticket_png.vtex",0,1,21,18,"CollectionGW2DrawTicketIcon");
label(drawCost,"—",27,0,25,22,15,"#fff0ca","CollectionGW2DrawCostText");
draw.SetPanelEvent("onactivate",drawOne);
tooltip=cfg.SurvivalArchiveTooltip.Create({parent:canvas,root:root,idPrefix:"CollectionGW2Tooltip",compact:true,collectionRarity:true,isAlive:alive,isActive:function(){return opened;},
 skin:{backing:{file:"s2r://panorama/images/hud/reborn/bg_tooltip_psd.vtex",size:[500,452],nine_slice_ltrb:[12,12,12,12],edge_ltrb:[6,6,6,6]},frame:{file:goldArt.frame.uri,size:goldArt.frame.size,nine_slice_ltrb:goldArt.frame.cut,edge_ltrb:[8,8,8,8],fill:false}},
 getScale:function(){scale=Number(U.Fit(win,root,size[0],size[1],fitOptions))||1;return scale;},
 getBounds:function(){return {width:size[0],height:size[1]};},categoryName:function(id){return names[id]||id;},maxHeight:size[1]-72,watchAnchor:true,
 position:function(info){var x=info.anchor.x+slotSize+8;if(x+info.width>info.bounds.width-8)x=info.anchor.x-info.width-8;return {x:Math.max(8,Math.min(info.bounds.width-info.width-8,x)),y:Math.max(48,Math.min(info.bounds.height-info.height-8,info.anchor.y))};}
});
tipPanel=tooltip.panel;tipPanel.AddClass("CollectionGW2Tooltip");
function hideFilterMenu(){filterOpen=false;if(valid(filterMenu))filterMenu.visible=false;if(valid(filterDismiss))filterDismiss.visible=false;if(valid(filter))filter.RemoveClass("CollectionGW2FilterExpanded");if(valid(nodes.CollectionGW2FilterArrow))nodes.CollectionGW2FilterArrow.text="▾";}
function showFilterMenu(){hideTooltip();$.DispatchEvent("DOTAHideTextTooltip");filterOpen=true;filterMenu.visible=true;filterDismiss.visible=true;filter.AddClass("CollectionGW2FilterExpanded");nodes.CollectionGW2FilterArrow.text="▴";}
function hideTooltip(){if(tooltip)tooltip.Hide();}
function leaveTooltip(){if(tooltip)tooltip.QueueHide();}
function showTooltip(card,item){if(alive()&&opened&&valid(card))tooltip.Show(item,current,card,false);}
function rewardIcon(card,item){
 var host=make("Panel",card,"","CollectionGW2Portrait");rect(host,1,1,portraitSize,portraitSize);host.hittest=false;host.hittestchildren=false;
 // Dedicated, prefiltered thumbnails avoid loading large originals into the grid.
 // Unknown catalogue entries keep the existing resolver and their original artwork.
 var portrait=null,portraitId=String(item.id||"");
 if(cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item)){
  portrait=cfg.SurvivalRewardPresentation.CreateRegisteredIcon(host,item,"");
 }else if(/^(ex|friend|wife|beast)_(0[1-9]|[1-3][0-9]|40)$/.test(portraitId)){
  portrait=make("Image",host,"","");
  portrait.SetImage("s2r://panorama/images/custom_game/collection_portraits_compact_v1/"+portraitId+".vtex");
 }else A.Icon(host,item,current,{});
 function find(n){if(portrait)return;if(n.paneltype==="Image"){portrait=n;return;}array(n.Children()).forEach(find);}
 if(!portrait)array(host.Children()).forEach(find);
 if(!portrait)return;
 portrait.SetParent(host);
 array(host.Children()).forEach(function(child){if(child!==portrait)child.DeleteAsync(0);});
 host.RemoveClass("ArchiveSocialPortraitCard");portrait.RemoveClass("ArchiveRewardIcon");portrait.AddClass("CollectionGW2PortraitImage");
 rect(portrait,0,0,portraitSize,portraitSize);style(portrait,{horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",border:"0px",backgroundColor:"transparent",boxShadow:"none",transform:"none"});
 portrait.hittest=false;portrait.hittestchildren=false;if(cfg.SurvivalRewardPresentation&&cfg.SurvivalRewardPresentation.FillIcon)cfg.SurvivalRewardPresentation.FillIcon(portrait,item);
}
// Item-local feedback only: no particle scene, toast or success label.
function setRewardHighlight(card,on){
 if(on&&valid(card.__collectionRewardGlow)&&!valid(card.__collectionRewardSweep)){
  var sweep=make("Panel",card.__collectionRewardGlow,"","RewardGlassSweep");sweep.hittest=false;sweep.hittestchildren=false;card.__collectionRewardSweep=sweep;
 }
 card.SetHasClass("CollectionGW2RewardHighlight",on);
}
function clearRewardHighlight(){
 highlightLife.Cancel();rewardHighlight=null;
 slots.forEach(function(card){if(valid(card))card.SetHasClass("CollectionGW2RewardHighlight",false);});
}
function highlightReward(itemId){
 clearRewardHighlight();
 var card=slots.filter(function(slot){return slot.__collectionItem&&slot.__collectionItem.id===itemId;})[0];
 if(!valid(card)||card.visible===false)return;
 rewardHighlight={pool_id:current,item_id:itemId};
 setRewardHighlight(card,true);
 highlightLife.Later(0.65,function(){if(alive())clearRewardHighlight();});
}
function renderCards(rows){
 var signature=JSON.stringify([current,ownershipFilter,rows]);if(signature===cardsKey)return;cardsKey=signature;hideTooltip();gridBody.RemoveAndDeleteChildren();slots=[];
 visibleRows=rows.filter(function(item){return ownershipFilter===0||countKnown(item)&&(ownershipFilter===1?Number(item.count)>0:Number(item.count)===0);});
 var count=visibleRows.length,rowCount=Math.ceil(count/columns);rect(grid,80,108,gridWidth+(rowCount>rowsPerPage?8:0),gridHeight);rect(gridBody,0,0,gridWidth,Math.max(gridHeight,rowCount?(rowCount-1)*pitch+slotSize:0));
 for(var i=0;i<count;i++){
  var item=visibleRows[i],grade=rarity(item),card=make("Button",gridBody,"CollectionGW2Item_"+item.id,"CollectionGW2Slot");rect(card,(i%columns)*pitch,Math.floor(i/columns)*pitch,slotSize,slotSize);style(card,{backgroundImage:"none",border:"0px",backgroundColor:"transparent",boxShadow:"none"});card.hittest=true;card.hittestchildren=false;card.__collectionItem=item;
  if(grade.quality)card.AddClass("CollectionGW2Quality"+grade.quality);
  var backing=make("Panel",card,"","CollectionGoldSlotBacking");rect(backing,0,0,slotSize,slotSize);style(backing,{backgroundColor:"#090d0d"});backing.hittest=false;
  rewardIcon(card,item);card.SetHasClass("CollectionGW2Unowned",countKnown(item)&&Number(item.count)===0);card.SetHasClass("CollectionGW2Unknown",!countKnown(item));
  card.SetHasClass("CollectionGW2Unavailable",Number(item.draw_enabled)===0);
  nine(card,"slot",0,0,slotSize,slotSize,"CollectionGW2SlotFrame");
  var rim=make("Panel",card,"","CollectionGoldQualityRim");rect(rim,0,0,slotSize,slotSize);style(rim,{border:"2px solid "+grade.color});rim.hittest=false;rim.hittestchildren=false;
  var hover=make("Panel",card,"","CollectionGW2Hover");rect(hover,3,3,slotSize-6,slotSize-6);style(hover,{backgroundImage:"none",backgroundColor:"transparent",border:"1px solid "+grade.color});hover.hittest=false;hover.hittestchildren=false;
  if(grade.quality){var gradeWidth=grade.quality.length===3?30:grade.quality.length===2?24:17,gradeLabel=label(card,grade.quality,slotSize-gradeWidth-3,2,gradeWidth,16,11,grade.color);gradeLabel.AddClass("CollectionGW2RarityLabel");style(gradeLabel,{textAlign:"center",fontWeight:"bold",backgroundColor:"transparent",textShadow:"none"});}
  var quantity=label(card,countKnown(item)?number(item.count):"—",4,slotSize-19,slotSize-8,18,12,"#f0eee0");quantity.AddClass("CollectionGW2CardLabel");quantity.visible=!countKnown(item)||Number(item.count)>0;style(quantity,{textAlign:"right"});bindCard(card,item);
  var glow=make("Panel",card,"","CollectionGW2RewardGlow");glow.AddClass("RewardGlassSurface");rect(glow,2,2,slotSize-4,slotSize-4);glow.hittest=false;glow.hittestchildren=false;
  card.__collectionRewardGlow=glow;
  setRewardHighlight(card,!!rewardHighlight&&rewardHighlight.pool_id===current&&rewardHighlight.item_id===item.id);
  slots.push(card);
 }
}
function bindCard(card,item){card.SetPanelEvent("onmouseover",function(){showTooltip(card,item);});card.SetPanelEvent("onmouseout",leaveTooltip);card.SetPanelEvent("onactivate",function(){if(!alive()||!opened)return;showTooltip(card,item);});}
function canDraw(){var data=shared.pages[current],s=data&&data.social;return opened&&!shared.pending&&s&&Number(data.pending)!==1&&known(s.tickets)&&known(s.draw_cost)&&Number(s.draw_cost)>0&&Number(s.tickets)>=Number(s.draw_cost)&&known(s.remaining)&&Number(s.remaining)>0;}
function render(){
 if(!alive()||!opened)return;var data=shared.pages[current],s=data&&data.social,rows=array(data&&data.rows);
 Object.keys(tabs).forEach(function(id){tabs[id].SetHasClass("CollectionGW2Selected",id===current);});nodes.CollectionGW2Category.text=names[current];nodes.CollectionGW2FilterText.text=filterNames[ownershipFilter];
 filterItems.forEach(function(item,index){item.panel.SetHasClass("CollectionGW2FilterSelected",index===ownershipFilter);style(item.text,{color:index===ownershipFilter?"#ffe2a0":"#d9d1bd"});});
 renderCards(rows);empty.visible=!data||!visibleRows.length;
 empty.text=!data?"正在读取收藏…":ownershipFilter===1?"暂无已拥有的收藏":ownershipFilter===2?"暂无未拥有的收藏":"暂无收藏";
 summary.text=data?(rows.every(countKnown)?rows.filter(function(item){return Number(item.count)>0;}).length:"—")+" / "+rows.length+" 已收集":"等待服务端同步";
 currencyName.text=s?String(s.currency_name||"抽取券"):"抽取券";tickets.text=s?number(s.tickets):"—";nodes.CollectionGW2DrawCostText.text=s?number(s.draw_cost):"—";
 draw.enabled=!!canDraw();draw.SetHasClass("CollectionGW2Disabled",!draw.enabled);drawText.text=shared.pending?"结算中…":s&&Number(s.remaining)===0?"已全部集满":"抽取";
 drawCost.visible=drawText.text==="抽取";rect(drawText,drawCost.visible?24:0,9,drawCost.visible?64:176,24);
 var outcome=shared.outcome&&shared.outcome.pool_id===current?shared.outcome:null;
 result.text=shared.pending?"奖励正在结算，请稍候…":outcome&&!outcome.ok?outcome.error||"抽取未完成，请稍后重试":"";
 if(cfg.SurvivalArchiveFontV36)[monthlyNote,currencyName,tickets,result,summary,drawText,nodes.CollectionGW2Category,nodes.CollectionGW2FilterText].forEach(cfg.SurvivalArchiveFontV36.Render);
}
function request(full,category){
 if(!alive())return;fetching=true;category=category||current;
 GameEvents.SendCustomGameEventToServer("survival_archive_request",{category_id:category,prefetch:full?1:0});
 if(!fetchJob&&opened){fetchJob=life.Later(.8,function(){fetchJob=null;if(!alive())return;if(opened&&(!shared.pages[current]||Object.keys(resync).length))request(true);});}
}
function queueResync(category){resync[category]=true;if(!opened||fetchJob)return;fetchJob=life.Later(.2,function(){fetchJob=null;if(alive()&&opened)request(true);});}
function snapshot(packet){
 if(!alive()||!packet||!Object.prototype.hasOwnProperty.call(names,packet.category_id))return;
 var category=packet.category_id,sequence=Number(packet.sequence)||0;if(sequence<=Number(shared.versions[category]||0)||!(packet.ok===true||Number(packet.ok)===1))return;
 var group=assemblies[category];if(!group||sequence>group.sequence)group=assemblies[category]={sequence:sequence,header:copy(packet),chunks:{},count:Number(packet.chunks)||1};
 if(sequence!==group.sequence)return;var chunk=Number(packet.chunk)||1;if(chunk<1||chunk>group.count)return;group.chunks[chunk]=copy(array(packet.rows));
 if(Object.keys(group.chunks).length!==group.count)return;
 var complete=group.header;complete.rows=[];for(var i=1;i<=group.count;i++){if(!group.chunks[i])return;complete.rows=complete.rows.concat(group.chunks[i]);}delete assemblies[category];
 if(Number(complete.delta)===1){if(!shared.pages[category]||Number(shared.versions[category])!==Number(complete.base_sequence)){queueResync(category);return;}complete=cfg.SurvivalSnapshotCache.Apply(shared.pages[category],complete.rows);}else delete resync[category];
 shared.pages[category]=complete;shared.versions[category]=sequence;fetching=false;
 if(shared.pending&&shared.pending.pool_id===category&&(shared.pending.acknowledged?matchesDraw(complete,shared.pending):committedDraw(complete,shared.pending)))finishDraw(shared.pending,complete);
 else if(opened&&current===category)render();
}
function committedDraw(data,intent){var draw=data&&data.last_draw,suffix=":social_draw:"+intent.request_id;return !!draw&&Number(data.pending)===0&&draw.pool_id===intent.pool_id&&String(draw.id||"").slice(-suffix.length)===suffix;}
function matchesDraw(data,intent){if(!data)return false;if(known(intent.revision))return known(data.revision)&&Number(data.revision)>=Number(intent.revision);return committedDraw(data,intent);}
function finishDraw(intent,data){
 // Consume the intent before rendering: both ACK orders and reload recovery
 // converge here, while later snapshots cannot replay an old reward.
 shared.pending=null;shared.outcome={pool_id:intent.pool_id,ok:true};render();
 if(!opened||current!==intent.pool_id||!committedDraw(data,intent)||!intent.counts)return;
 var name=String(data.last_draw.name||"");
 var acquired=array(data.rows).filter(function(item){
  return countKnown(item)&&known(intent.counts[item.id])&&Number(item.count)>Number(intent.counts[item.id])&&(!name||item.name===name);
 });
 // Never highlight an unrelated row or substitute a text popup when the result
 // cannot be identified or is excluded by the ownership filter.
 if(acquired.length===1)highlightReward(acquired[0].id);
}
function drawOne(){
 if(alive()&&filterOpen){hideFilterMenu();return;}
 if(!alive()||!canDraw())return;var requestId="collection_"+Date.now()+"_"+(++shared.serial);
 var counts={};array(shared.pages[current]&&shared.pages[current].rows).forEach(function(item){if(countKnown(item))counts[item.id]=Number(item.count);});
 shared.pending={pool_id:current,request_id:requestId,counts:counts};shared.outcome=null;render();
 GameEvents.SendCustomGameEventToServer("survival_archive_social_draw",{pool_id:current,request_id:requestId});
}
function drawResult(message){
 if(!alive()||!message||!shared.pending)return;var intent=shared.pending;
 if(message.request_id!==intent.request_id||message.pool_id!==intent.pool_id)return;
 // Transient persistence failures remain queued server-side: never issue a new intent.
 if((message.ok===true||Number(message.ok)===1)&&(message.terminal===true||Number(message.terminal)===1)){shared.outcome={pool_id:intent.pool_id,ok:true};if(known(message.revision))intent.revision=Number(message.revision);if(matchesDraw(shared.pages[intent.pool_id],intent)){finishDraw(intent,shared.pages[intent.pool_id]);return;}else{intent.acknowledged=true;if(opened)request(true,intent.pool_id);}}
 else if(message.terminal===true||Number(message.terminal)===1){shared.outcome={pool_id:intent.pool_id,ok:false,error:message.error};shared.pending=null;}
 render();
}
function recoverIntent(){
 var intent=shared.pending;if(!intent)return;
 if(intent.acknowledged){if(current!==intent.pool_id)request(true,intent.pool_id);return;}
 var pool=intent.pool_id,requestId=intent.request_id;
 // One delayed replay per closed-to-open transition repairs an ACK lost during
 // layout reload. The original nonce retains the server's idempotency record.
 viewLife.Later(.55,function(){
  if(!alive()||!opened)return;var pending=shared.pending;
  if(!pending||pending.acknowledged||pending.pool_id!==pool||pending.request_id!==requestId)return;
  GameEvents.SendCustomGameEventToServer("survival_archive_social_draw",{pool_id:pool,request_id:requestId});
 });
}
function select(id){if(!alive()||!names[id])return;hideFilterMenu();clearRewardHighlight();current=id;ownershipFilter=0;grid.ScrollToTop();hideTooltip();render();if(opened&&!shared.pages[id])request(true);}
function open(id){if(!alive())return;hideFilterMenu();var wasOpen=opened;if(id&&names[id]&&id!==current){clearRewardHighlight();current=id;ownershipFilter=0;grid.ScrollToTop();}if(cfg.SurvivalArchive&&cfg.SurvivalArchive.IsOpen&&cfg.SurvivalArchive.IsOpen())cfg.SurvivalArchive.Close();opened=true;win.RemoveClass("ArchiveHidden");scrim.RemoveClass("ArchiveHidden");shell.Open();scale=Number(U.Fit(win,root,size[0],size[1],fitOptions))||1;render();request(!shared.pages[current]||Object.keys(resync).length>0);if(!wasOpen)recoverIntent();}
function close(){if(!active)return;hideFilterMenu();opened=false;clearRewardHighlight();hideTooltip();viewLife.Cancel();if(valid(win)){shell.Close();win.AddClass("ArchiveHidden");}if(valid(scrim))scrim.AddClass("ArchiveHidden");$.DispatchEvent("DOTAHideTextTooltip");}
function dispose(){if(!active)return;close();active=false;highlightLife.Dispose();life.Dispose();viewLife.Dispose();shell.Dispose();if(tooltip)tooltip.Dispose();if(valid(canvas))canvas.DeleteAsync(0);createdRoots.forEach(function(n){if(valid(n))n.DeleteAsync(0);});if(valid(win))win.RemoveClass("CollectionGW2Page");}
api=cfg.SurvivalCollection={Open:open,Close:close,Toggle:function(){if(alive()){if(opened)close();else open();}},Select:select,IsOpen:function(){return alive()&&opened;},Dispose:dispose,Inspect:function(){return {open:opened,layout:"collection_gw2",canvas:size.slice(),columns:columns,portraitSize:portraitSize,category:current,search:"",ownershipFilter:["all","owned","unowned"][ownershipFilter],filterMenuOpen:filterOpen,rows:visibleRows.map(function(item){return {id:item.id,name:item.name,count:item.count,target:item.target};}),slots:slots.length,drawEnabled:!!draw.enabled,pending:shared.pending?copy(shared.pending):null,versions:copy(shared.versions),tooltipVisible:tooltip&&tooltip.IsVisible()};}};
life.Subscribe("survival_archive_snapshot",snapshot);life.Subscribe("survival_archive_social_result",drawResult);
win.AddClass("ArchiveHidden");scrim.AddClass("ArchiveHidden");shell.Close();
})();
