(function(){
"use strict";
// Independent login calendar. All rewards and eligibility come from the existing
// authoritative daily snapshot; the shell never grants or unlocks an entitlement.
var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,RH=cfg.RemainingHandoff,P=cfg.DailyGW2Data||{},size=P.canvas||[1360,844];
var reopenAfterReload=cfg.SurvivalDailyStargoldOpen===true;
var layout=P.layout||{cellWidth:131,cellHeight:124,cellPadding:5,slotY:23,slotHeight:101,columns:[46,189,331,474,616,759,901],rows:[193,329,465,600],monthlyX:1082,monthlyWidth:222};
var cellWidth=layout.cellWidth,cellHeight=layout.cellHeight,cellPadding=layout.cellPadding,columns=layout.columns,rows=layout.rows;
var iconInset=2,slotY=layout.slotY||23,slotHeight=layout.slotHeight||101;
var monthlyWidth=layout.monthlyWidth||222;
var gridWidth=columns[6]-columns[0]+cellWidth,gridHeight=rows[3]-rows[0]+cellHeight;
var fitOptions={widthFraction:.94,heightFraction:.9};
var data=null,waiting=null,errorText="",buying=false,sequence=0,active=true,life=U.Lifecycle(),viewLife=U.Lifecycle(),fetching=false,fetchSerial=0;
var dailyRoot=$.GetContextPanel(),view=null,shell=null,canvas=null,dailyTooltip=null,moved=[];
var cardSignature="",specialSignature="",statusText="",scale=1;
var tooltipSources=[];
var rewardFX=null,activePage="login",benefitWaiting=null,benefitSignature="",benefitErrorText="",loginNodes=[];
var columnLabels=["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ"];
function valid(node){return node&&(!node.IsValid||node.IsValid());}
function p(id){return valid(dailyRoot)?dailyRoot.FindChildTraverse(id):null;}
function viewValid(){return valid(p("DailyWindow"));}
if(!viewValid()){active=false;return;}
if(cfg.SurvivalDaily&&cfg.SurvivalDaily.Dispose)cfg.SurvivalDaily.Dispose();
function stopIfInvalid(){if(!active)return true;if(viewValid())return false;active=false;if(rewardFX)rewardFX.Dispose();if(dailyTooltip)dailyTooltip.Dispose();life.Dispose();viewLife.Dispose();if(view)view.Dispose();return true;}
function array(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
function cashReady(){var payments=cfg.SurvivalPayments;return cfg.SurvivalDevelopmentPayments===true||!!payments&&typeof payments.IsRealMoneyEnabled==="function"&&payments.IsRealMoneyEnabled()===true;}
function passPriceText(){
 if(!cashReady())return "";
 var payments=cfg.SurvivalPayments,catalog=payments&&payments.GetCatalog&&payments.GetCatalog();
 var item=array(catalog&&catalog.products).filter(function(product){return product&&product.sku==="archive_pass_monthly";})[0],fen=item&&item.amount_fen;
 if(item&&typeof fen==="number"&&fen>0&&fen<=1000000&&fen%1===0&&item.u_coin_per_yuan===100&&typeof item.u_coin_price==="number"&&item.u_coin_price===fen)return (fen/100).toFixed(fen%100===0?0:2)+"元";
 return data&&data.price||"价格待配置";
}
function style(node,values){Object.keys(values).forEach(function(key){if(node.style[key]!==values[key])node.style[key]=values[key];});}
function rect(node,x,y,w,h){style(node,{position:Math.round(x)+"px "+Math.round(y)+"px 0px",width:Math.round(w)+"px",height:Math.round(h)+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});}
function make(type,parent,id,cls){var node=$.CreatePanel(type,parent,id||"");if(cls)node.AddClass(cls);return node;}
function fillIcon(icon,item){
 var shared=cfg.SurvivalRewardPresentation||cfg.SurvivalItemResources;if(shared&&shared.FillIcon)shared.FillIcon(icon,item);
 // The quality background belongs to the full slot, not the inset artwork.
 style(icon,{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});
 if(icon&&icon.SetScaling){icon.SetScaling("stretch-to-fit-preserve-aspect");icon.__survivalItemFill="contain";}return icon;
}
function skin(node,key){var asset=P.assets&&P.assets[key];if(asset)style(node,{backgroundImage:'url("'+asset.file+'")',backgroundColor:"transparent",backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",border:"0px"});}
function component(parent,key,x,y,w,h,id){var node=make("Panel",parent,id,"DailyGW2Art");rect(node,x,y,w,h);node.hittest=false;node.hittestchildren=false;skin(node,key);return node;}
function label(parent,text,x,y,w,h,font,color,id){var node=make("Label",parent,id,"DailyGW2Text");node.text=String(text===undefined?"":text);node.hittest=false;rect(node,x,y,w,h);style(node,{fontSize:Math.max(18,font)+"px",color:color||"#dfd6bf",fontFamily:'"Source Han Sans SC"',fontWeight:"normal",textShadow:"none",whiteSpace:"nowrap",textOverflow:"ellipsis"});return node;}
function move(id,parent){var node=p(id);if(!valid(node))return null;moved.push({node:node,parent:node.GetParent()});node.SetParent(parent);node.style.visibility="visible";return node;}
function escapedLines(value){return String(value||"").replace(/北京时间/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
function effectLines(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/[；;][ \t]*/g,"\n");}
function hideTooltip(){if(dailyTooltip)dailyTooltip.Hide();if(valid(p("DailyTooltip")))p("DailyTooltip").AddClass("ArchiveHidden");}
function tip(anchor,title,body){
 if(/^DailyGW2Weekday_[0-6]$/.test(anchor.id||"")){anchor.hittest=false;return;}
 body=effectLines(body);
 anchor.__dailyGW2Tooltip={title:String(title||"奖励说明"),body:String(body||"奖励说明待同步")};
 if(tooltipSources.indexOf(anchor)<0)tooltipSources.push(anchor);
 anchor.hittest=true;anchor.__dailyGW2ShowTooltip=function(){
  if(!active||!viewValid()||!shell.IsOpen()||!p("DailyRulesText").BHasClass("ArchiveHidden")){hideTooltip();return;}
  if(dailyTooltip.Show({name:String(title||"奖励说明"),description:String(body||"奖励说明待同步")},"daily",anchor,true)){
   p("DailyTooltipName").text=String(title||"奖励说明");p("DailyTooltipEffect").text=String(body||"奖励说明待同步");
  }
 };anchor.SetPanelEvent("onmouseover",anchor.__dailyGW2ShowTooltip);anchor.SetPanelEvent("onmouseout",function(){if(dailyTooltip)dailyTooltip.QueueHide(anchor);});
}
function close(){
 if(!active)return;
 cfg.SurvivalDailyStargoldOpen=false;
 if(rewardFX)rewardFX.Clear();if(waiting)waiting.present=false;if(benefitWaiting)benefitWaiting.present=false;
 hideTooltip();viewLife.Cancel();fetching=false;fetchSerial++;if(view)view.Close();
 if(valid(p("DailyWindow")))p("DailyWindow").AddClass("ArchiveHidden");if(valid(p("DailyScrim")))p("DailyScrim").AddClass("ArchiveHidden");
 if(valid(p("DailyRulesText"))){p("DailyRulesText").AddClass("ArchiveHidden");p("DailyRulesText").visible=false;}$.DispatchEvent("DOTAHideTextTooltip");
}
function fitWindow(value){
 var nextScale=Math.min(1,Number(value)||1),changed=Math.abs(scale-nextScale)>.0001;scale=nextScale;
 if(valid(p("DailyWindow")))p("DailyWindow").style.transform=scale===1?"none":"scale3d("+scale+","+scale+",1)";
 if(changed)hideTooltip();
}
function build(){
 var win=p("DailyWindow");win.AddClass("DailyGW2Page");win.RemoveClass("DailyV10Page");win.RemoveClass("DailyPurple");
 shell=U.ModalShell.Adopt({id:"daily_rewards",panel:win,root:dailyRoot,scrim:p("DailyScrim"),width:size[0],height:size[1],fit:fitOptions,onClose:close,onFit:fitWindow});
 // The R5 board is authored at integer coordinates. At normal 16:9 the shared
 // native UI scale is sufficient; avoid an additional resampled text layer.
 style(win,{width:size[0]+"px",height:size[1]+"px",flowChildren:"none",padding:"0px",margin:"0px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",overflow:"noclip"});
 style(p("DailyScrim"),{backgroundImage:"none",backgroundColor:"#0000008c",washColor:"#ffffff"});
 canvas=make("Panel",win,"DailyGW2Canvas","DailyGW2Canvas");rect(canvas,0,0,size[0],size[1]);style(canvas,{backgroundColor:"#141614",overflow:"clip"});canvas.hittest=false;canvas.hittestchildren=true;
 var backdrop=component(canvas,"texture",0,0,size[0],size[1],"DailyGW2Background");style(backdrop,{opacity:".09",backgroundSize:"cover"});
 var header=component(canvas,null,0,0,size[0],104,"DailyGW2Header");style(header,{backgroundColor:"#10120f",borderBottom:"1px solid #8b744640",overflow:"clip"});
 var headerArt=component(header,"header",0,0,size[0],104,"DailyGW2HeaderArt");style(headerArt,{opacity:".23",backgroundSize:"cover",backgroundPosition:"center"});
 var edge=component(canvas,null,0,0,size[0],size[1],"DailyGW2WindowEdge");style(edge,{border:"1px solid #8b7647"});
 ["login","daily","weekly"].forEach(function(id,index){
  var tab=make("Button",canvas,"DailyGW2Tab_"+id,"DailyGW2Tab");rect(tab,36+index*278,30,266,65);tab.hittestchildren=false;
  var heading=label(tab,["登录奖励","每日福利","每周福利"][index],0,10,266,42,30,"#b4a787",id==="login"?"DailyGW2Title":"DailyGW2TabText_"+id);style(heading,{textAlign:"center",fontWeight:"medium"});
  U.State.Bind(tab,function(){selectPage(id);});
 });
 var closeButton=make("Button",canvas,"DailyGW2Close","DailyGW2CloseButton");rect(closeButton,1310,18,30,30);style(closeButton,{backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#737373),to(#444444))",border:"1px solid #8c8c8c"});
 var closeIcon=component(closeButton,null,5,5,20,20);style(closeIcon,{backgroundImage:'url("s2r://panorama/images/control_icons/close_png.vtex")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",opacity:"1"});
 closeButton.hittestchildren=false;
 closeButton.SetPanelEvent("onactivate",function(){if(active&&valid(closeButton)){if(shell.RequestClose)shell.RequestClose("button");else close();}});
 label(canvas,"每日签到",47,115,180,30,22,"#ddcfaa","DailyGW2CalendarHeader").style.fontWeight="medium";
 columnLabels.forEach(function(name,i){var weekday=label(canvas,name,columns[i],149,cellWidth,66,54,"#ab9e7e","DailyGW2Weekday_"+i);style(weekday,{textAlign:"center"});});
 var passPanel=component(canvas,null,1067,123,252,677,"DailyGW2PassPanel");style(passPanel,{backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#121612),to(#0c100d))",borderLeft:"1px solid #77623b88",borderRight:"1px solid #423b29"});
 var monthHeader=label(canvas,"月卡专属奖励",1082,135,222,30,22,"#e1c887","DailyGW2MonthHeader");style(monthHeader,{textAlign:"center",fontWeight:"medium"});
 var monthSubtitle=label(canvas,"7 / 14 / 21 次累计签到奖励",1082,166,222,24,16,"#a2977c","DailyGW2MonthSubtitle");style(monthSubtitle,{textAlign:"center"});
 ["DailyFrame","DailyHeader","DailyClaimPage","DailyPassPage","DailyRuleLine","DailyBack","DailyTooltip"].forEach(function(id){p(id).visible=false;});
 ["DailyCards","DailySubtitle","DailyCount","DailyPassStatus","DailySpecials","PassValidity","PassPrice","PassPurchase","DailyRules","DailyMakeup","DailyClaim","DailyNotice","DailyRulesText"].forEach(function(id){move(id,canvas);});
 rect(p("DailySubtitle"),0,0,0,0);p("DailySubtitle").text="";p("DailySubtitle").visible=false;p("DailySubtitle").style.visibility="collapse";
 rect(p("DailyCount"),742,115,180,26);p("DailyCount").visible=true;style(p("DailyCount"),{fontFamily:'"Source Han Sans SC"',fontWeight:"normal",fontSize:"18px",textShadow:"none",color:"#b5a888",textAlign:"right",whiteSpace:"nowrap",textOverflow:"clip"});
 var progress=component(canvas,null,934,130,97,2,"DailyGW2ProgressTrack");style(progress,{backgroundColor:"#afa17f20"});var progressFill=component(progress,null,0,0,0,2,"DailyGW2Progress");style(progressFill,{backgroundColor:"#ebce86"});
 rect(p("DailyCards"),columns[0],rows[0],gridWidth,gridHeight);style(p("DailyCards"),{flowChildren:"none",overflow:"clip"});
 rect(p("DailyPassStatus"),0,0,0,0);style(p("DailyPassStatus"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});p("DailyPassStatus").hittestchildren=false;p("DailyPassStatus").visible=false;
 rect(p("DailyPassStatusText"),0,0,233,32);style(p("DailyPassStatusText"),{fontSize:"22px",color:"#a9d7ed",textAlign:"center",margin:"0px",marginLeft:"0px"});
 rect(p("DailySpecials"),layout.monthlyX,rows[0],monthlyWidth,gridHeight);style(p("DailySpecials"),{flowChildren:"none",overflow:"clip"});
 var passInfo=make("Panel",canvas,"DailyGW2PassInfo","DailyGW2Art");rect(passInfo,0,0,0,0);passInfo.visible=false;passInfo.hittest=false;
 rect(p("PassValidity"),0,0,0,0);p("PassValidity").visible=false;
 rect(p("PassPrice"),0,0,0,0);p("PassPrice").visible=false;
 rect(p("PassPurchase"),1081,736,224,52);rect(p("DailyRules"),929,747,100,30);rect(p("DailyMakeup"),58,747,130,30);rect(p("DailyClaim"),411,730,256,64);
 p("DailyRules").Children().forEach(function(node){if(node.paneltype==="Label")node.text="奖励规则";});
 var footer=component(canvas,null,36,800,1288,43,"DailyGW2Footer");style(footer,{borderTop:"1px solid #9d824422"});
 label(canvas,"每日 05:00 刷新   ·   按累计签到次数领取   ·   月卡奖励随符合条件的签到发放",100,811,1160,25,16,"#a89b7a","DailyGW2FooterText").style.textAlign="center";
 rect(p("DailyNotice"),190,778,710,22);style(p("DailyNotice"),{fontFamily:'"Source Han Sans SC"',fontSize:"18px",textShadow:"none",color:"#eed6a8",textAlign:"center",marginTop:"0px",whiteSpace:"nowrap",textOverflow:"ellipsis"});
 var rulesWidth=620,rulesHeight=Math.min(570,size[1]-80),rules=p("DailyRulesText");rect(rules,(size[0]-rulesWidth)/2,(size[1]-rulesHeight)/2,rulesWidth,rulesHeight);style(rules,{flowChildren:"down",overflow:"squish scroll",backgroundColor:"#181610fc",backgroundImage:"none",border:"1px solid #a7926b",padding:"24px",zIndex:"120"});rules.hittest=true;rules.hittestchildren=true;rules.AddClass("ArchiveHidden");rules.visible=false;
 style(p("DailyRulesBody"),{width:(rulesWidth-60)+"px",height:"fit-children",fontSize:"20px",color:"#eee6d2",whiteSpace:"normal",textOverflow:"clip",lineHeight:"28px"});p("DailyRulesBody").html=true;
 // Reuse the archive renderer, materials and hover lifecycle for every daily reward.
 dailyTooltip=cfg.SurvivalArchiveTooltip.Create({parent:canvas,root:dailyRoot,idPrefix:"DailyGW2Tooltip",allowSourceSwitch:true,
  getBounds:function(){return size;},getScale:function(){return scale;},maxHeight:function(bounds){return Math.min(570,bounds.height-40);},watchAnchor:true,
  isAlive:function(){return active&&viewValid();},isActive:function(){return shell.IsOpen()&&p("DailyRulesText").BHasClass("ArchiveHidden");},
  getHoverSources:function(){tooltipSources=tooltipSources.filter(valid);return tooltipSources.slice().reverse();},onHoverSource:function(anchor){if(anchor.__dailyGW2ShowTooltip)anchor.__dailyGW2ShowTooltip();},
  position:function(info){var x=info.anchor.x+cellWidth+12-info.padding;if(x+info.width>info.bounds.width)x=info.anchor.x-info.surfaceWidth-12-info.padding;return {x:Math.max(0,Math.min(info.bounds.width-info.width,x)),y:Math.max(0,Math.min(info.bounds.height-info.height,info.anchor.y-info.padding))};}
 });
 // Scope the opaque R5 tooltip to this instance; keep shared archive behavior.
 p("DailyGW2TooltipBacking").visible=false;p("DailyGW2TooltipFrame").visible=false;
 style(p("DailyGW2TooltipSurface"),{backgroundColor:"#10150f",border:"1px solid #8a754c"});
 style(p("DailyGW2TooltipTitle"),{fontFamily:'"Source Han Sans SC"',fontWeight:"medium",textShadow:"none",color:"#efd49a"});
 // Native action panels can survive reload with old tooltip handlers attached.
 ["DailyClaim","DailyMakeup","PassPurchase","DailyRules","DailyClose","DailyGW2Close"].forEach(function(id){
  var button=p(id);if(!valid(button))return;delete button.__dailyGW2Tooltip;
  button.SetPanelEvent("onmouseover",function(){if(active){hideTooltip();$.DispatchEvent("DOTAHideTextTooltip");}});
  button.SetPanelEvent("onmouseout",function(){if(active)hideTooltip();});
 });
 loginNodes=["DailyGW2CalendarHeader","DailyCount","DailyGW2ProgressTrack","DailyGW2PassPanel","DailyGW2MonthHeader","DailyGW2MonthSubtitle","DailyCards","DailySpecials","PassPurchase","DailyRules","DailyMakeup","DailyClaim"];
 for(var weekday=0;weekday<7;weekday++)loginNodes.push("DailyGW2Weekday_"+weekday);
 ["daily","weekly"].forEach(function(id){var page=make("Panel",canvas,"DailyGW2Benefits_"+id,"DailyGW2BenefitsPage");rect(page,36,122,1288,647);page.visible=false;});
 view=cfg.SurvivalDailyGW2={canvas:canvas,shell:shell,Open:function(){shell.Open();canvas.visible=true;fitWindow(U.Fit(win,dailyRoot,size[0],size[1],fitOptions));},Close:function(){shell.Close();if(valid(canvas))canvas.visible=false;},IsOpen:function(){return shell.IsOpen();},Dispose:function(){dailyTooltip.Dispose();shell.Dispose();moved.forEach(function(e){if(valid(e.node)&&valid(e.parent))e.node.SetParent(e.parent);});moved=[];if(valid(canvas))canvas.DeleteAsync(0);if(valid(win))win.RemoveClass("DailyGW2Page");}};
}
build();
if(U.RewardFX)rewardFX=U.RewardFX.Create(canvas,{channel:"daily",getScale:function(){return scale;}});
p("DailyClose").SetPanelEvent("onactivate",function(){if(active)close();});
U.State.Bind(p("DailyRules"),function(){if(!active||!viewValid())return;hideTooltip();var rules=p("DailyRulesText");rules.ToggleClass("ArchiveHidden");rules.visible=!rules.BHasClass("ArchiveHidden");});
U.State.Bind(p("DailyPassStatus"),function(){if(!active||!viewValid())return;buying=true;p("DailyGW2PassInfo").AddClass("DailyGW2PassFocus");});
U.ActionButton.Adopt(p("DailyClaim"),{action:function(){if(!active)return;if(!data){request();return;}claim(data.today);}});
U.ActionButton.Adopt(p("DailyMakeup"),{action:function(){if(active)claim(array(data&&data.missed)[0]);}});
U.ActionButton.Adopt(p("PassPurchase"),{action:function(){if(!cashReady()||!active||!data||Number(data.purchase_enabled)!==1||waiting||benefitWaiting||Number(data.pending)===1)return;U.State.Set(p("PassPurchase"),{enabled:false});GameEvents.SendCustomGameEventToServer("survival_pass_purchase",{});}});
function setStatus(text){statusText=String(text||"");if(valid(p("DailyNotice")))p("DailyNotice").text=statusText;}
function paintActions(){
 ["DailyClaim","DailyMakeup","PassPurchase","DailyRules"].forEach(function(id){
  var button=p(id),quiet=id==="DailyRules"||id==="DailyMakeup";button.AddClass("DailyGW2Button");
  // Surviving native panels may retain the old inline values after reload.
  // Let CSS own interaction states so polling cannot overwrite hover/press.
  if(!button.__dailyGW2ActionCSSStates&&button.ClearPropertyFromCode){
   button.ClearPropertyFromCode("brightness");button.ClearPropertyFromCode("saturation");button.__dailyGW2ActionCSSStates=true;
  }
  style(button,{opacity:"1",backgroundColor:"transparent",backgroundImage:"none",border:"0px",flowChildren:"none"});
  if(!quiet){
   // Retire the old monthly outline layers when a native panel survives reload.
   button.Children().forEach(function(node){if(node.BHasClass&&node.BHasClass("DailyGW2Art")){node.visible=false;node.DeleteAsync(0);}});
   delete button.__stargoldBorder;
   skin(button,"button");style(button,{backgroundSize:"cover",backgroundPosition:"center",border:"1px solid #d1ad63"});
  }
  if(quiet)style(button,{borderBottom:"1px solid #82704d77"});
  button.hittestchildren=false;button.Children().forEach(function(node){if(node.BHasClass&&node.BHasClass("DailyGW2HoverArt")){node.visible=false;return;}if(node.paneltype==="Label"){rect(node,0,0,parseFloat(button.style.width),parseFloat(button.style.height));style(node,{fontFamily:'"Source Han Sans SC"',fontWeight:quiet?"normal":"medium",fontSize:quiet?"18px":id==="PassPurchase"?"20px":"22px",color:quiet?"#b4a783":"#241b0c",textShadow:"none",textAlign:"center",verticalAlign:"center",marginTop:"0px",marginLeft:"0px",paddingTop:"0px",whiteSpace:"nowrap",textOverflow:"clip"});style(node,{width:"fit-children",height:"fit-children",horizontalAlign:"center"});}});
 });
}
function request(){
 if(stopIfInvalid()||fetching)return;fetching=true;var serial=++fetchSerial;if(!data){errorText="";render();}
 GameEvents.SendCustomGameEventToServer("survival_daily_request",{});
 if(shell.IsOpen())viewLife.Later(8,function(){if(!active||serial!==fetchSerial||!fetching)return;fetching=false;if(!data){errorText="读取奖励超时，请重试";render();}});else fetching=false;
}
function artId(item){return item.art_id&&RH.DailyResourceInfo(item.art_id).runtime?item.art_id:"daily.item.crystals";}
function rewardQuantity(item){var value=item&&item.count;return value!==undefined&&value!==null&&String(value).trim()!==""&&isFinite(Number(value))&&Number(value)>=0?value:null;}
function itemDescription(item,value){var resources=cfg.SurvivalItemResources;return resources&&resources.DisplayDescription?resources.DisplayDescription(item,value):String(value||"");}
function rewardDescription(item){
 var text=itemDescription(item,item.description||"");
 if(Number(item.max_owned)===1){
  text+=(text?"\n":"")+"每种道具最多拥有1件";
  var points=Number(item.duplicate_points);
  if(item.duplicate_currency==="shop_points"&&item.duplicate_points!==undefined&&isFinite(points)&&points>=0)text+="\n重复奖励每件转化为 "+points+" 商城积分";
 }
 return text;
}
function quantity(parent,value,w,h,inset,x,y){
 var width=Math.min(68,w),host=make("Panel",parent,"","DailyGW2QuantityHost");rect(host,(x||0)+w-width-inset,(y||0)+h-30,width,24);host.hittest=false;host.hittestchildren=false;
 // Native Label text alignment does not reliably move a single-line glyph.
 // Anchor its intrinsic box to the right of a separate, fixed-size host.
 var count=label(host,String(value),0,0,width,24,20,"#eee4c6");count.AddClass("DailyGW2Quantity");style(count,{width:"fit-children",maxWidth:width+"px",height:"fit-children",horizontalAlign:"right",verticalAlign:"bottom",fontWeight:"medium",textAlign:"right",textOverflow:"clip",textShadow:"none"});return count;
}
function mark(parent,key){var monthly=parent.BHasClass("DailyGW2MonthlyIconFrame"),width=parseFloat(parent.style.width),node=component(parent,key,width-(monthly?23:25),monthly?8:slotY+7,15,15);node.AddClass(key==="lock"?"DailyGW2Lock":"DailyGW2Check");return node;}
function rewardFrame(parent,cls,x,y,w,h){
 var frame=make("Panel",parent,"",cls);rect(frame,x||0,y||0,w||cellWidth,h||cellHeight);frame.hittest=false;frame.hittestchildren=false;skin(frame,cls==="DailyGW2SpecialFrame"?"premium_frame":"reward_frame");
 style(frame,{backgroundColor:"#10110f",border:"1px solid #76643e"});return frame;
}
function reward(parent,item,x,y,w,h,cls,hideQuantity){
 var slot=make("Panel",parent,"",cls||"DailyGW2Reward");rect(slot,x,y,w,h);slot.hittest=true;slot.hittestchildren=false;
 var resources=cfg.SurvivalItemResources;if(resources&&resources.ApplyBackground)resources.ApplyBackground(slot,item);
 var inset=Math.max(4,Math.round(Math.min(w,h)*.1));
 var art=(cfg.SurvivalItemArt&&cfg.SurvivalItemArt.Create(slot,item,"DailyGW2ItemArt"))||RH.DailyImage(slot,artId(item),"DailyGW2ItemArt");rect(art,inset,inset,w-inset*2,h-inset*2);art.hittest=false;fillIcon(art,item);
 var known=rewardQuantity(item)!==null;
 if(known&&!hideQuantity)quantity(parent,item.count,w,h+cellPadding,0,x,y);
 tip(slot,item.name,itemDescription(item,item.description||"奖励说明待同步")+(known?"\n数量："+item.count:""));return slot;
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
  var frame=rewardFrame(card,"DailyGW2RewardFrame",0,slotY,cellWidth,slotHeight);
  // The reward backing supplies the tile without an extra outer outline.
  style(frame,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none"});
  var dayLabel=label(card,String(day.day||i+1),7,slotY+5,60,31,26,"#eee4c6");dayLabel.AddClass("DailyGW2DateNumber");
  style(dayLabel,{fontWeight:"bold",textShadow:"#000000 0px 0px 1px 3.0",textOverflow:"clip",zIndex:"6"});
  // One picture represents the complete bundle; all rewards remain in its tooltip.
  var items=array(day.rewards);
  if(items.length){
   var image=reward(card,items[0],iconInset,slotY+iconInset,cellWidth-iconInset*2,slotHeight-iconInset*2,null,true);image.hittest=false;image.hittestchildren=false;card.__dailyRewardIcon=image;
   if(rewardQuantity(items[0])!==null)quantity(card,items[0].count,cellWidth,slotHeight,8,0,slotY);
  }
  if(status==="claimed")mark(card,"check");
  var summary=items.map(function(item){return item.name+(item.count!==undefined?" ×"+item.count:"")+"\n"+rewardDescription(item);}).join("\n\n");
  tip(card,columnLabels[i%7]+" · 第"+(day.day||i+1)+"天 · "+stateText(status),summary||"正在读取该日奖励");
 });
}
function renderSpecials(){
 var specials=array(data&&data.specials).filter(function(item){return item&&item.id;}).slice(0,rows.length),signature=JSON.stringify([specials,data&&data.has_pass,data&&data.count]);if(signature===specialSignature&&p("DailySpecials").GetChildCount()===specials.length)return;specialSignature=signature;hideTooltip();p("DailySpecials").RemoveAndDeleteChildren();
 specials.forEach(function(item,i){
  var height=specials.length>3?Math.floor((gridHeight-12*(specials.length-1))/specials.length):(layout.monthlyHeight||169),top=specials.length>3?i*(height+12):i*181;
  var card=make("Panel",p("DailySpecials"),"DailyGW2Special_"+item.id,"DailyGW2Special");rect(card,0,top,monthlyWidth,height);
  var owned=Number(item.owned)>0,pass=Number(data.has_pass)===1;
  card.SetHasClass("DailyGW2Locked",!pass&&!owned);card.SetHasClass("DailyGW2Owned",owned);
  var iconSize=Math.min(100,height-70),iconFrame=make("Panel",card,"","DailyGW2MonthlyIconFrame");rect(iconFrame,(monthlyWidth-iconSize)/2,35,iconSize,iconSize);style(iconFrame,{border:"0px",backgroundColor:"#10110f"});iconFrame.hittest=false;iconFrame.hittestchildren=true;
  var slot=reward(iconFrame,item,1,1,iconSize-2,iconSize-2,"DailyGW2PassReward",true);
  var frame=rewardFrame(iconFrame,"DailyGW2SpecialFrame",0,0,iconSize,iconSize);style(frame,{backgroundColor:"transparent",zIndex:"2"});
  if(rewardQuantity(item)!==null)quantity(card,item.count,monthlyWidth,height,8);
  var when=label(card,"累计签到 "+item.day+" 次",6,9,monthlyWidth-12,24,16,"#c3b38a");style(when,{textAlign:"center"});
  var itemName=label(card,item.name,7,height-33,monthlyWidth-14,27,20,"#d9caa6");style(itemName,{textAlign:"center",fontWeight:"medium"});
  var status=owned?"已获得":!pass?"开通月卡后解锁":Number(data.count)>=Number(item.day)?"下次签到时发放":"累计签到 "+item.day+" 次";
  if(owned)mark(iconFrame,"check");else if(!pass)mark(iconFrame,"lock");
  var details=itemDescription(item,item.description||"奖励说明待同步")+"\n领取条件：累计签到"+item.day+"次\n领取状态："+status+"\n月卡奖励随符合条件的签到自动发放。";
  tip(card,item.name,details);tip(slot,item.name,details);
 });
}
function benefitData(track){return data&&data.benefits&&data.benefits[track];}
// The generated catalogue is a display-only preview while the archive snapshot
// is unavailable. It never supplies eligibility, progress or a claim target.
function benefitDisplayRows(track){
 var group=benefitData(track);if(group&&group.rows!==undefined&&group.rows!==null)return array(group.rows);
 var definitions=cfg.SurvivalBenefitDefinitions,rows=definitions&&definitions.tracks&&definitions.tracks[track];
 return array(rows).map(function(row){var preview={};Object.keys(row).forEach(function(key){preview[key]=row[key];});preview.status="syncing";preview.can_claim=0;preview.claimed=0;preview.__preview=true;return preview;});
}
function benefitsClaimable(){return ["daily_time","daily_wins","weekly_time"].some(function(track){return array(benefitData(track)&&benefitData(track).rows).some(function(row){return row.status==="claimable"||row.can_claim===true||Number(row.can_claim)===1;});});}
function selectPage(id){
 if(!active||!viewValid()||["login","daily","weekly"].indexOf(id)<0)return;
 activePage=id;hideTooltip();var rules=p("DailyRulesText");rules.AddClass("ArchiveHidden");rules.visible=false;render();
}
function paintPages(){
 var login=activePage==="login";
 loginNodes.forEach(function(id){var node=p(id);if(valid(node))node.visible=login&&(id!=="PassPurchase"||cashReady())&&(id!=="DailyMakeup"||!!data&&Number(data.has_pass)===1&&array(data.missed).length>0);});
 ["login","daily","weekly"].forEach(function(id){var tab=p("DailyGW2Tab_"+id);U.State.Set(tab,{selected:activePage===id});tab.SetHasClass("DailyGW2TabSelected",activePage===id);});
 p("DailyGW2Benefits_daily").visible=activePage==="daily";p("DailyGW2Benefits_weekly").visible=activePage==="weekly";
 p("DailyGW2FooterText").text=activePage==="weekly"?"每周一 05:00 刷新   ·   各档奖励每周可领取一次   ·   月卡奖励与基础奖励一并领取":activePage==="daily"?"每日 05:00 刷新   ·   时长与胜场分别累计   ·   各档奖励每日可领取一次":"每日 05:00 刷新   ·   按累计签到次数领取   ·   月卡奖励随符合条件的签到发放";
}
function benefitRewards(row,monthly){return array(row&&(monthly?row.monthly_rewards:row.base_rewards));}
function benefitRewardStrip(parent,items,x,y,w,monthly,compact,monthlyOnly){
 var iconSize=compact?26:32;
 label(parent,monthly?(monthlyOnly?"月卡奖励":"月卡加赠"):"基础奖励",x,y+(compact?3:7),82,compact?24:27,18,monthly?"#cdb679":"#aaa38e");
 var width=Math.min(134,(w-86)/Math.max(1,items.length));
 items.forEach(function(item,index){
  var slot=reward(parent,item,x+86+index*width,y,iconSize,iconSize,"DailyGW2BenefitReward",true);slot.SetHasClass("DailyGW2BenefitMonthlyReward",monthly);
  label(parent,"×"+item.count,x+90+iconSize+index*width,y+(compact?2:4),width-iconSize-4,compact?24:26,18,monthly?"#ddc786":"#e2dac6");
  tip(slot,item.name,rewardDescription(item)+"\n数量："+item.count);
 });
 if(!items.length)label(parent,"—",x+88,y+5,80,25,18,"#777768");
}
function benefitState(row){if(row.__preview)return "syncing";return row.status==="claimed"||row.claimed===true||Number(row.claimed)===1?"claimed":row.status==="claimable"||row.can_claim===true||Number(row.can_claim)===1?"claimable":"locked";}
function benefitLogin(row,track){return track==="daily_time"&&Number(row.required)===0;}
function benefitMonthlyOnly(row){return row.monthly_only===true||Number(row.monthly_only)===1||benefitRewards(row,false).length===0&&benefitRewards(row,true).length>0;}
function benefitAutomatic(row){return row.auto_claim===true||Number(row.auto_claim)===1;}
function benefitRow(parent,track,row,index,x,y,w,h,weekly){
 var card=make("Panel",parent,"DailyGW2Benefit_"+track+"_"+row.id,"DailyGW2BenefitCard");rect(card,x,y,w,h);style(card,{backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#302b1c55),to(#181b1644))",borderBottom:"1px solid #8d79542c",overflow:"clip"});
 var state=benefitState(row),group=benefitData(track)||{},progress=Math.max(0,Number(group.progress)||0),required=Number(row.required)||0;
 card.SetHasClass("DailyGW2BenefitClaimed",state==="claimed");card.SetHasClass("DailyGW2BenefitReady",state==="claimable");
 if(state==="claimable")style(card,{backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#b5903324),to(#181b1644))"});
 var login=benefitLogin(row,track),monthlyOnly=benefitMonthlyOnly(row),automatic=benefitAutomatic(row,track),compact=!weekly&&h<108;
 var title=login?"每日登录":track==="daily_wins"?"胜利 "+required+" 场":"游玩 "+required+" 分钟";
 label(card,title,16,weekly?13:compact?2:8,w-148,compact?26:30,weekly?22:20,"#e8d6ad").style.fontWeight="medium";
 if(login||track==="daily_wins"){var current=label(card,login?"月卡专属":(row.__preview?"—":Math.min(progress,required))+" / "+required+" 场",w-232,compact?4:10,106,25,18,"#acaa90");current.style.textAlign="right";}
 var rewardsY=weekly?78:compact?30:38;
 if(!monthlyOnly)benefitRewardStrip(card,benefitRewards(row,false),16,rewardsY,w-(weekly?32:140),false,compact);
 benefitRewardStrip(card,benefitRewards(row,true),16,monthlyOnly?(compact?42:54):rewardsY+(compact?29:37),w-(weekly?32:140),true,compact,monthlyOnly);
 var pass=!!data&&Number(data.has_pass)===1,requiresPass=monthlyOnly&&!pass;
 if(!pass)card.SetHasClass("DailyGW2BenefitNoPass",true);
 var button=make("Button",card,"DailyGW2BenefitClaim_"+track+"_"+row.id,"DailyGW2Button DailyGW2BenefitClaim");rect(button,w-112,weekly?13:compact?37:47,96,42);skin(button,"button");style(button,{backgroundSize:"cover",backgroundPosition:"center",border:"1px solid #b99a5f"});button.hittestchildren=false;
 var matching=benefitWaiting&&benefitWaiting.track===track&&benefitWaiting.id===String(row.id),busy=!!benefitWaiting||!!waiting||Number(data&&data.pending)===1;
 var text=label(button,matching?"领取中…":state==="claimed"?"已领取":state==="syncing"?"同步中":requiresPass?"需月卡":automatic?"发放中…":state==="claimable"?"领取":"未达成",0,7,96,28,18,"#251c0e");text.style.textAlign="center";
 U.State.Set(button,{enabled:state==="claimable"&&!busy&&!requiresPass&&!automatic,busy:matching});U.State.Bind(button,function(){claimBenefit(track,row.id);});
 var details=(monthlyOnly?"":benefitRewards(row,false).map(function(item){return item.name+" ×"+item.count;}).join("、")+"\n")+"月卡加赠："+benefitRewards(row,true).map(function(item){return item.name+" ×"+item.count;}).join("、")+"\n"+(automatic?(pass?"月卡已生效，每日登录奖励由系统自动发放":"开通月卡后，每日登录奖励由系统自动发放"):monthlyOnly?(pass?"月卡已生效，请点击领取每日登录奖励":"开通月卡后，可点击领取每日登录奖励"):pass?"月卡已生效，领取时一并发放":"月卡未生效，仅领取基础奖励");
 if(row.__preview)details+="\n福利数据待同步，存档服务确认后可领取。若持续未同步，请新开一局更新福利数据。";
 tip(card,title,details);
 // Reward icons own their detailed tooltip; empty card space shows the full bundle.
 card.hittestchildren=true;card.__benefitRow=row;
}
function benefitGroup(parent,track,title,x,w){
 var group=benefitData(track),panel=make("Panel",parent,"DailyGW2BenefitGroup_"+track,"DailyGW2BenefitGroup");rect(panel,x,0,w,647);
 label(panel,title,16,3,w-32,35,25,"#e1cd98").style.fontWeight="medium";
 label(panel,(!group?"福利数据待同步   ·   ":"")+(track==="daily_wins"?"今日累计："+(group?Math.max(0,Number(group.progress)||0):"—")+" 场   ·   ":"")+(data?Number(data.has_pass)===1?"月卡已生效":"月卡未生效":"月卡资格待同步"),16,42,w-32,28,18,"#a9a38c");
 var entries=benefitDisplayRows(track);
 if(!entries.length){label(panel,group?"暂无开放档位":"福利奖励暂不可用，请重新打开界面",16,103,w-32,36,22,"#a8a18c");return;}
 var shown=entries.slice(0,track==="daily_time"?6:5),compact=shown.length>5;
 shown.forEach(function(row,index){benefitRow(panel,track,row,index,0,86+index*(compact?93:111),w,compact?90:108,false);});
}
function renderBenefits(){
 var signature=JSON.stringify([data&&data.benefits,data&&data.has_pass,data&&data.pending,!!waiting,benefitWaiting,cfg.SurvivalBenefitDefinitions]);if(signature===benefitSignature)return;benefitSignature=signature;hideTooltip();
 var daily=p("DailyGW2Benefits_daily"),weekly=p("DailyGW2Benefits_weekly");daily.RemoveAndDeleteChildren();weekly.RemoveAndDeleteChildren();
 benefitGroup(daily,"daily_time","时长福利",0,632);benefitGroup(daily,"daily_wins","胜利福利",656,632);
 label(weekly,"每周时长福利",16,3,530,35,25,"#e1cd98").style.fontWeight="medium";
 var group=benefitData("weekly_time");
 var pass=!!data&&Number(data.has_pass)===1;

 label(weekly,(!group?"福利数据待同步   ·   ":"")+(pass?"月卡已生效 · 每档基础奖励双倍，最后三档另赠金色抽奖券 ×1":"月卡可享每档基础奖励双倍，最后三档另赠金色抽奖券 ×1"),16,43,1256,28,18,"#b7aa87");
 var entries=benefitDisplayRows("weekly_time");
 if(!entries.length)label(weekly,group?"暂无开放档位":"福利奖励暂不可用，请重新打开界面",16,112,1256,40,22,"#a8a18c");
 entries.slice(0,9).forEach(function(row,index){benefitRow(weekly,"weekly_time",row,index,(index%3)*436,92+Math.floor(index/3)*178,416,168,true);});
}
function claimBenefit(track,id){
 var group=benefitData(track),row=array(group&&group.rows).filter(function(item){return String(item.id)===String(id);})[0];
 if(!active||!shell.IsOpen()||!row||benefitState(row)!=="claimable"||benefitAutomatic(row,track)||benefitWaiting||waiting||Number(data.pending)===1)return;
 benefitWaiting={track:track,id:String(id),period:String(group.period_id||""),present:true};benefitErrorText="";errorText="";render();
 GameEvents.SendCustomGameEventToServer("survival_benefit_claim",{track:track,tier_id:String(id)});
}
function acceptBenefitSnapshot(next){
 if(!benefitWaiting)return;
 var group=next.benefits&&next.benefits[benefitWaiting.track],row=array(group&&group.rows).filter(function(item){return String(item.id)===benefitWaiting.id;})[0],result=next.benefit_claim_result;
 if(group&&String(group.period_id||"")!==benefitWaiting.period){benefitWaiting=null;benefitErrorText="";return;}
 var matching=result&&String(result.track)===benefitWaiting.track&&String(result.tier_id)===benefitWaiting.id;
 if(Number(next.pending)===1||(matching&&(result.pending===true||Number(result.pending)===1)))return;
 if(row&&benefitState(row)==="claimed"||(matching&&(result.ok===true||Number(result.ok)===1))){benefitWaiting=null;benefitErrorText="";return;}
 if(matching){benefitWaiting=null;benefitErrorText=result.error||"福利领取失败，请重试";}
}

function availability(){var base=data&&data.ordinary_status==="claimable",bonus=data&&data.premium&&data.premium.status==="claimable";return {enabled:!!(base||bonus),text:base?"领取今日奖励":bonus?"领取月卡奖励":data&&data.ordinary_status==="claimed"?"今日已领取":"尚未开放"};}
function render(){
 if(stopIfInvalid())return;RH=cfg.RemainingHandoff;var ready=availability(),busy=!!waiting||!!benefitWaiting||!!data&&Number(data.pending)===1;
 p("DailyEntry").SetHasClass("DailyCanClaim",ready.enabled||benefitsClaimable());p("DailyEntry").SetHasClass("DailyClaimed",!!data&&!ready.enabled&&data.ordinary_status==="claimed");if(!shell.IsOpen())return;
 p("DailyGW2PassInfo").SetHasClass("DailyGW2PassFocus",buying);p("PassPurchase").SetHasClass("DailyGW2PassFocus",buying);p("DailyCards").visible=true;p("DailySpecials").visible=true;p("PassPurchase").visible=cashReady();p("DailyRules").visible=true;p("DailyClaim").visible=true;
 if(!data){
  p("DailyCount").text="";p("DailyPassStatusText").text="月卡奖励";p("PassValidity").text="资格待同步";p("PassPrice").text="";p("PassPurchaseText").text="开通月卡";p("DailyClaimText").text=fetching?"加载中…":"重试";
  U.State.Set(p("DailyClaim"),{enabled:!fetching,busy:fetching});U.State.Set(p("DailyMakeup"),{enabled:false});U.State.Set(p("PassPurchase"),{enabled:false});p("DailyMakeup").visible=false;
  renderCards();renderSpecials();setStatus(errorText||"正在读取每日奖励…");p("DailyNotice").visible=true;paintActions();renderBenefits();paintPages();return;
 }
 var pass=Number(data.has_pass)===1;U.State.Set(p("DailyPassStatus"),{enabled:true});p("DailyPassStatusText").text=pass?"月卡奖励 · 已解锁":"月卡奖励";
 var roundCount=Math.max(0,Math.min(28,Number(data.count)-(Number(data.calendar_start_count)||0)));
 p("DailyCount").text="累计签到 "+roundCount+" / 28 天";p("DailyGW2Progress").style.width=Math.round(97*roundCount/28)+"px";
 p("DailyClaimText").text=busy?"领取中…":errorText&&ready.enabled?"重试":ready.text;U.State.Set(p("DailyClaim"),{enabled:ready.enabled&&!busy,busy:busy});
 U.State.Set(p("DailyMakeup"),{enabled:pass&&array(data.missed).length>0&&!busy});p("DailyMakeup").visible=pass&&array(data.missed).length>0;
 p("PassValidity").text=pass?"月卡已解锁":"开通月卡后解锁";
 var expiry=Number(data.expires_at),until=expiry>0?new Date((expiry+8*3600)*1000):null;p("PassPrice").text=(data.duration_days?data.duration_days+"天 · ":"")+passPriceText()+(pass?(until?" · 有效至 "+until.getUTCFullYear()+"/"+(until.getUTCMonth()+1)+"/"+until.getUTCDate():" · 权益已生效"):"");
 p("PassPurchaseText").text=(pass?"续费":"开通")+"月卡";U.State.Set(p("PassPurchase"),{enabled:cashReady()&&Number(data.purchase_enabled)===1&&!busy});
 tip(p("DailyGW2MonthHeader"),"月卡奖励","月卡有效时，按累计签到次数自动发放。具体条件请悬停奖励查看。");
 p("DailyRulesBody").text=escapedLines((data.rule_text||"奖励以服务端配置为准")+"\n补签范围：最近"+(data.makeup_days||30)+"天，需有效月卡。\n\n"+array(data.specials).map(function(s){return "累计"+s.day+"次："+s.name+"\n"+effectLines(s.description);}).join("\n\n"));
 var benefitMissing=activePage==="daily"?(!benefitData("daily_time")||!benefitData("daily_wins")):activePage==="weekly"&&!benefitData("weekly_time");
 renderCards();renderSpecials();paintActions();setStatus(errorText||benefitErrorText||((busy||benefitWaiting)?"正在等待服务端保存，请勿重复提交。":benefitMissing?"福利数据待同步；若持续未同步，请新开一局更新。":""));p("DailyNotice").visible=!!errorText||!!benefitErrorText||busy||!!benefitWaiting||benefitMissing;renderBenefits();paintPages();
}
function claim(target){
 if(!active||!data||waiting||benefitWaiting||Number(data.pending)===1||target===undefined)return;
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
 var anchor=samePage?p("DailyGW2Day_"+intent.slot):null,surface=valid(anchor)&&anchor.__dailyRewardIcon;
 if(!valid(surface))return;
 rewardFX.Play({key:intent.period+":"+intent.target+":"+intent.count+":"+intent.ordinary+":"+intent.premium,
  anchor:anchor,surface:surface,title:"领取成功",text:intent.text||"奖励已领取",tone:"gold"});
}
life.Subscribe("survival_daily_snapshot",function(next){
 if(!active)return;fetching=false;fetchSerial++;if(!(next.ok===true||Number(next.ok)===1)){errorText=next.error||"正在读取档案";render();return;}
 if(Number(next.sequence)>0&&Number(next.sequence)<=sequence)return;if(data&&Number(next.today)<Number(data.today))return;sequence=Number(next.sequence)||sequence;
 acceptBenefitSnapshot(next);var result=next.claim_result,claimed=null;if(waiting){if(Number(next.today)!==waiting.day||String(next.period_id)!==waiting.period){waiting=null;errorText="";}else if(confirmedClaim(next,waiting)){claimed=waiting;waiting=null;errorText="";}else if(result&&Number(result.target_day)===waiting.target&&Number(next.pending)!==1&&!(result.pending===true||Number(result.pending)===1)){waiting=null;errorText=result.error||"领取失败，请重试";}}
 data=next;if(!waiting&&!(result&&!(result.ok===true||Number(result.ok)===1)))errorText="";render();
 if(claimed){
  // Only the saved, consumed intent invalidates the wallet. Pending/failure
  // snapshots and repeated ACKs never create another refresh or a purchase.
  var wallet=cfg.SurvivalCommerceWallet;if(wallet&&typeof wallet.Invalidate==="function")wallet.Invalidate();
  showClaim(claimed);
 }
});
function poll(){if(stopIfInvalid()||!shell.IsOpen())return;request();viewLife.Later(3,poll);}
cfg.SurvivalDaily={Open:function(pass){
 if(!active||!viewValid())return;cfg.SurvivalDailyStargoldOpen=true;hideTooltip();buying=pass===true;if(buying)activePage="login";p("DailyWindow").RemoveClass("ArchiveHidden");p("DailyScrim").RemoveClass("ArchiveHidden");view.Open();viewLife.Cancel();fetching=false;render();request();viewLife.Later(3,poll);
},RefreshPaymentCapability:function(){if(active&&viewValid())render();},SelectPage:selectPage,Close:close,Inspect:function(){var cards=p("DailyCards");return {open:active&&viewValid()&&shell.IsOpen(),layout:"daily_gw2",page:activePage,benefitWaiting:!!benefitWaiting,canvas:size.slice(),cell:[cellWidth,cellHeight],cellPadding:cellPadding,columns:columns.slice(),rows:rows.slice(),monthlyX:layout.monthlyX,monthlySlots:valid(p("DailySpecials"))?p("DailySpecials").GetChildCount():0,pass:buying,waiting:!!waiting,fetching:fetching,today:data&&data.today,count:data&&data.count,hasPass:!!data&&Number(data.has_pass)===1,calendarDay:data&&data.calendar_current_day,days:valid(cards)?cards.GetChildCount():0,status:statusText};},
Dispose:function(){if(!active)return;close();active=false;if(rewardFX)rewardFX.Dispose();viewLife.Dispose();life.Dispose();view.Dispose();}};
// Local Tools-only visual inspection. These commands never claim, purchase or
// invent reward snapshots; they show the real page and inspect native labels.
if(Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){
 var reviewCommand="survival_daily_stargold_"+Date.now();
 var runReview=function(mode){
  if(!active||!viewValid())return;
  if(mode==="open")cfg.SurvivalDaily.Open(false);
  if(mode==="close")close();
  if(mode==="font_sans")style(p("DailyGW2Title"),{fontFamily:'"Source Han Sans SC"',fontWeight:"medium"});
  if(mode==="font_serif")style(p("DailyGW2Title"),{fontFamily:'"Source Han Serif SC"',fontWeight:"bold"});
  if(mode==="tooltip"){
   var specials=p("DailySpecials").Children(),anchor=specials[Math.min(1,specials.length-1)],info=anchor&&anchor.__dailyGW2Tooltip;
   if(info)dailyTooltip.Show({name:info.title,description:info.body},"daily",anchor,true);
  }
  function measure(node){if(!valid(node))return null;return {id:node.id,text:node.text,xy:node.GetPositionWithinWindow(),width:node.actuallayoutwidth,height:node.actuallayoutheight,uiScaleX:node.actualuiscale_x,uiScaleY:node.actualuiscale_y,font:node.style.fontFamily,weight:node.style.fontWeight,size:node.style.fontSize,shadow:node.style.textShadow,overflow:node.style.textOverflow};}
  $.Msg("[DAILY_STARGOLD_NATIVE] "+JSON.stringify({mode:mode||"inspect",state:cfg.SurvivalDaily.Inspect(),transform:p("DailyWindow").style.transform,root:measure(dailyRoot),title:measure(p("DailyGW2Title")),count:measure(p("DailyCount")),claim:measure(p("DailyClaimText")),pass:measure(p("PassPurchaseText")),tooltip:measure(p("DailyGW2TooltipEffect"))}));
 };
 Game.AddCommand(reviewCommand,runReview,"Inspect the live daily UI and compare font faces without changing rewards",0);
 $.Msg("[DAILY_STARGOLD_COMMAND] "+reviewCommand);
}
life.Later(1,request);
if(reopenAfterReload)cfg.SurvivalDaily.Open(false);
})();
