(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), root=$.GetContextPanel(), R=cfg.RemainingHandoff;
    if(cfg.SurvivalPurpleLottery&&cfg.SurvivalPurpleLottery.Dispose)cfg.SurvivalPurpleLottery.Dispose();
    var subscriptions=[],disposed=false,life=$.CreatePanel("Panel",root,"");life.visible=false;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function alive(){return !disposed&&valid(life);}
    function p(id){return alive()?root.FindChildTraverse(id):null;}
    function style(n,values){if(valid(n))Object.keys(values).forEach(function(k){n.style[k]=values[k];});}
    function descendants(n,fn){if(!valid(n))return;fn(n);n.Children().forEach(function(c){descendants(c,fn);});}
    function action(id,primary){
        var b=p(id);if(!valid(b))return;
        style(b,{backgroundImage:"none",backgroundColor:b.enabled===false?"#21182f":primary?"#634084":"#322341",border:"1px solid "+(b.enabled===false?"#574363":"#b29056"),borderRadius:"3px",boxShadow:"none"});
        descendants(b,function(n){if(n.paneltype==="Label")style(n,{color:b.enabled===false?"#97869f":"#efdfbc",textShadow:"none"});});
    }
    function compactCards(host,single){
        if(!valid(host))return;
        (single?[single]:host.Children()).forEach(function(card,index){
            if(!card.BHasClass("LotteryDetailRow")&&!card.BHasClass("LotteryRewardCard"))return;
            var result=card.BHasClass("LotteryRewardCard");
            style(card,{width:result?"184px":"130px",height:result?"160px":"144px",margin:result?"10px 16px":"0px 10px 8px 0px",padding:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none"});
            if(result)style(card,{position:(40+(index%5)*222)+"px "+(24+Math.floor(index/5)*176)+"px 0px",horizontalAlign:"left",verticalAlign:"top"});
            card.Children().forEach(function(child){
                if(child.BHasClass("LotteryDetailIcon")||child.BHasClass("LotteryRewardIconFrame"))style(child,{position:result?"34px 0px 0px":"17px 2px 0px",width:result?"116px":"96px",height:result?"116px":"96px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top",backgroundImage:"none",backgroundColor:"#161022",border:"1px solid #72548d"});
                if(child.BHasClass("RHRewardName")||child.BHasClass("LotteryRewardName"))style(child,{position:result?"0px 122px 0px":"0px 104px 0px",width:result?"184px":"130px",maxWidth:result?"184px":"130px",height:"28px",fontSize:"18px",textAlign:"center",horizontalAlign:"left",verticalAlign:"top",backgroundColor:"transparent",backgroundImage:"none",padding:"0px",margin:"0px",color:"#e0d1f0",whiteSpace:"nowrap",textOverflow:"ellipsis"});
                if(child.BHasClass("RewardV5Quality")||child.BHasClass("LotteryRewardQuality")||child.BHasClass("LotteryRewardDescription")||child.BHasClass("LotteryRewardDuration")||child.BHasClass("LotteryDuplicateBadge"))style(child,{visibility:"collapse"});
                if(child.BHasClass("LotteryRewardQuantity"))style(child,{position:"90px 0px 0px",horizontalAlign:"left",verticalAlign:"top",margin:"0px",height:"25px",backgroundColor:"#130b20ee",fontSize:"17px",color:"#f1e3ff",padding:"1px 5px",zIndex:"8"});
            });
            descendants(card,function(child){
                if(child.BHasClass("LotteryDuplicateBadge"))style(child,{visibility:"collapse"});
                if(child.BHasClass("LotteryRewardIcon"))style(child,{width:"100%",height:"100%",margin:"0px",padding:"0px"});
            });
        });
    }
    function apply(){
        var canvas=p("LotteryMainCanvas");if(!valid(canvas))return;
        canvas.AddClass("LotteryPurple");
        var shell=cfg.SurvivalPurpleShell;
        if(shell)shell.Adopt({id:"lottery",panel:canvas,width:1280,height:800,onClose:function(){cfg.SurvivalLottery.Close();}});
        style(p("LotteryWindow"),{backgroundImage:"none",backgroundColor:"#07050fa6",border:"0px",padding:"0px"});
        ["LotterySceneBackground","LotterySceneShade"].forEach(function(id,index){
            var scene=p(id);if(!valid(scene))return;
            if(scene.GetParent()!==canvas)scene.SetParent(canvas);
            style(scene,{position:"0px 192px 0px",width:"1280px",height:"482px",margin:"0px",opacity:index?"1":"0.36",zIndex:index?"1":"0"});
        });
        style(p("LotterySceneShade"),{backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#100b20ed),color-stop(.38,#100b20a6),to(#100b2033))"});
        style(p("LotteryCelestialHeader"),{position:"900px 134px 0px",width:"350px",height:"52px",backgroundColor:"transparent",visibility:"visible",zIndex:"5"});
        ["LotteryBrand","LotteryCloseButton"].forEach(function(id){style(p(id),{visibility:"collapse"});});
        style(p("LotteryWallet"),{position:"0px 0px 0px",width:"350px",height:"44px",margin:"0px",horizontalAlign:"left",verticalAlign:"top"});
        style(p("LotteryTicketValue"),{position:"46px 6px 0px",fontSize:"20px",color:"#e6d5f2",textShadow:"none"});
        style(p("LotteryTicketPurchase"),{position:"304px 4px 0px",width:"32px",height:"32px",margin:"0px"});
        style(p("LotteryPoolTabs"),{position:"28px 144px 0px",width:"838px",height:"48px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",zIndex:"5"});
        style(p("LotteryHeroCopy"),{position:"52px 245px 0px",width:"730px",height:"300px",zIndex:"3"});
        style(p("LotteryTitle"),{position:"0px 50px 0px",width:"720px",height:"60px",fontSize:"42px",color:"#efd58b",textShadow:"none"});
        style(p("LotteryTaglineBounds"),{position:"0px 124px 0px",width:"720px",height:"40px"});
        style(p("LotteryTagline"),{position:"0px 0px 0px",margin:"0px",width:"720px",height:"35px",transform:"none",fontSize:"22px",color:"#cbb9df",textShadow:"none"});
        style(p("LotteryGuaranteeRow"),{position:"0px 196px 0px",width:"720px"});
        style(p("LotteryUnlockNotice"),{position:"52px 553px 0px",width:"1140px",height:"42px",fontSize:"19px",color:"#d0b7e7",textShadow:"none"});
        style(p("LotteryCelestialFooter"),{position:"28px 678px 0px",width:"1224px",height:"94px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",backgroundColor:"#171024",borderTop:"1px solid #655079",zIndex:"5"});
        style(p("LHDetails"),{position:"12px 26px 0px",width:"150px",height:"40px"});
        style(p("LHHistory"),{position:"178px 26px 0px",width:"150px",height:"40px"});
        style(p("LotterySkipAnimation"),{position:"354px 29px 0px",width:"172px",height:"36px",margin:"0px"});
        style(p("LotteryDrawPity"),{position:"583px 6px 0px",width:"560px",height:"28px",margin:"0px",horizontalAlign:"left",verticalAlign:"top"});
        style(p("LotteryDrawPityCaptionBounds"),{position:"0px 0px 0px",width:"560px",height:"28px",margin:"0px",horizontalAlign:"left",verticalAlign:"top"});
        style(p("LotteryDrawPityCaption"),{position:"0px 0px 0px",width:"fit-children",maxWidth:"560px",height:"28px",minHeight:"28px",margin:"0px",padding:"0px",horizontalAlign:"center",verticalAlign:"top",fontSize:"18px",transform:"none",textShadow:"none"});
        style(p("LotterySingleButton"),{position:"588px 38px 0px",width:"268px",height:"48px"});
        style(p("LotteryTenButton"),{position:"888px 38px 0px",width:"268px",height:"48px"});
        style(p("LotteryStatus"),{position:"28px 634px 0px",width:"1224px",height:"28px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",fontSize:"19px",color:"#cbb8df",textShadow:"none"});
        style(p("LotteryResultStage"),{position:"28px 146px 0px",width:"1224px",height:"630px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",backgroundColor:"#100b21ef",zIndex:"6"});
        style(p("LotteryItemList"),{position:"20px 62px 0px",width:"1184px",height:"420px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",flowChildren:"none"});
        style(p("LotteryResultActions"),{position:"0px 548px 0px",width:"1224px",height:"62px",margin:"0px",horizontalAlign:"left",verticalAlign:"top"});
        compactCards(p("LotteryItemList"));
        ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm"].forEach(function(id){action(id,id==="LotteryTenButton"||id==="LotteryAgain");});
        ["LotterySingleCost","LotteryTenCost"].forEach(function(id){style(p(id),{visibility:"visible",width:"fit-children",height:"32px",minWidth:"24px",fontSize:"22px",color:"#efdfbc"});});
        ["LotteryPoolTabs","LotteryInfoTabs"].forEach(function(id){descendants(p(id),function(n){if(n.BHasClass("LotteryPoolBadge"))style(n,{visibility:"collapse"});});});
        styleInfoTabs();
    }
    function styleInfoTabs(){
        var host=p("LotteryInfoTabs");if(!valid(host))return;
        host.Children().forEach(function(tab){if(tab.BHasClass("LotteryPoolTab"))style(tab,{width:"286px",height:"40px",backgroundImage:"none",backgroundColor:tab.BHasClass("Selected")?"#56337d":"#21162f",border:"1px solid #64477b"});});
    }
    function info(name,options){
        options.width=1280;options.height=800;options.fit={reference:[1920,1080]};
        var win=options.panel;win.AddClass("LotteryInfoPurple");
        style(win,{width:"1280px",height:"800px",padding:"0px"});
        if(cfg.SurvivalPurpleShell)cfg.SurvivalPurpleShell.Adopt({id:"lottery_info",navId:"lottery",panel:win,title:name==="history"?"抽奖记录":"奖池详情",width:1280,height:800,onClose:function(){cfg.SurvivalLottery.CloseInfo();}});
        style(p("LotteryInfoHeader"),{position:"26px 134px 0px",width:"1200px",height:"36px",backgroundColor:"transparent"});
        style(p("LotteryInfoTitle"),{position:"0px 0px 0px",width:"1000px",height:"34px",fontSize:"24px",color:"#efcb7c",margin:"0px",horizontalAlign:"left",textAlign:"left"});
        ["LotteryInfoIcon","LotteryInfoClose","LotteryPoolSelection","LotteryPoolGuarantee"].forEach(function(id){style(p(id),{visibility:"collapse"});});
        style(p("LotteryInfoTabs"),{position:"26px 182px 0px",width:"1200px",height:"42px",margin:"0px"});
        styleInfoTabs();
        style(p("LotteryInfoBody"),{position:name==="history"?"26px 278px 0px":"26px 238px 0px",width:"1228px",height:name==="history"?"400px":"440px",backgroundImage:"none",backgroundColor:"transparent"});
        style(p("LotteryInfoList"),{position:"0px 0px 0px",width:"1228px",height:name==="history"?"400px":"440px",margin:"0px",padding:"8px 12px",flowChildren:name==="history"?"down":"right-wrap",overflow:"squish scroll"});
        style(p("LotteryInfoFooter"),{position:"26px 695px 0px",width:"1228px",height:"76px",backgroundColor:"transparent"});
        style(p("LotteryInfoRules"),{position:"0px 0px 0px",width:"980px",height:"70px",fontSize:"18px",whiteSpace:"normal",color:"#b5a3c6"});
        style(p("LotteryInfoNote"),{position:"28px 773px 0px",width:"1210px",height:"22px",margin:"0px",backgroundColor:"transparent",fontSize:"16px",color:"#aa98bb",whiteSpace:"nowrap",visibility:name==="reward"||name==="history"||name==="update"?"visible":"collapse"});
        style(p("RHHistoryColumns"),{position:"26px 238px 0px",width:"1228px",height:"26px",fontSize:"16px"});
        style(p("LotteryInfoConfirm"),{position:"1060px 12px 0px",width:"160px",height:"42px",margin:"0px"});
        action("LotteryInfoConfirm",true);
        compactCards(p("LotteryInfoList"));
    }
    var originalDialog,originalReward,dialogWrapper,rewardWrapper;
    if(R){
        originalDialog=R.LotteryDialog;originalReward=R.RewardCard;
        dialogWrapper=function(name,options){originalDialog(name,options);if(alive())info(name,options);};
        rewardWrapper=function(card,item){originalReward(card,item);
            if(!alive())return;
            if(valid(card.GetParent())&&card.GetParent().id==="LotteryInfoList"){
                var qty=Number(item.owned_count),known=item.owned_count!==undefined&&isFinite(qty);
                if(known&&qty>0){var badge=$.CreatePanel("Label",card,"");badge.AddClass("PurpleLotteryQuantity");badge.text="×"+qty;badge.hittest=false;}
                compactCards(card.GetParent(),card);styleInfoTabs();
            }
        };R.LotteryDialog=dialogWrapper;R.RewardCard=rewardWrapper;
    }
    var lottery=cfg.SurvivalLottery,originalFeature=lottery&&lottery.Feature,featureWrapper;
    if(originalFeature){featureWrapper=function(name){originalFeature(name);if(!alive())return;var modal=cfg.SurvivalUI.ModalManager.Get("lottery_info");if(modal&&modal.IsOpen()){compactCards(p("LotteryInfoList"));styleInfoTabs();action("LotteryInfoConfirm",true);}};lottery.Feature=featureWrapper;}
    ["ui_lottery_snapshot","ui_lottery_result","ui_lottery_exchange_result"].forEach(function(event){subscriptions.push(GameEvents.Subscribe(event,function(){if(alive())apply();}));});
    cfg.SurvivalPurpleLottery={Apply:apply,Info:info,Compact:compactCards,StyleTabs:styleInfoTabs,IsAlive:alive,Dispose:function(){
        if(disposed)return;disposed=true;
        subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];
        if(R&&R.LotteryDialog===dialogWrapper)R.LotteryDialog=originalDialog;
        if(R&&R.RewardCard===rewardWrapper)R.RewardCard=originalReward;
        if(lottery&&lottery.Feature===featureWrapper)lottery.Feature=originalFeature;
        if(valid(life))life.DeleteAsync(0);
    }};apply();
})();
