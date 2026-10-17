(function () {
    "use strict";
    // V10 presentation owns no inventory, settlement or draw requests.
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),R=cfg.RemainingHandoff;
    if(cfg.SurvivalPurpleLottery&&cfg.SurvivalPurpleLottery.Dispose)cfg.SurvivalPurpleLottery.Dispose();
    var disposed=false,life=$.CreatePanel("Panel",root,""),view=null,mode="",pools=[],selected="map",snapshot=null,nodes={};life.visible=false;
    function valid(n){return n&&(!n.IsValid||n.IsValid());}
    function fillIcon(icon,item){var shared=cfg.SurvivalRewardPresentation||cfg.SurvivalItemResources;if(shared&&shared.FillIcon)return shared.FillIcon(icon,item);if(icon&&icon.SetScaling)icon.SetScaling("stretch-to-cover-preserve-aspect");return icon;}
    function alive(){return !disposed&&valid(life);}
    function remember(n){if(!valid(n))return;if(n.id)nodes[n.id]=n;n.Children().forEach(remember);}
    // Native Panorama ID traversal can change after SetParent. Capture the
    // authoritative XML controls before any business panel is reparented.
    remember(root);
    function p(id){if(!alive())return null;if(valid(nodes[id]))return nodes[id];var n=root.FindChildTraverse(id);if(valid(n))nodes[id]=n;return n;}
    function style(n,v){if(valid(n))Object.keys(v).forEach(function(k){n.style[k]=v[k];});}
    function place(n,x,y,w,h){style(n,{position:x+"px "+y+"px 0px",width:w+"px",height:h+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top",ignoreParentFlow:"true"});}
    function walk(n,fn){if(!valid(n))return;fn(n);n.Children().forEach(function(c){walk(c,fn);});}
    function move(id,parent){var n=p(id);if(valid(n)&&view&&valid(parent))view.Move(n,parent);return n;}
    function hidden(id){style(p(id),{visibility:"collapse"});}
    function action(id,primary){
        var b=p(id);if(!valid(b))return;b.AddClass("MenusV10LotteryAction");b.SetHasClass("MenusV10LotteryPrimary",!!primary);
        style(b,{backgroundImage:"none",backgroundColor:b.enabled===false?"#21182f":primary?"#634084":"#322341",border:"1px solid "+(b.enabled===false?"#574363":"#b29056"),borderRadius:"3px",boxShadow:"none",flowChildren:"none"});
        walk(b,function(n){if(n.paneltype==="Label")style(n,{color:b.enabled===false?"#97869f":"#efdfbc",textShadow:"none"});});
    }
    function sidebar(){if(!view)return;
        view.SetSidebar(pools.map(function(pool){return {id:String(pool.id),label:String(pool.display_name||pool.id),disabled:false};}),selected,function(id){var ui=cfg.SurvivalLottery;if(!ui)return;if(mode==="history"&&ui.SelectHistoryPool)ui.SelectHistoryPool(id);else ui.SelectPool(id);});
    }
    function ensure(){
        if(view||!alive()||!cfg.SurvivalMenuV10)return view;
        var canvas=p("LotteryMainCanvas");if(!valid(canvas))return null;canvas.RemoveClass("LotteryPurple");canvas.AddClass("LotteryV10");p("LotteryWindow").AddClass("LotteryV10Root");
        view=cfg.SurvivalMenuV10.Adopt({id:"lottery",navId:"lottery",panel:canvas,root:root,scrim:p("LotteryWindow"),modal:false,title:"抽奖",onClose:function(){if(cfg.SurvivalLottery)cfg.SurvivalLottery.Close();}});
        ["LotterySceneBackground","LotterySceneShade","LotteryHeroCopy","LotteryUnlockNotice","LotteryResultStage","LotteryRevealStage","LotterySkipReveal","LotteryStatus"].forEach(function(id){move(id,view.content);});
        move("LotteryCelestialFooter",view.actions);move("LotteryInfoOverlay",view.detailLayer);
        // Snapshot anchors stay alive; the shared strip replaces their visuals.
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        var footer=p("LotteryInfoFooter");if(valid(footer)){var back=$.CreatePanel("Button",footer,"LotteryV10InfoBack");nodes.LotteryV10InfoBack=back;back.AddClass("MenusV10LotteryAction");back.hittestchildren=false;var caption=$.CreatePanel("Label",back,"");caption.text="返回抽奖";caption.hittest=false;back.SetPanelEvent("onactivate",function(){if(cfg.SurvivalLottery)cfg.SurvivalLottery.CloseInfo();});}
        [["LotteryV10Notice",view.actions,"开奖公告","announcement"],["LotteryV10TicketPurchase",view.header,"获取抽奖券","purchase"]].forEach(function(spec){var b=$.CreatePanel("Button",spec[1],spec[0]);nodes[spec[0]]=b;b.AddClass("MenusV10LotteryAction");b.hittestchildren=false;var t=$.CreatePanel("Label",b,"");t.text=spec[2];t.hittest=false;b.SetPanelEvent("onactivate",function(){if(cfg.SurvivalLottery)cfg.SurvivalLottery.Feature(spec[3]);});});
        sidebar();return view;
    }
    function quantity(item){var raw=item&&item.owned_count;if(raw===undefined||raw===null||raw==="")return "—";var count=Number(raw),max=Number(item.max_owned);return !isFinite(count)||count<0?"—":String(count)+(isFinite(max)&&max>0?"/"+max:"");}
    function compactCards(host,single){
        if(!valid(host)||!ensure())return;
        (single?[single]:host.Children()).forEach(function(card,index){
            if(!card.BHasClass("LotteryDetailRow")&&!card.BHasClass("LotteryRewardCard"))return;
            var result=card.BHasClass("LotteryRewardCard"),item=card.__lotteryItem||{},icon=null,name=null,cover=null;card.AddClass("MenusV10LotteryCell");
            // A singleton callback must retain its real index in the host.
            if(single)index=host.Children().indexOf(card);
            walk(card,function(child){if(child.BHasClass("LotteryRewardIcon"))icon=child;if(child.BHasClass("RHRewardName")||child.BHasClass("LotteryRewardName"))name=child;if(child.BHasClass("LotteryCardBack"))cover=child;});
            var cell=view.DecorateCell(card,{index:index,item:item,name:item.name||item.id||name&&name.text||"道具",count:result?"×"+Number(item.count||item.quantity||1):quantity(item),iconPanel:icon,namePanel:name,keep:cover?[cover]:undefined});
            place(card,result?38+(index%5)*214:2+(index%8)*138,result?8+Math.floor(index/5)*184:8+Math.floor(index/8)*174,144,170);
            if(icon){place(icon,0,0,120,120);fillIcon(icon,item);}
            if(cover){place(cover,0,0,144,170);style(cover,{zIndex:"20"});}
            if(cell&&cell.name)style(cell.name,{fontSize:"18px",whiteSpace:"nowrap",textOverflow:"ellipsis",textAlign:"center"});
        });
    }
    function apply(){
        if(!ensure())return;p("LotteryMainCanvas").RemoveClass("LotteryPurple");
        style(view.content,{visibility:mode?"collapse":"visible"});
        style(p("LotteryWindow"),{width:"100%",height:"100%",position:"0px 0px 0px",horizontalAlign:"left",verticalAlign:"top",margin:"0px",backgroundImage:"none",backgroundColor:"#07050fa6",border:"0px",borderRadius:"0px",boxShadow:"none",padding:"0px",flowChildren:"none",transform:"none"});
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        place(p("LotterySceneBackground"),0,100,1113,488);style(p("LotterySceneBackground"),{opacity:"0.42",zIndex:"0",overflow:"clip"});
        if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Resize(1113,488);
        place(p("LotterySceneShade"),0,100,1113,488);style(p("LotterySceneShade"),{backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#100b20eb),color-stop(.4,#100b2088),to(#100b2033))",zIndex:"1"});
        place(p("LotteryHeroCopy"),18,18,1050,336);style(p("LotteryHeroCopy"),{flowChildren:"none",zIndex:"3"});hidden("LotteryTitle");hidden("LotteryAnnouncement");
        place(p("LotteryTaglineBounds"),0,58,1030,44);place(p("LotteryTagline"),0,0,1030,40);style(p("LotteryTagline"),{fontSize:"23px",color:"#cbb9df",transform:"none",textShadow:"none"});
        place(p("LotteryGuaranteeRow"),0,208,900,52);style(p("LotteryGuaranteeRow"),{flowChildren:"none",backgroundColor:"transparent"});
        place(p("LotteryUnlockNotice"),18,574,1050,38);style(p("LotteryUnlockNotice"),{fontSize:"19px",color:"#d0b7e7",textShadow:"none"});
        place(p("LotteryStatus"),18,622,1050,30);style(p("LotteryStatus"),{fontSize:"18px",color:"#cbb8df",textShadow:"none"});
        place(p("LotteryCelestialFooter"),0,0,1095,54);style(p("LotteryCelestialFooter"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none",overflow:"noclip"});
        style(p("LotteryCelestialFooter"),{visibility:mode||p("LotteryWindow").BHasClass("LotteryResultsShown")?"collapse":"visible"});
        place(p("LHDetails"),0,4,142,44);place(p("LHHistory"),151,4,142,44);place(p("LotterySkipAnimation"),310,5,178,40);
        place(p("LotteryV10Notice"),492,4,96,44);place(p("LotteryV10TicketPurchase"),1323,155,190,42);
        style(p("LotteryV10Notice"),{visibility:mode||p("LotteryWindow").BHasClass("LotteryResultsShown")?"collapse":"visible"});
        place(p("LotteryDrawPity"),576,-35,505,28);place(p("LotteryDrawPityCaptionBounds"),0,0,505,28);place(p("LotteryDrawPityCaption"),0,0,505,28);style(p("LotteryDrawPityCaption"),{horizontalAlign:"center",fontSize:"18px",textAlign:"center",transform:"none",color:"#d7c0e8"});
        place(p("LotterySingleButton"),595,1,232,50);place(p("LotteryTenButton"),850,1,232,50);
        ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm"].forEach(function(id){action(id,id==="LotteryTenButton"||id==="LotteryAgain");});
        ["LotterySingleCost","LotteryTenCost"].forEach(function(id){style(p(id),{visibility:"visible",fontSize:"20px",color:"#efdfbc"});});
        place(p("LotteryResultStage"),0,0,1113,669);style(p("LotteryResultStage"),{backgroundImage:"none",backgroundColor:"#100b21f7",zIndex:"6",flowChildren:"none",border:"0px"});
        place(p("LotteryResultHeading"),18,8,1050,48);style(p("LotteryResultHeading"),{fontSize:"27px",color:"#efcd7e",textShadow:"none"});
        place(p("LotteryItemList"),8,64,1097,452);style(p("LotteryItemList"),{flowChildren:"none",overflow:"squish scroll"});
        place(p("LotteryResultActions"),0,574,1113,66);style(p("LotteryResultActions"),{flowChildren:"none"});place(p("LotteryConfirm"),292,0,240,50);place(p("LotteryAgain"),568,0,240,50);
        place(p("LotteryRevealStage"),0,0,1113,669);place(p("LotterySkipReveal"),940,12,155,42);compactCards(p("LotteryItemList"));
        var film=p("LotteryCinematicSurface");if(valid(film)){view.Move(film,view.content);place(film,0,0,1113,669);}
        if(!mode)view.SetTitle(p("LotteryTitle")&&p("LotteryTitle").text||"抽奖");
        if(snapshot&&view.SetResources){var pool=snapshot.selected_pool||snapshot;view.SetResources([{name:pool.ticket_name||"抽奖券",value:pool.tickets,icon:"ticket"},{name:"星悦积分",value:snapshot.starjoy_points,icon:"purple_gem"}]);}
        view.Fit();
        style(p("LotteryMainCanvas"),{opacity:"1"});
    }
    function info(name,options){
        if(!ensure())return;mode=name;var win=options.panel;win.RemoveClass("LotteryInfoPurple");win.AddClass("LotteryInfoV10");
        place(p("LotteryInfoOverlay"),407,213,1113,669);style(p("LotteryInfoOverlay"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",zIndex:"12",flowChildren:"none"});
        style(view.content,{visibility:"collapse"});
        place(win,0,0,1113,669);style(win,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",transform:"none",flowChildren:"none",overflow:"clip"});
        ["LotteryInfoHeader","LotteryInfoTabs","LotteryPoolSelection","LotteryPoolGuarantee"].forEach(hidden);
        var hasNote=!!String(p("LotteryInfoNote")&&p("LotteryInfoNote").text||""),bodyTop=hasNote?58:16,bodyHeight=568-bodyTop;
        place(p("LotteryInfoNote"),16,10,1080,44);style(p("LotteryInfoNote"),{visibility:hasNote?"visible":"collapse",backgroundImage:"none",backgroundColor:"transparent",border:"0px",fontSize:"18px",color:"#b6a1ca",whiteSpace:"normal",textShadow:"none"});
        place(p("LotteryInfoBody"),0,bodyTop,1113,bodyHeight);style(p("LotteryInfoBody"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        place(p("LotteryInfoList"),0,0,1113,bodyHeight);style(p("LotteryInfoList"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:name==="details"||name==="update"?"none":"down",overflow:"squish scroll"});
        place(p("LotteryInfoFooter"),0,580,1113,88);style(p("LotteryInfoFooter"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        p("LotteryInfoFooter").Children().forEach(function(c){if(c.paneltype==="Image")c.visible=false;});
        place(p("LotteryInfoRules"),16,0,774,84);style(p("LotteryInfoRules"),{fontSize:"17px",whiteSpace:"normal",color:"#b5a3c6"});
        place(p("LotteryV10InfoBack"),936,22,160,44);hidden("LotteryInfoConfirm");hidden("RHHistoryColumns");hidden("LotteryCelestialFooter");hidden("LotteryV10Notice");compactCards(p("LotteryInfoList"));
        if(name==="history")p("LotteryInfoList").Children().forEach(function(row){if(row.BHasClass("RHHistoryRow"))style(row,{backgroundImage:"none",border:"0px",borderBottom:"1px solid #3e2c52"});});
        if(name==="reward")p("LotteryInfoList").Children().forEach(function(child){if(child.BHasClass("LotteryDetailIcon")){place(child,12,0,120,120);walk(child,function(n){if(n.BHasClass("LotteryRewardIcon")){place(n,0,0,120,120);fillIcon(n);}});}else if(child.BHasClass("LotteryDetailDescription"))place(child,12,136,1045,bodyHeight-136);});
        var names={details:"奖池详情",history:"抽奖记录",announcement:"开奖公告",update:"奖励更新公告",reward:p("LotteryInfoTitle")&&p("LotteryInfoTitle").text||"奖励详情",firstgift:"首充礼包",privilege:"礼包特权"};view.SetTitle(names[name]||"功能提示");sidebar();
    }
    var originalDialog=R&&R.LotteryDialog,originalReward=R&&R.RewardCard;
    function dialogWrapper(name,options){info(name,options);}
    function rewardWrapper(card,item){card.__lotteryItem=item;if(originalReward)originalReward(card,item);compactCards(card.GetParent(),card);}
    if(R){R.LotteryDialog=dialogWrapper;R.RewardCard=rewardWrapper;}
    cfg.SurvivalPurpleLottery={
        Apply:apply,Info:info,Compact:compactCards,StyleTabs:function(){},IsAlive:alive,
        Pools:function(rows,id){pools=rows||[];selected=String(id||"map");sidebar();},Snapshot:function(data){snapshot=data;apply();},
        Open:function(){mode="";apply();if(view)view.Open();},Close:function(){mode="";if(view)view.Close();},CloseInfo:function(){mode="";style(p("LotteryCelestialFooter"),{visibility:"visible"});apply();},
        Content:function(){return ensure()?view.content:null;},
        Fit:function(){if(!ensure())return false;view.Fit();style(p("LotteryMainCanvas"),{opacity:"1"});return true;},
        Tooltip:function(item,anchor){if(!ensure())return false;var lines=[String(item.description||"暂无效果说明")];if(item.quality)lines.push("品质："+String(item.quality).toUpperCase());if(item.duration_text)lines.push("期限："+item.duration_text);if(item.duplicate_points!==undefined&&item.duplicate_points!==null)lines.push("重复转化："+item.duplicate_points+"积分");if(item.count!==undefined||item.quantity!==undefined)lines.push("本次获得："+Number(item.count||item.quantity||1));if(item.duplicate===true||Number(item.duplicate)===1)lines.push("本次已转化 "+Number(item.converted_points||0)+" 积分");view.TooltipShow({name:item.name||item.id||"道具",description:lines.join("\n"),quantity:quantity(item),state:item.item_type||"抽奖奖励"},anchor);return true;},
        HideTooltip:function(){if(view)view.TooltipHide();},
        Dispose:function(){if(disposed)return;disposed=true;if(R&&R.LotteryDialog===dialogWrapper)R.LotteryDialog=originalDialog;if(R&&R.RewardCard===rewardWrapper)R.RewardCard=originalReward;if(view)view.Dispose();view=null;if(valid(life))life.DeleteAsync(0);},
        Inspect:function(){var values={alive:alive(),view:!!view,mode:mode,pools:pools.length,selected:selected,hasSnapshot:!!snapshot};["LotteryWindow","LotteryMainCanvas","LotteryCelestialHeader","LotteryPoolTabs","LotteryHeroCopy","LotteryCelestialFooter"].forEach(function(id){var n=p(id);values[id]=valid(n)?{parent:n.GetParent()&&n.GetParent().id,position:n.style.position,visible:n.visible,visibility:n.style.visibility,width:n.style.width,height:n.style.height,transform:n.style.transform}:null;});return values;}
    };apply();
    if(typeof Game!=="undefined"&&Game.AddCommand){var probe="lottery_v10_inspect_"+Date.now();Game.AddCommand(probe,function(){$.Msg("[LOTTERY_V10_STATE] "+JSON.stringify(cfg.SurvivalPurpleLottery.Inspect()));},"Read native V10 lottery layout",0);$.Msg("[LOTTERY_V10_READY] "+probe);}
})();
