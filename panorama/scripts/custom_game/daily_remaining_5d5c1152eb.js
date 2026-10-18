(function(){
"use strict";
// Independent login calendar. All rewards and eligibility come from the existing
// authoritative daily snapshot; the shell never grants or unlocks an entitlement.
var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,RH=cfg.RemainingHandoff,P=cfg.DailyGW2Data||{},size=P.canvas||[1382,784];
var layout=P.layout||{cellWidth:118,cellHeight:119,cellPadding:5,columns:[62,207,355,505,652,802,952],rows:[152,293,437,582],monthlyX:1175};
var cellWidth=layout.cellWidth,cellHeight=layout.cellHeight,cellPadding=layout.cellPadding,columns=layout.columns,rows=layout.rows;
var iconInset=2; // Fill the frame interior; retain only its visible border.
var gridWidth=columns[6]-columns[0]+cellWidth,gridHeight=rows[3]-rows[0]+cellHeight;
var fitOptions={widthFraction:.94,heightFraction:.9};
var data=null,waiting=null,errorText="",buying=false,sequence=0,active=true,life=U.Lifecycle(),viewLife=U.Lifecycle(),fetching=false,fetchSerial=0;
var dailyRoot=$.GetContextPanel(),view=null,shell=null,canvas=null,dailyTooltip=null,moved=[];
var cardSignature="",specialSignature="",statusText="",scale=1;
var rewardFX=null;
var columnLabels=["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ"];
function valid(node){return node&&(!node.IsValid||node.IsValid());}
function p(id){return valid(dailyRoot)?dailyRoot.FindChildTraverse(id):null;}
function viewValid(){return valid(p("DailyWindow"));}
if(!viewValid()){active=false;return;}
if(cfg.SurvivalDaily&&cfg.SurvivalDaily.Dispose)cfg.SurvivalDaily.Dispose();
function stopIfInvalid(){if(!active)return true;if(viewValid())return false;active=false;if(rewardFX)rewardFX.Dispose();if(dailyTooltip)dailyTooltip.Dispose();life.Dispose();viewLife.Dispose();if(view)view.Dispose();return true;}
function array(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
function style(node,values){Object.keys(values).forEach(function(key){if(node.style[key]!==values[key])node.style[key]=values[key];});}
function rect(node,x,y,w,h){style(node,{position:x+"px "+y+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});}
function make(type,parent,id,cls){var node=$.CreatePanel(type,parent,id||"");if(cls)node.AddClass(cls);return node;}
function fillIcon(icon,item){
 var shared=cfg.SurvivalRewardPresentation||cfg.SurvivalItemResources;if(shared&&shared.FillIcon)shared.FillIcon(icon,item);
 // The calendar crops to its slot even when the shared catalog prefers contain.
 if(icon&&icon.SetScaling){icon.SetScaling("stretch-to-cover-preserve-aspect");icon.__survivalItemFill="cover";}return icon;
}
function skin(node,key){var asset=P.assets&&P.assets[key];if(asset)style(node,{backgroundImage:'url("'+asset.file+'")',backgroundColor:"transparent",backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",border:"0px"});}
function component(parent,key,x,y,w,h,id){var node=make("Panel",parent,id,"DailyGW2Art");rect(node,x,y,w,h);node.hittest=false;node.hittestchildren=false;skin(node,key);return node;}
function celebrationArt(parent,id,file,x,y,w,h,appearance){
 var node=component(parent,null,x,y,w,h,id);node.AddClass("DailyGW2Celebration");
 style(node,{backgroundImage:'url("s2r://panorama/images/'+file+'.vtex")',backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat"});
 if(appearance)style(node,appearance);return node;
}
function buildCelebration(){
 // A fantasy title vignette, using native transparent art above the reward grid.
 var header=component(canvas,null,0,0,size[0],104,"DailyGW2CelebrationHeader");style(header,{overflow:"clip"});
 celebrationArt(header,"DailyGW2CelebrationRibbon","events/international_2026/artwork/gold_ribbon_png",155,-96,1072,246,{opacity:".34",brightness:"1.25"});
 [{side:"Left",x:456},{side:"Right",x:848}].forEach(function(mark){
  celebrationArt(header,"DailyGW2CelebrationStars"+mark.side,"events/dark_carnival/overworld/gift_icon_star_orbit_png",mark.x,4,78,78,{opacity:".84",brightness:"1.6"});
  celebrationArt(header,"DailyGW2CelebrationGift"+mark.side,"received_gift_png",mark.x+10,16,60,59,{brightness:"1.04"});
 });
 [{side:"Left",x:0},{side:"Right",x:size[0]-112}].forEach(function(corner){
  var top=celebrationArt(canvas,"DailyGW2CelebrationTop"+corner.side,"hud/international_topcorner_png",corner.x,0,112,53,{opacity:".9",brightness:"1.25",washColor:"#e2c68e"});
  var bottom=celebrationArt(canvas,"DailyGW2CelebrationBottom"+corner.side,"hud/international_btmcorner_psd",corner.side==="Left"?0:size[0]-44,size[1]-57,44,57,{opacity:".9",brightness:"1.25",washColor:"#e2c68e"});
  if(corner.side==="Right"){style(top,{transform:"scaleX(-1)"});style(bottom,{transform:"scaleX(-1)"});}
 });
}
function label(parent,text,x,y,w,h,font,color,id){var node=make("Label",parent,id,"DailyGW2Text");node.text=String(text===undefined?"":text);node.hittest=false;rect(node,x,y,w,h);style(node,{fontSize:font+"px",color:color||"#f0efeb",fontFamily:'"Source Han Sans SC"',whiteSpace:"nowrap",textOverflow:"ellipsis"});return node;}
function move(id,parent){var node=p(id);if(!valid(node))return null;moved.push({node:node,parent:node.GetParent()});node.SetParent(parent);node.style.visibility="visible";return node;}
function escapedLines(value){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
function effectLines(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/[；;][ \t]*/g,"\n");}
function hideTooltip(){if(dailyTooltip)dailyTooltip.Hide();if(valid(p("DailyTooltip")))p("DailyTooltip").AddClass("ArchiveHidden");}
function tip(anchor,title,body){
 if(/^DailyGW2Weekday_[0-6]$/.test(anchor.id||"")){anchor.hittest=false;return;}
 body=effectLines(body);
 anchor.__dailyGW2Tooltip={title:String(title||"奖励说明"),body:String(body||"奖励说明待同步")};
 anchor.hittest=true;anchor.SetPanelEvent("onmouseover",function(){
  if(!active||!viewValid()||!shell.IsOpen()||!p("DailyRulesText").BHasClass("ArchiveHidden")){hideTooltip();return;}
  if(dailyTooltip.Show({name:String(title||"奖励说明"),description:String(body||"奖励说明待同步")},"daily",anchor,true)){
   p("DailyTooltipName").text=String(title||"奖励说明");p("DailyTooltipEffect").text=String(body||"奖励说明待同步");
  }
 });anchor.SetPanelEvent("onmouseout",function(){if(dailyTooltip)dailyTooltip.QueueHide();});
}
function close(){
 if(rewardFX)rewardFX.Clear();if(waiting)waiting.present=false;
 if(!active)return;hideTooltip();viewLife.Cancel();fetching=false;fetchSerial++;if(view)view.Close();
 if(valid(p("DailyWindow")))p("DailyWindow").AddClass("ArchiveHidden");if(valid(p("DailyScrim")))p("DailyScrim").AddClass("ArchiveHidden");
 if(valid(p("DailyRulesText"))){p("DailyRulesText").AddClass("ArchiveHidden");p("DailyRulesText").visible=false;}$.DispatchEvent("DOTAHideTextTooltip");
}
function fitWindow(value){
 var nextScale=Math.min(1,Number(value)||1),changed=Math.abs(scale-nextScale)>.0001;scale=nextScale;
 if(valid(p("DailyWindow")))p("DailyWindow").style.transform="scale3d("+scale+","+scale+",1)";
 if(changed)hideTooltip();
}
function build(){
 var win=p("DailyWindow");win.AddClass("DailyGW2Page");win.RemoveClass("DailyV10Page");win.RemoveClass("DailyPurple");
 shell=U.ModalShell.Adopt({id:"daily_rewards",panel:win,root:dailyRoot,scrim:p("DailyScrim"),width:size[0],height:size[1],fit:fitOptions,onClose:close,onFit:fitWindow});
 style(win,{width:size[0]+"px",height:size[1]+"px",flowChildren:"none",padding:"0px",margin:"0px",backgroundImage:"none",backgroundColor:"#101925",border:"0px",boxShadow:"none",overflow:"noclip"});
 canvas=make("Panel",win,"DailyGW2Canvas","DailyGW2Canvas");rect(canvas,0,0,size[0],size[1]);canvas.hittest=false;canvas.hittestchildren=true;
 // Native DPC panel gradient, composed over an opaque blue base.
 var backdrop=component(canvas,null,0,0,size[0],size[1],"DailyGW2Background");style(backdrop,{backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,100% 100%,from(#141c23),to(#1d2a35cc))"});
 buildCelebration();
 var edge=component(canvas,null,0,0,size[0],size[1],"DailyGW2WindowEdge");style(edge,{backgroundImage:"none",backgroundColor:"transparent",borderTop:"1px solid #3b404777",borderLeft:"1px solid #4c434677",borderRight:"1px solid #00000088",borderBottom:"1px solid #00000088"});
 component(canvas,"header_rule",44,82,1321,5,"DailyGW2HeaderRule");
 // Foreground crest paints over both the ribbon and the header divider.
 celebrationArt(canvas,"DailyGW2CelebrationTitleOrnament","fantasy_craft/player_card_ornament_png",592,68,198,20,{opacity:"1",brightness:"1.15"});
 var heading=label(canvas,"每日登录奖励",190,17,size[0]-380,58,40,"#f4f0e5","DailyGW2Title");style(heading,{textAlign:"center",fontWeight:"normal"});
 var closeButton=make("Button",canvas,"DailyGW2Close","DailyGW2CloseButton");rect(closeButton,1319,20,44,47);
 component(closeButton,"close_base",0,0,44,47);component(closeButton,"close",10,10,24,27);
 if(!(P.assets&&P.assets.close))label(closeButton,"×",0,1,44,44,36,"#171410");
 closeButton.hittestchildren=false;
 closeButton.SetPanelEvent("onactivate",function(){if(active&&valid(closeButton)){if(shell.RequestClose)shell.RequestClose("button");else close();}});
 component(canvas,"divider",1113,112,7,665,"DailyGW2Divider");
 columnLabels.forEach(function(name,i){var header=label(canvas,name,columns[i],108,cellWidth,36,27,"#efece3","DailyGW2Weekday_"+i);style(header,{textAlign:"center"});});
 var monthHeader=label(canvas,"月卡奖励",layout.monthlyX-20,108,cellWidth+40,36,27,"#efece3","DailyGW2MonthHeader");style(monthHeader,{textAlign:"center"});
 ["DailyFrame","DailyHeader","DailyClaimPage","DailyPassPage","DailyRuleLine","DailyBack","DailyTooltip"].forEach(function(id){p(id).visible=false;});
 ["DailyCards","DailySubtitle","DailyCount","DailyPassStatus","DailySpecials","PassValidity","PassPrice","PassPurchase","DailyRules","DailyMakeup","DailyClaim","DailyNotice","DailyRulesText"].forEach(function(id){move(id,canvas);});
 rect(p("DailySubtitle"),0,0,0,0);p("DailySubtitle").text="";p("DailySubtitle").visible=false;p("DailySubtitle").style.visibility="collapse";
 rect(p("DailyCount"),0,0,0,0);p("DailyCount").visible=false;
 rect(p("DailyCards"),columns[0],rows[0],gridWidth,gridHeight);style(p("DailyCards"),{flowChildren:"none",overflow:"clip"});
 rect(p("DailyPassStatus"),0,0,0,0);style(p("DailyPassStatus"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});p("DailyPassStatus").hittestchildren=false;p("DailyPassStatus").visible=false;
 rect(p("DailyPassStatusText"),0,0,233,32);style(p("DailyPassStatusText"),{fontSize:"22px",color:"#a9d7ed",textAlign:"center",margin:"0px",marginLeft:"0px"});
 rect(p("DailySpecials"),layout.monthlyX,rows[0],cellWidth,gridHeight);style(p("DailySpecials"),{flowChildren:"none",overflow:"clip"});
 var passInfo=make("Panel",canvas,"DailyGW2PassInfo","DailyGW2Art");rect(passInfo,0,0,0,0);passInfo.visible=false;passInfo.hittest=false;
 rect(p("PassValidity"),0,0,0,0);p("PassValidity").visible=false;
 rect(p("PassPrice"),0,0,0,0);p("PassPrice").visible=false;
 rect(p("PassPurchase"),1141,709,194,61);rect(p("DailyRules"),729,720,76,44);rect(p("DailyMakeup"),327,720,160,44);rect(p("DailyClaim"),511,720,194,44);
 p("DailyRules").Children().forEach(function(node){if(node.paneltype==="Label")node.text="规则";});
 rect(p("DailyNotice"),columns[0],765,gridWidth,18);style(p("DailyNotice"),{fontSize:"16px",color:"#eed6a8",textAlign:"center",marginTop:"0px",whiteSpace:"nowrap",textOverflow:"ellipsis"});
 var rulesWidth=620,rulesHeight=Math.min(570,size[1]-80),rules=p("DailyRulesText");rect(rules,(size[0]-rulesWidth)/2,(size[1]-rulesHeight)/2,rulesWidth,rulesHeight);style(rules,{flowChildren:"down",overflow:"squish scroll",backgroundColor:"#181610fc",backgroundImage:"none",border:"1px solid #a7926b",padding:"24px",zIndex:"120"});rules.hittest=true;rules.hittestchildren=true;rules.AddClass("ArchiveHidden");rules.visible=false;
 style(p("DailyRulesBody"),{width:(rulesWidth-60)+"px",height:"fit-children",fontSize:"20px",color:"#eee6d2",whiteSpace:"normal",textOverflow:"clip",lineHeight:"28px"});p("DailyRulesBody").html=true;
 // Reuse the archive renderer, materials and hover lifecycle for every daily reward.
 dailyTooltip=cfg.SurvivalArchiveTooltip.Create({parent:canvas,root:dailyRoot,idPrefix:"DailyGW2Tooltip",
  getBounds:function(){return size;},getScale:function(){return scale;},maxHeight:function(bounds){return Math.min(570,bounds.height-40);},watchAnchor:true,
  isAlive:function(){return active&&viewValid();},isActive:function(){return shell.IsOpen()&&p("DailyRulesText").BHasClass("ArchiveHidden");},
  position:function(info){var x=info.anchor.x+cellWidth+12-info.padding;if(x+info.width>info.bounds.width)x=info.anchor.x-info.surfaceWidth-12-info.padding;return {x:Math.max(0,Math.min(info.bounds.width-info.width,x)),y:Math.max(0,Math.min(info.bounds.height-info.height,info.anchor.y-info.padding))};}
 });
 view=cfg.SurvivalDailyGW2={canvas:canvas,shell:shell,Open:function(){shell.Open();canvas.visible=true;fitWindow(U.Fit(win,dailyRoot,size[0],size[1],fitOptions));},Close:function(){shell.Close();if(valid(canvas))canvas.visible=false;},IsOpen:function(){return shell.IsOpen();},Dispose:function(){dailyTooltip.Dispose();shell.Dispose();moved.forEach(function(e){if(valid(e.node)&&valid(e.parent))e.node.SetParent(e.parent);});moved=[];if(valid(canvas))canvas.DeleteAsync(0);if(valid(win))win.RemoveClass("DailyGW2Page");}};
}
build();
if(U.RewardFX)rewardFX=U.RewardFX.Create(canvas,{channel:"daily",getScale:function(){return scale;}});
p("DailyClose").SetPanelEvent("onactivate",function(){if(active)close();});
U.State.Bind(p("DailyRules"),function(){if(!active||!viewValid())return;hideTooltip();var rules=p("DailyRulesText");rules.ToggleClass("ArchiveHidden");rules.visible=!rules.BHasClass("ArchiveHidden");});
U.State.Bind(p("DailyPassStatus"),function(){if(!active||!viewValid())return;buying=true;p("DailyGW2PassInfo").AddClass("DailyGW2PassFocus");});
U.ActionButton.Adopt(p("DailyClaim"),{action:function(){if(!active)return;if(!data){request();return;}claim(data.today);}});
U.ActionButton.Adopt(p("DailyMakeup"),{action:function(){if(active)claim(array(data&&data.missed)[0]);}});
U.ActionButton.Adopt(p("PassPurchase"),{action:function(){if(!active||!data||Number(data.purchase_enabled)!==1||waiting||Number(data.pending)===1)return;U.State.Set(p("PassPurchase"),{enabled:false});GameEvents.SendCustomGameEventToServer("survival_pass_purchase",{});}});
function setStatus(text){statusText=String(text||"");if(valid(p("DailyNotice")))p("DailyNotice").text=statusText;}
function paintActions(){
 ["DailyClaim","DailyMakeup","PassPurchase","DailyRules"].forEach(function(id){
  var button=p(id),disabled=button.enabled===false;button.AddClass("DailyGW2Button");skin(button,"button");style(button,{opacity:disabled?".48":"1",backgroundColor:P.assets&&P.assets.button?"transparent":"#24292c",border:"0px",flowChildren:"none"});
  button.hittestchildren=false;button.Children().forEach(function(node){if(node.BHasClass&&node.BHasClass("DailyGW2HoverArt")){node.visible=false;return;}if(node.paneltype==="Label"){rect(node,0,0,parseFloat(button.style.width),parseFloat(button.style.height));style(node,{fontSize:id==="PassPurchase"?"27px":"21px",color:P.assets&&P.assets.button?(disabled?"#625c50":"#201b14"):(disabled?"#999b98":"#efe7d3"),textShadow:"none",textAlign:"center",verticalAlign:"center",marginTop:"0px",marginLeft:"0px",paddingTop:"0px",whiteSpace:"nowrap",textOverflow:"shrink"});style(node,{width:"fit-children",height:"fit-children",horizontalAlign:"center"});}});
 });
}
function request(){
 if(stopIfInvalid()||fetching)return;fetching=true;var serial=++fetchSerial;if(!data){errorText="";render();}
 GameEvents.SendCustomGameEventToServer("survival_daily_request",{});
 if(shell.IsOpen())viewLife.Later(8,function(){if(!active||serial!==fetchSerial||!fetching)return;fetching=false;if(!data){errorText="读取奖励超时，请重试";render();}});else fetching=false;
}
function artId(item){return item.art_id&&RH.DailyResourceInfo(item.art_id).runtime?item.art_id:"daily.item.crystals";}
function rewardQuantity(item){var value=item&&item.count;return value!==undefined&&value!==null&&String(value).trim()!==""&&isFinite(Number(value))&&Number(value)>=0?value:null;}
function quantity(parent,value,w,h,inset,x,y){
 var width=Math.min(68,w),host=make("Panel",parent,"","DailyGW2QuantityHost");rect(host,(x||0)+w-width-inset,(y||0)+h-39,width,36);host.hittest=false;host.hittestchildren=false;
 // Native Label text alignment does not reliably move a single-line glyph.
 // Anchor its intrinsic box to the right of a separate, fixed-size host.
 var count=label(host,String(value),0,0,width,36,32,"#f5f1e6");count.AddClass("DailyGW2Quantity");style(count,{width:"fit-children",maxWidth:width+"px",height:"fit-children",horizontalAlign:"right",verticalAlign:"bottom",textAlign:"right",textOverflow:"shrink",textShadow:"#000000 0px 1px 2px 3.0"});return count;
}
function mark(parent,key){var node=component(parent,key,cellWidth-cellPadding-33,cellPadding,33,key==="lock"?38:29);node.AddClass(key==="lock"?"DailyGW2Lock":"DailyGW2Check");return node;}
function reward(parent,item,x,y,w,h,cls,hideQuantity){
 var slot=make("Panel",parent,"",cls||"DailyGW2Reward");rect(slot,x,y,w,h);slot.hittest=true;slot.hittestchildren=false;
 var art=(cfg.SurvivalItemArt&&cfg.SurvivalItemArt.Create(slot,item,"DailyGW2ItemArt"))||RH.DailyImage(slot,artId(item),"DailyGW2ItemArt");rect(art,0,0,w,h);art.hittest=false;fillIcon(art,item);
 var known=rewardQuantity(item)!==null;
 if(known&&!hideQuantity)quantity(parent,item.count,w,h+cellPadding,0,x,y);
 tip(slot,item.name,(item.description||"奖励说明待同步")+(known?"\n数量："+item.count:""));return slot;
}
function stateText(status){return {claimed:"已领取",claimable:"今日可领",not_open:"尚未开放",requires_pass:"开通月卡后解锁",unconfigured:"暂无奖励配置"}[status]||"等待同步";}
function calendar(){return data?array(data.calendar28||data.calendar||data.cycle):[];}
function renderCards(){
 var days=calendar(),signature=JSON.stringify([days,data&&data.calendar_start_count]);if(signature===cardSignature&&p("DailyCards").GetChildCount()===(days.length||28))return;
 cardSignature=signature;hideTooltip();p("DailyCards").RemoveAndDeleteChildren();
 var shown=days.length?days:Array.apply(null,new Array(28)).map(function(_,i){return {day:i+1,rewards:[],status:"loading"};});
 shown.slice(0,28).forEach(function(day,i){
  var card=make("Panel",p("DailyCards"),"DailyGW2Day_"+(i+1),"DailyGW2Day");rect(card,columns[i%7]-columns[0],rows[Math.floor(i/7)]-rows[0],cellWidth,cellHeight);card.hittest=true;card.hittestchildren=true;
  var status=day.status||"not_open",today=Number(day.is_today)===1;card.SetHasClass("DailyGW2Today",today);card.SetHasClass("DailyGW2Claimed",status==="claimed");card.SetHasClass("DailyGW2Future",status==="not_open");
  var frame=component(card,"reward_frame",0,0,cellWidth,cellHeight);frame.AddClass("DailyGW2RewardFrame");
  var items=array(day.rewards),gap=0,width=items.length>1?(cellWidth-iconInset*2-gap)/2:cellWidth-iconInset*2,sharedQuantity=items.length>1?rewardQuantity(items[0]):null;
  if(sharedQuantity!==null&&!items.every(function(item){return rewardQuantity(item)!==null&&Number(item.count)===Number(sharedQuantity);}))sharedQuantity=null;
  items.slice(0,2).forEach(function(item,j){reward(card,item,iconInset+j*(width+gap),iconInset,width,cellHeight-iconInset*2,undefined,sharedQuantity!==null);});
  if(sharedQuantity!==null)quantity(card,sharedQuantity,cellWidth,cellHeight,cellPadding);
  if(status==="claimed")mark(card,"check");
  var summary=items.map(function(item){return item.name+(item.count!==undefined?" ×"+item.count:"")+"\n"+(item.description||"");}).join("\n\n");
  tip(card,columnLabels[i%7]+" · 第"+(day.day||i+1)+"天 · "+stateText(status),summary||"正在读取该日奖励");
 });
}
function renderSpecials(){
 var specials=array(data&&data.specials).filter(function(item){return item&&item.id;}).slice(0,rows.length),signature=JSON.stringify([specials,data&&data.has_pass,data&&data.count]);if(signature===specialSignature&&p("DailySpecials").GetChildCount()===specials.length)return;specialSignature=signature;hideTooltip();p("DailySpecials").RemoveAndDeleteChildren();
 specials.forEach(function(item,i){
  var card=make("Panel",p("DailySpecials"),"DailyGW2Special_"+item.id,"DailyGW2Special");rect(card,0,rows[i]-rows[0],cellWidth,cellHeight);
  var frame=component(card,"premium_frame",0,0,cellWidth,cellHeight);frame.AddClass("DailyGW2SpecialFrame");
  var owned=Number(item.owned)>0,pass=Number(data.has_pass)===1;
  card.SetHasClass("DailyGW2Locked",!pass&&!owned);card.SetHasClass("DailyGW2Owned",owned);
  var slot=reward(card,item,iconInset,iconInset,cellWidth-iconInset*2,cellHeight-iconInset*2,"DailyGW2PassReward");
  var status=owned?"已获得":!pass?"开通月卡后解锁":Number(data.count)>=Number(item.day)?"下次签到时发放":"累计签到 "+item.day+" 次";
  if(owned)mark(card,"check");else if(!pass)mark(card,"lock");
  var details=(item.description||"奖励说明待同步")+"\n领取条件：累计签到"+item.day+"次\n领取状态："+status+"\n月卡奖励随符合条件的签到自动发放。";
  tip(card,item.name,details);tip(slot,item.name,details);
 });
}
function availability(){var base=data&&data.ordinary_status==="claimable",bonus=data&&data.premium&&data.premium.status==="claimable";return {enabled:!!(base||bonus),text:base?"领取今日奖励":bonus?"领取战令奖励":data&&data.ordinary_status==="claimed"?"今日已领取":"尚未开放"};}
function render(){
 if(stopIfInvalid())return;RH=cfg.RemainingHandoff;var ready=availability(),busy=!!waiting||!!data&&Number(data.pending)===1;
 p("DailyEntry").SetHasClass("DailyCanClaim",ready.enabled);p("DailyEntry").SetHasClass("DailyClaimed",!!data&&!ready.enabled&&data.ordinary_status==="claimed");if(!shell.IsOpen())return;
 p("DailyGW2PassInfo").SetHasClass("DailyGW2PassFocus",buying);p("PassPurchase").SetHasClass("DailyGW2PassFocus",buying);p("DailyCards").visible=true;p("DailySpecials").visible=true;p("PassPurchase").visible=true;p("DailyRules").visible=true;p("DailyClaim").visible=true;
 if(!data){
  p("DailyCount").text="";p("DailyPassStatusText").text="月卡奖励";p("PassValidity").text="资格待同步";p("PassPrice").text="";p("PassPurchaseText").text="开通月卡";p("DailyClaimText").text=fetching?"加载中…":"重试";
  U.State.Set(p("DailyClaim"),{enabled:!fetching,busy:fetching});U.State.Set(p("DailyMakeup"),{enabled:false});U.State.Set(p("PassPurchase"),{enabled:false});p("DailyMakeup").visible=false;
  renderCards();renderSpecials();setStatus(errorText||"正在读取每日奖励…");p("DailyNotice").visible=true;paintActions();return;
 }
 var pass=Number(data.has_pass)===1;U.State.Set(p("DailyPassStatus"),{enabled:true});p("DailyPassStatusText").text=pass?"月卡奖励 · 已解锁":"月卡奖励";
 p("DailyCount").text="累计签到 "+data.count+" 次"+(data.calendar_current_day?" · 本轮第 "+data.calendar_current_day+" / 28 天":"");
 p("DailyClaimText").text=busy?"领取中…":errorText&&ready.enabled?"重试":ready.enabled?"领取":data.ordinary_status==="claimed"?"已领取":"尚未开放";U.State.Set(p("DailyClaim"),{enabled:ready.enabled&&!busy,busy:busy});
 U.State.Set(p("DailyMakeup"),{enabled:pass&&array(data.missed).length>0&&!busy});p("DailyMakeup").visible=pass&&array(data.missed).length>0;
 p("PassValidity").text=pass?"月卡已解锁":"开通月卡后解锁";
 var expiry=Number(data.expires_at),until=expiry>0?new Date((expiry+8*3600)*1000):null;p("PassPrice").text=(data.duration_days?data.duration_days+"天 · ":"")+(data.price||"价格待配置")+(pass?(until?" · 有效至 "+until.getUTCFullYear()+"/"+(until.getUTCMonth()+1)+"/"+until.getUTCDate():" · 权益已生效"):"");
 p("PassPurchaseText").text=(pass?"续费":"开通")+"月卡";U.State.Set(p("PassPurchase"),{enabled:Number(data.purchase_enabled)===1&&!busy});
 tip(p("PassPurchase"),"月卡",p("PassValidity").text+"\n"+p("PassPrice").text+(Number(data.purchase_enabled)===1?"":"\n开通月卡暂未开放。")+"\n月卡奖励随签到自动发放。");
 tip(p("DailyGW2MonthHeader"),"月卡奖励","月卡有效时，按累计签到次数自动发放。具体条件请悬停奖励查看。");
 tip(p("DailyClaim"),"领取登录奖励",p("DailyCount").text+"\n"+ready.text);
 p("DailyRulesBody").text=escapedLines((data.rule_text||"奖励以服务端配置为准")+"\n补签范围：最近"+(data.makeup_days||30)+"天，需有效战令。\n\n"+array(data.specials).map(function(s){return "累计"+s.day+"次："+s.name+"\n"+effectLines(s.description);}).join("\n\n"));
 renderCards();renderSpecials();paintActions();setStatus(errorText||(busy?"正在等待服务端保存，请勿重复提交。":""));p("DailyNotice").visible=!!errorText||busy;
}
function claim(target){
 if(!active||!data||waiting||Number(data.pending)===1||target===undefined)return;
 var slot=Number(data.calendar_current_day)||1,day=calendar()[slot-1],bonus=Number(target)===Number(data.today)&&data.ordinary_status==="claimed";
 waiting={target:Number(target),day:Number(data.today),period:String(data.period_id),count:Number(data.count),
  ordinary:data.ordinary_status,premium:data.premium&&data.premium.status,slot:slot,calendarStart:Number(data.calendar_start_count)||0,
  text:bonus?"月卡奖励":array(day&&day.rewards).map(function(item){return item.name;}).join("、"),present:shell.IsOpen(),bonus:bonus};
 errorText="";render();GameEvents.SendCustomGameEventToServer("survival_daily_claim",{target_day:Number(target)});
}
function confirmedClaim(next,intent){
 var result=next.claim_result,matching=result&&Number(result.target_day)===intent.target;
 if(Number(next.pending)===1||(matching&&(result.pending===true||Number(result.pending)===1)))return false;
 if(matching)return result.ok===true||Number(result.ok)===1;
 return Number(next.count)>intent.count||(intent.target===Number(next.today)&&(
  (intent.ordinary==="claimable"&&next.ordinary_status==="claimed")||
  (intent.premium==="claimable"&&next.premium&&next.premium.status==="claimed")));
}
function showClaim(intent){
 if(!rewardFX||!intent.present||!shell.IsOpen())return;
 var samePage=(Number(data.calendar_start_count)||0)===intent.calendarStart;
 rewardFX.Play({key:intent.period+":"+intent.target+":"+intent.count+":"+intent.ordinary+":"+intent.premium,
  anchor:!intent.bonus&&samePage?p("DailyGW2Day_"+intent.slot):p("DailyClaim"),title:"领取成功",text:intent.text||"奖励已领取",tone:"gold"});
}
life.Subscribe("survival_daily_snapshot",function(next){
 if(!active)return;fetching=false;fetchSerial++;if(!(next.ok===true||Number(next.ok)===1)){errorText=next.error||"正在读取档案";render();return;}
 if(Number(next.sequence)>0&&Number(next.sequence)<=sequence)return;if(data&&Number(next.today)<Number(data.today))return;sequence=Number(next.sequence)||sequence;
 var result=next.claim_result,claimed=null;if(waiting){if(Number(next.today)!==waiting.day||String(next.period_id)!==waiting.period){waiting=null;errorText="";}else if(confirmedClaim(next,waiting)){claimed=waiting;waiting=null;errorText="";}else if(result&&Number(result.target_day)===waiting.target&&Number(next.pending)!==1&&!(result.pending===true||Number(result.pending)===1)){waiting=null;errorText=result.error||"领取失败，请重试";}}
 data=next;if(!waiting&&!(result&&!(result.ok===true||Number(result.ok)===1)))errorText="";render();if(claimed)showClaim(claimed);
});
function poll(){if(stopIfInvalid()||!shell.IsOpen())return;request();viewLife.Later(3,poll);}
cfg.SurvivalDaily={Open:function(pass){
 if(!active||!viewValid())return;hideTooltip();buying=pass===true;p("DailyWindow").RemoveClass("ArchiveHidden");p("DailyScrim").RemoveClass("ArchiveHidden");view.Open();viewLife.Cancel();fetching=false;render();request();viewLife.Later(3,poll);
},Close:close,Inspect:function(){var cards=p("DailyCards");return {open:active&&viewValid()&&shell.IsOpen(),layout:"daily_gw2",canvas:size.slice(),cell:[cellWidth,cellHeight],cellPadding:cellPadding,columns:columns.slice(),rows:rows.slice(),monthlyX:layout.monthlyX,monthlySlots:valid(p("DailySpecials"))?p("DailySpecials").GetChildCount():0,pass:buying,waiting:!!waiting,fetching:fetching,today:data&&data.today,count:data&&data.count,hasPass:!!data&&Number(data.has_pass)===1,calendarDay:data&&data.calendar_current_day,days:valid(cards)?cards.GetChildCount():0,status:statusText};},
Dispose:function(){if(!active)return;close();active=false;if(rewardFX)rewardFX.Dispose();viewLife.Dispose();life.Dispose();view.Dispose();}};
life.Later(1,request);
})();
