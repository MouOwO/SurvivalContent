(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),previous=cfg.SurvivalEndlessLeaderboard;
    if(previous&&previous.Dispose)previous.Dispose();
    var disposed=false,visible=false,host=null,body=null,pinned=null,scroll=null,footer=null,empty=null;
    var cells=[],revision="",rows=[],selfSteam="",contentKey="",assembly=null,requestId="",serial=0,timeout=null;
    var renderCount=0,patchCount=0,requestCount=0,subscription=null;
    function valid(node){return node&&(!node.IsValid||node.IsValid());}
    function alive(){return !disposed&&valid(root);}
    function position(node,x,y,w,h){node.style.position=x+"px "+y+"px 0px";node.style.width=w+"px";node.style.height=h+"px";}
    function make(type,parent,id,cls){var node=$.CreatePanel(type,parent,id);if(cls)node.AddClass(cls);return node;}
    function label(parent,id,text,x,y,w,h,cls){var node=make("Label",parent,id,"EndlessLeaderboardText "+(cls||""));node.text=text;node.hittest=false;position(node,x,y,w,h);return node;}
    function setText(node,text){text=String(text);if(node.text!==text){node.text=text;patchCount++;}}
    function integer(value,max){if(value===null||value===undefined||value===""||typeof value==="boolean")return null;var number=Number(value);return isFinite(number)&&number>=0&&number===Math.floor(number)&&number<=max?number:null;}
    function steam(value){return typeof value==="string"&&/^\d{17}$/.test(value)&&value>="76561197960265729"&&value<="76561202255233023"?value:"";}
    function localSteam(){var player=Game.GetPlayerInfo&&Game.GetPlayerInfo(Game.GetLocalPlayerID());return selfSteam||steam(player&&player.player_steamid);}
    function cancelTimeout(){if(timeout!==null&&$.CancelScheduled)$.CancelScheduled(timeout);timeout=null;}
    function ownRank(){var id=localSteam();if(!id)return 0;for(var i=0;i<rows.length;i++)if(rows[i].steam_id===id)return rows[i].rank;return 0;}
    function status(message){if(!valid(footer))return;var rank=ownRank(),text=rank?"您的排名：第 "+rank+" 名":"您未上榜";if(message)text+="  ·  "+message;setText(footer,text);}
    function rowCell(rank){
        if(cells[rank-1]&&valid(cells[rank-1].panel))return cells[rank-1];
        var parent=rank<=3?pinned:scroll,index=rank<=3?rank-1:rank-4;
        var panel=make("Panel",parent,"EndlessLeaderboardRow_"+rank,"EndlessLeaderboardRow");panel.hittest=false;panel.hittestchildren=false;position(panel,0,index*54,747,52);
        if(rank<=3)panel.AddClass("EndlessLeaderboardPodium");
        var rankText=label(panel,"EndlessLeaderboardRank_"+rank,String(rank),0,11,55,30,"EndlessLeaderboardRank");
        var avatar=make("DOTAAvatarImage",panel,"EndlessLeaderboardAvatar_"+rank,"EndlessLeaderboardAvatar");position(avatar,62,5,42,42);avatar.hittest=false;
        var name=make("DOTAUserName",panel,"EndlessLeaderboardName_"+rank,"EndlessLeaderboardPlayer");position(name,118,10,190,32);name.hittest=false;
        var fallbackName=label(panel,"EndlessLeaderboardFallbackName_"+rank,"玩家资料待同步",118,11,190,30,"EndlessLeaderboardPlayer");fallbackName.visible=false;
        var vipHost=make("Panel",panel,"EndlessLeaderboardVIP_"+rank,"EndlessLeaderboardVIP");position(vipHost,312,9,60,32);vipHost.visible=false;vipHost.hittest=false;
        var medal=label(panel,"EndlessLeaderboardMedal_"+rank,"",377,14,48,24,"EndlessLeaderboardMedal");medal.visible=false;
        var floor=label(panel,"EndlessLeaderboardFloor_"+rank,"",436,11,137,30,"EndlessLeaderboardNumber");
        var score=label(panel,"EndlessLeaderboardScore_"+rank,"",577,11,151,30,"EndlessLeaderboardNumber");
        return cells[rank-1]={panel:panel,rank:rankText,avatar:avatar,name:name,fallbackName:fallbackName,vipHost:vipHost,medal:medal,floor:floor,score:score,steam:null,own:null,vip:null,medalLevel:null};
    }
    function applyRows(){
        if(!valid(host))return;var currentSelf=localSteam(),key=JSON.stringify([rows,currentSelf]);
        if(key===contentKey)return;contentKey=key;renderCount++;
        rows.forEach(function(row){var cell=rowCell(row.rank);if(!cell.panel.visible)cell.panel.visible=true;
            if(cell.steam!==row.steam_id){cell.avatar.steamid=row.steam_id||"0";cell.name.steamid=row.steam_id||"0";cell.name.visible=!!row.steam_id;cell.fallbackName.visible=!row.steam_id;cell.steam=row.steam_id;patchCount+=2;}
            var own=!!currentSelf&&row.steam_id===currentSelf;if(cell.own!==own){cell.panel.SetHasClass("EndlessLeaderboardOwn",own);cell.own=own;patchCount++;}
            if(cell.vip!==row.vip_level){cell.vipHost.visible=row.vip_level>0;if(cfg.SurvivalVIPBadges)cfg.SurvivalVIPBadges.Render(cell.vipHost,row.vip_level,{width:60,height:32});cell.vip=row.vip_level;patchCount++;}
            if(cell.medalLevel!==row.vip_medal_level){cell.medal.visible=row.vip_medal_level>0;setText(cell.medal,row.vip_medal_level>0?"勋 "+row.vip_medal_level:"");cell.medalLevel=row.vip_medal_level;patchCount++;}
            setText(cell.floor,row.best_floor);setText(cell.score,row.endless_score);
        });
        cells.forEach(function(cell,index){if(index>=rows.length&&cell.panel.visible)cell.panel.visible=false;});
        empty.visible=rows.length===0;empty.text="暂无无尽通关记录";status("");
    }
    function mount(parent){
        if(!alive()||!valid(parent))return false;
        if(valid(host)){if(host.GetParent()!==parent)host.SetParent(parent);return true;}
        host=make("Panel",parent,"EndlessLeaderboardHost","EndlessLeaderboardHost");position(host,0,0,767,577);host.hittest=false;host.hittestchildren=true;
        body=make("Panel",host,"EndlessLeaderboardColumns","EndlessLeaderboardColumns");position(body,0,0,747,34);body.hittest=false;
        label(body,"EndlessLeaderboardRankTitle","排名",0,4,55,26,"EndlessLeaderboardHeading");
        label(body,"EndlessLeaderboardPlayerTitle","玩家",118,4,310,26,"EndlessLeaderboardHeading");
        label(body,"EndlessLeaderboardFloorTitle","无尽层数",436,4,137,26,"EndlessLeaderboardHeading EndlessLeaderboardNumber");
        label(body,"EndlessLeaderboardScoreTitle","无尽积分",577,4,151,26,"EndlessLeaderboardHeading EndlessLeaderboardNumber");
        pinned=make("Panel",host,"EndlessLeaderboardPinned","EndlessLeaderboardPinned");position(pinned,0,42,747,162);pinned.hittest=false;pinned.hittestchildren=false;
        var divider=make("Panel",host,"EndlessLeaderboardDivider","EndlessLeaderboardDivider");position(divider,0,213,747,1);divider.hittest=false;
        scroll=make("Panel",host,"EndlessLeaderboardScroll","EndlessLeaderboardScroll");position(scroll,0,223,767,307);scroll.hittest=true;scroll.hittestchildren=true;
        empty=label(host,"EndlessLeaderboardEmpty",revision?"暂无无尽通关记录":"正在读取排行榜…",0,250,747,38,"EndlessLeaderboardEmpty");
        footer=label(host,"EndlessLeaderboardFooter","正在读取排行榜…",0,545,747,28,"EndlessLeaderboardFooter");
        host.visible=visible;contentKey="";if(revision)applyRows();return true;
    }
    function show(parent){if(!mount(parent))return;visible=true;host.visible=true;}
    function hide(){visible=false;if(valid(host))host.visible=false;}
    function finish(){assembly=null;requestId="";cancelTimeout();}
    function fail(message){finish();if(revision)status(message||"排行榜暂时不可用");else if(valid(empty)){empty.visible=true;setText(empty,message||"排行榜暂时不可用，请重新打开重试");setText(footer,"排名暂未同步");}}
    function receive(data){
        if(!alive()||!data||String(data.request_id||"")!==requestId||!requestId)return;
        var phase=data.phase;
        if(phase==="error"){fail("排行榜暂时不可用，请重新打开重试");return;}
        if(phase==="unchanged"){
            if(!revision||String(data.revision||"")!==revision){fail("排行榜版本校验失败，请重新打开重试");return;}
            selfSteam=steam(data.self_steam_id)||selfSteam;finish();applyRows();status("");return;
        }
        if(phase==="begin"){
            var total=integer(data.total,100),nextRevision=String(data.revision||"");
            if(total===null||!nextRevision||nextRevision.length>160){fail("排行榜数据校验失败");return;}
            assembly={total:total,revision:nextRevision,rows:{},steam:{},self:steam(data.self_steam_id)};return;
        }
        if(!assembly||String(data.revision||"")!==assembly.revision)return;
        if(phase==="row"){
            var source=data.row||data,rank=integer(source.rank,100),id=steam(source.steam_id),entry=String(source.entry_id||id),floor=integer(source.best_floor,9007199254740991),score=integer(source.endless_score,9007199254740991);
            var vip=source.vip_level===undefined?0:integer(source.vip_level,12),medal=source.vip_medal_level===undefined?0:integer(source.vip_medal_level,10);
            if(!rank||rank>assembly.total||(!id&&!/^[a-fA-F0-9-]{36}$/.test(entry))||floor===null||score===null||vip===null||medal===null||assembly.rows[rank]||assembly.steam[entry]||(id&&assembly.steam[id])){fail("排行榜数据校验失败");return;}
            assembly.rows[rank]={rank:rank,entry_id:entry,steam_id:id,best_floor:floor,endless_score:score,vip_level:vip,vip_medal_level:medal};assembly.steam[entry]=true;if(id)assembly.steam[id]=true;return;
        }
        if(phase==="end"){
            var next=[];for(var i=1;i<=assembly.total;i++){if(!assembly.rows[i]){fail("排行榜数据尚未完整，请重新打开重试");return;}next.push(assembly.rows[i]);}
            rows=next;revision=assembly.revision;selfSteam=steam(data.self_steam_id)||assembly.self||selfSteam;finish();applyRows();status("");
        }
    }
    function open(){
        if(!alive())return;cancelTimeout();assembly=null;requestId="leaderboard_"+Date.now()+"_"+(++serial);requestCount++;
        if(!revision&&valid(empty)){empty.visible=true;setText(empty,"正在读取排行榜…");setText(footer,"正在读取排行榜…");}
        timeout=$.Schedule(15,function(){timeout=null;if(alive()&&requestId)fail("读取超时，请重新打开排行榜重试");});
        GameEvents.SendCustomGameEventToServer("survival_leaderboard_request",{request_id:requestId,known_revision:revision});
    }
    subscription=GameEvents.Subscribe("survival_leaderboard_result",receive);
    cfg.SurvivalEndlessLeaderboard={Mount:mount,Show:show,Hide:hide,Open:open,
        Inspect:function(){return {revision:revision,pending:!!requestId,visible:visible,total:rows.length,selfRank:ownRank(),renderCount:renderCount,patchCount:patchCount,requestCount:requestCount,rowPanelCount:cells.length,rows:rows.slice()};},
        Dispose:function(){if(disposed)return;disposed=true;cancelTimeout();if(GameEvents.Unsubscribe&&subscription!==null)GameEvents.Unsubscribe(subscription);if(valid(host))host.DeleteAsync(0);host=null;cells=[];}
    };
})();
