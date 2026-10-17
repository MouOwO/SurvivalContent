(function(){
"use strict";
var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,A=cfg.ArchiveHandoff,root=$.GetContextPanel();
if(!U||!A)return;
if(cfg.SurvivalCollection&&cfg.SurvivalCollection.Dispose)cfg.SurvivalCollection.Dispose();
var P=cfg.CollectionGW2Data||{},size=P.canvas||[900,478],fitReference=[1200,778],life=U.Lifecycle(),viewLife=U.Lifecycle(),highlightLife=U.Lifecycle();
var columns=10,slotSize=78,portraitSize=76,pitch=84,rowsPerPage=4;
var gridWidth=(columns-1)*pitch+slotSize,gridHeight=(rowsPerPage-1)*pitch+slotSize;
// Intent and authoritative caches outlive an individual layout/script instance.
// Closing or reloading must never turn one pending draw into another purchase.
var shared=cfg.SurvivalCollectionState||(cfg.SurvivalCollectionState={pages:{},versions:{},pending:null,serial:0});
// Catalog probabilities and rarities require fresh authoritative snapshots.
// Migrate only the cached view: an unresolved purchase keeps its original nonce.
if(shared.raritySchema!==1){shared.pages={};shared.versions={};shared.raritySchema=1;}
var active=true,opened=false,current="ex",query="",assemblies={},resync={},fetchJob=null,fetching=false;
var canvas,grid,gridBody,empty,search,draw,drawText,tickets,summary,result,tooltip,tipPanel;
var rewardHighlight=null;
var scale=1,cardsKey="",visibleRows=[],slots=[],tabs={},nodes={},api,createdRoots=[];
var names={ex:"我的前女友",friend:"我的前男友",wife:"我的老婆",beast:"瑞兽赐福"};
var rarityColors={UR:"#ef5350",SSR:"#f5c65e",SR:"#b680ee",R:"#74c8f2",N:"#8fc47b"};
function rarity(item){var quality=String(item.quality||"").trim().toUpperCase(),recognized=Object.prototype.hasOwnProperty.call(rarityColors,quality);return {quality:recognized?quality:"",color:recognized?rarityColors[quality]:"#88939b"};}
function valid(n){return n&&(!n.IsValid||n.IsValid());}
function p(id){return valid(root)?root.FindChildTraverse(id):null;}
function make(type,parent,id,cls){var n=$.CreatePanel(type,parent,id||"");if(cls)n.AddClass(cls);if(id)nodes[id]=n;return n;}
function style(n,values){Object.keys(values).forEach(function(k){if(n.style[k]!==values[k])n.style[k]=values[k];});}
function rect(n,x,y,w,h){style(n,{position:x+"px "+y+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});}
function skin(n,key){var a=P.assets&&P.assets[key];if(a)style(n,{backgroundImage:'url("'+a.file+'")',backgroundColor:"transparent",backgroundSize:"100% 100%",backgroundRepeat:"no-repeat"});}
function art(parent,key,x,y,w,h,id){var n=make("Panel",parent,id,"CollectionGW2Art");rect(n,x,y,w,h);n.hittest=false;n.hittestchildren=false;skin(n,key);return n;}
function label(parent,text,x,y,w,h,font,color,id){var n=make("Label",parent,id,"CollectionGW2Text");rect(n,x,y,w,h);n.text=String(text===undefined?"":text);n.hittest=false;style(n,{fontSize:font+"px",color:color||"#dfdfd6",fontFamily:'"Source Han Sans SC"',whiteSpace:"nowrap",textOverflow:"ellipsis"});return n;}
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
var shell=U.ModalShell.Adopt({id:"collection",panel:win,root:root,scrim:scrim,width:size[0],height:size[1],fit:{reference:fitReference.slice()},onClose:close});
style(scrim,{backgroundColor:"#00000022"});
// ModalShell establishes input/layer ownership and writes its generic fallback.
// The opaque surface also covers the source texture's partially transparent pixels.
style(win,{width:size[0]+"px",height:size[1]+"px",horizontalAlign:"center",verticalAlign:"center",flowChildren:"none",backgroundColor:"#171e24",backgroundImage:"none",border:"0px",boxShadow:"none",padding:"0px",margin:"0px",overflow:"noclip",transformOrigin:"50% 50%"});
canvas=make("Panel",win,"CollectionGW2Canvas","CollectionGW2Canvas");rect(canvas,0,0,size[0],size[1]);canvas.hittest=false;canvas.hittestchildren=true;

var background=art(canvas,"window_background",0,0,size[0],size[1],"CollectionGW2Background");style(background,{opacity:"1",backgroundColor:"#171e24"});
// Flat regional tints sit over the opaque texture without raised plates.
var header=make("Panel",canvas,"CollectionGW2Header","CollectionGW2FlatRegion");rect(header,0,0,size[0],34);style(header,{backgroundImage:"none",backgroundColor:"#080c10d8",border:"0px"});header.hittest=false;
var sidebar=make("Panel",canvas,"CollectionGW2Sidebar","CollectionGW2FlatRegion");rect(sidebar,0,34,42,size[1]-82);style(sidebar,{backgroundImage:"none",backgroundColor:"#080c10d8",border:"0px"});sidebar.hittest=false;
var footer=make("Panel",canvas,"CollectionGW2Footer","CollectionGW2FlatRegion");rect(footer,0,size[1]-48,size[0],48);style(footer,{backgroundImage:"none",backgroundColor:"#090b0d80",border:"0px"});footer.hittest=false;
label(canvas,"收藏",12,4,size[0]-72,26,18,"#f0eee2","CollectionGW2Title");
var closeButton=make("Button",canvas,"CollectionGW2Close","CollectionGW2Button");rect(closeButton,size[0]-40,3,28,28);style(closeButton,{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});
var closeIcon=make("Image",closeButton,"CollectionGW2CloseIcon");rect(closeIcon,4,4,20,20);closeIcon.SetImage(P.assets&&P.assets.close?P.assets.close.file:"file://{images}/custom_game/collection_gw2_v2/close.png");closeIcon.hittest=false;closeIcon.hittestchildren=false;
closeButton.hittestchildren=false;closeButton.SetPanelEvent("onactivate",function(){if(alive())shell.RequestClose("button");});
scrim.SetPanelEvent("onactivate",function(){if(alive())shell.RequestClose("scrim");});
Object.keys(names).forEach(function(id,i){
 var tab=make("Button",canvas,"CollectionGW2Tab_"+id,"CollectionGW2Tab");rect(tab,4,44+i*44,34,34);style(tab,{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});tab.hittestchildren=false;
 var selectedArt=make("Panel",tab,"","CollectionGW2TabSelected");rect(selectedArt,2,2,30,30);style(selectedArt,{backgroundImage:"none",backgroundColor:"transparent",border:"1px solid #afc4c54a"});selectedArt.hittest=false;
 var icon=art(tab,"tab_"+id,3.5,3.5,27,27);style(icon,{saturation:"0.5",brightness:"0.8",opacity:"0.76"});
 tab.SetPanelEvent("onactivate",function(){if(alive())select(id);});
 tab.SetPanelEvent("onmouseover",function(){if(alive()&&opened)$.DispatchEvent("DOTAShowTextTooltip",tab,names[id]);});tab.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip");});tabs[id]=tab;
});
label(canvas,"",54,36,220,24,16,"#dfdfd5","CollectionGW2Category");
var searchBacking=make("Panel",canvas,"CollectionGW2SearchBacking","CollectionGW2FlatRegion");rect(searchBacking,54,64,gridWidth,26);style(searchBacking,{backgroundImage:"none",backgroundColor:"#0a10122e",border:"1px solid #a2aaa32b"});searchBacking.hittest=false;
search=make("TextEntry",canvas,"CollectionGW2Search","CollectionGW2Search");rect(search,62,67,gridWidth-16,20);style(search,{fontSize:"14px"});search.SetAttributeString&&search.SetAttributeString("placeholder","搜索收藏");
var searchHint=label(canvas,"搜索收藏",63,67,gridWidth-17,20,14,"#a9b0ac","CollectionGW2SearchHint");
search.SetPanelEvent("ontextentrychange",function(){if(!alive())return;query=String(search.text||"").trim();searchHint.visible=!String(search.text||"").length;grid.ScrollToTop();hideTooltip();render();});
grid=make("Panel",canvas,"CollectionGW2Grid","CollectionGW2Grid");rect(grid,54,98,gridWidth,gridHeight);
gridBody=make("Panel",grid,"CollectionGW2GridBody","CollectionGW2GridBody");rect(gridBody,0,0,gridWidth,gridHeight);
empty=label(canvas,"",54,236,gridWidth,54,19,"#c4c7c6","CollectionGW2Empty");style(empty,{whiteSpace:"normal",textAlign:"center"});empty.visible=false;
summary=label(canvas,"",282,36,size[0]-294,24,14,"#c0c6be","CollectionGW2Summary");
tickets=label(canvas,"",54,size[1]-44,size[0]-218,20,14,"#cad1cb","CollectionGW2Tickets");
result=label(canvas,"",54,size[1]-22,size[0]-218,18,13,"#bdbdaf","CollectionGW2Result");
draw=make("Button",canvas,"CollectionGW2Draw","CollectionGW2Button CollectionGW2Draw");rect(draw,size[0]-144,size[1]-38,132,28);skin(draw,"draw_button");style(draw,{backgroundColor:"#63665a30",border:"1px solid #a7a99970",boxShadow:"none"});draw.hittestchildren=false;
var drawHover=art(draw,"draw_button_hover",0,0,132,28);style(drawHover,{border:"0px"});drawHover.AddClass("CollectionGW2Hover");
drawText=label(draw,"抽取",0,0,132,28,16,"#e6e3ce","CollectionGW2DrawText");style(drawText,{width:"100%",height:"fit-children",horizontalAlign:"center",verticalAlign:"center",textAlign:"center"});
draw.SetPanelEvent("onactivate",drawOne);
tooltip=cfg.SurvivalArchiveTooltip.Create({parent:canvas,root:root,idPrefix:"CollectionGW2Tooltip",compact:true,collectionRarity:true,isAlive:alive,isActive:function(){return opened;},
 getScale:function(){scale=Number(U.Fit(win,root,size[0],size[1],{reference:fitReference.slice()}))||1;return scale;},
 getBounds:function(){return {width:size[0],height:size[1]};},categoryName:function(id){return names[id]||id;},maxHeight:size[1]-72,watchAnchor:true,
 position:function(info){var x=info.anchor.x+slotSize+8;if(x+info.width>info.bounds.width-8)x=info.anchor.x-info.width-8;return {x:Math.max(8,Math.min(info.bounds.width-info.width-8,x)),y:Math.max(48,Math.min(info.bounds.height-info.height-8,info.anchor.y))};}
});
tipPanel=tooltip.panel;tipPanel.AddClass("CollectionGW2Tooltip");
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
 var signature=JSON.stringify([current,query,rows]);if(signature===cardsKey)return;cardsKey=signature;hideTooltip();gridBody.RemoveAndDeleteChildren();slots=[];
 visibleRows=rows.filter(function(item){return !query||String(item.name||"").toLowerCase().indexOf(query.toLowerCase())>=0;});
 var count=visibleRows.length,rowCount=Math.ceil(count/columns);rect(grid,54,98,gridWidth+(rowCount>rowsPerPage?8:0),gridHeight);rect(gridBody,0,0,gridWidth,Math.max(gridHeight,rowCount?(rowCount-1)*pitch+slotSize:0));
 for(var i=0;i<count;i++){
  var item=visibleRows[i],grade=rarity(item),card=make("Button",gridBody,"CollectionGW2Item_"+item.id,"CollectionGW2Slot");rect(card,(i%columns)*pitch,Math.floor(i/columns)*pitch,slotSize,slotSize);style(card,{backgroundImage:"none",border:"0px",backgroundColor:"transparent",boxShadow:"none"});card.hittest=true;card.hittestchildren=false;card.__collectionItem=item;
  if(grade.quality)card.AddClass("CollectionGW2Quality"+grade.quality);
  var backing=art(card,"slot_background",0,0,slotSize,slotSize);style(backing,{opacity:"0.45"});
  rewardIcon(card,item);card.SetHasClass("CollectionGW2Unowned",countKnown(item)&&Number(item.count)===0);card.SetHasClass("CollectionGW2Unknown",!countKnown(item));
  card.SetHasClass("CollectionGW2Unavailable",Number(item.draw_enabled)===0);
  var frame=make("Panel",card,"","CollectionGW2SlotFrame");rect(frame,0,0,slotSize,slotSize);style(frame,{backgroundImage:"none",backgroundColor:"transparent",border:"2px solid "+grade.color});frame.hittest=false;frame.hittestchildren=false;
  var hover=make("Panel",card,"","CollectionGW2Hover");rect(hover,3,3,slotSize-6,slotSize-6);style(hover,{backgroundImage:"none",backgroundColor:"transparent",border:"1px solid "+grade.color});hover.hittest=false;hover.hittestchildren=false;
  if(grade.quality){var gradeWidth=grade.quality.length===3?30:grade.quality.length===2?24:17,gradeLabel=label(card,grade.quality,slotSize-gradeWidth-3,3,gradeWidth,16,11,grade.color);gradeLabel.AddClass("CollectionGW2RarityLabel");style(gradeLabel,{textAlign:"center",fontWeight:"bold",backgroundColor:"#111820db"});}
  var quantity=label(card,countKnown(item)?number(item.count):"—",4,slotSize-19,slotSize-8,18,12,"#f0eee0");quantity.AddClass("CollectionGW2CardLabel");style(quantity,{textAlign:"right",textShadow:"#000000 0px 1px 2px 2.0"});bindCard(card,item);
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
 Object.keys(tabs).forEach(function(id){tabs[id].SetHasClass("CollectionGW2Selected",id===current);});nodes.CollectionGW2Category.text=names[current];
 renderCards(rows);empty.visible=!data||!visibleRows.length;
 empty.text=!data?"正在读取收藏…":query?"没有找到匹配的收藏":"暂无收藏";
 summary.text=data?"已收藏 "+rows.filter(function(item){return countKnown(item)&&Number(item.count)>0;}).length+" / "+rows.length+" 种"+(s?" · 共 "+number(s.total)+" 件":"")+(query?" · 找到 "+visibleRows.length+" 项":""):"等待服务端同步";
 tickets.text=s?String(s.currency_name||"抽取券")+"："+number(s.tickets)+"  ·  每次消耗 "+number(s.draw_cost)+(current==="wife"?" 朵":" 张"):"正在读取抽取资格…";
 draw.enabled=!!canDraw();draw.SetHasClass("CollectionGW2Disabled",!draw.enabled);drawText.text=shared.pending?"结算中…":s&&Number(s.remaining)===0?"已全部集满":"抽取";
 var outcome=shared.outcome&&shared.outcome.pool_id===current?shared.outcome:null;
 result.text=shared.pending?"奖励正在结算，请稍候…":outcome&&!outcome.ok?outcome.error||"抽取未完成，请稍后重试":outcome&&outcome.ok?"":s?"重复获得叠加效果 · 按品质概率抽取":"";
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
 // cannot be identified or is excluded by the current search.
 if(acquired.length===1)highlightReward(acquired[0].id);
}
function drawOne(){
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
function select(id){if(!alive()||!names[id])return;clearRewardHighlight();current=id;query="";search.text="";searchHint.visible=true;grid.ScrollToTop();hideTooltip();render();if(opened&&!shared.pages[id])request(true);}
function open(id){if(!alive())return;var wasOpen=opened;if(id&&names[id]&&id!==current){clearRewardHighlight();current=id;query="";search.text="";searchHint.visible=true;grid.ScrollToTop();}if(cfg.SurvivalArchive&&cfg.SurvivalArchive.IsOpen&&cfg.SurvivalArchive.IsOpen())cfg.SurvivalArchive.Close();opened=true;win.RemoveClass("ArchiveHidden");scrim.RemoveClass("ArchiveHidden");shell.Open();scale=Number(U.Fit(win,root,size[0],size[1],{reference:fitReference.slice()}))||1;render();request(!shared.pages[current]||Object.keys(resync).length>0);if(!wasOpen)recoverIntent();}
function close(){if(!active)return;opened=false;clearRewardHighlight();hideTooltip();viewLife.Cancel();if(valid(win)){shell.Close();win.AddClass("ArchiveHidden");}if(valid(scrim))scrim.AddClass("ArchiveHidden");$.DispatchEvent("DOTAHideTextTooltip");}
function dispose(){if(!active)return;close();active=false;highlightLife.Dispose();life.Dispose();viewLife.Dispose();shell.Dispose();if(tooltip)tooltip.Dispose();if(valid(canvas))canvas.DeleteAsync(0);createdRoots.forEach(function(n){if(valid(n))n.DeleteAsync(0);});if(valid(win))win.RemoveClass("CollectionGW2Page");}
api=cfg.SurvivalCollection={Open:open,Close:close,Toggle:function(){if(alive()){if(opened)close();else open();}},Select:select,IsOpen:function(){return alive()&&opened;},Dispose:dispose,Inspect:function(){return {open:opened,layout:"collection_gw2",canvas:size.slice(),columns:columns,portraitSize:portraitSize,category:current,search:query,rows:visibleRows.map(function(item){return {id:item.id,name:item.name,count:item.count,target:item.target};}),slots:slots.length,drawEnabled:!!draw.enabled,pending:shared.pending?copy(shared.pending):null,versions:copy(shared.versions),tooltipVisible:tooltip&&tooltip.IsVisible()};}};
life.Subscribe("survival_archive_snapshot",snapshot);life.Subscribe("survival_archive_social_result",drawResult);
win.AddClass("ArchiveHidden");scrim.AddClass("ArchiveHidden");shell.Close();
})();
