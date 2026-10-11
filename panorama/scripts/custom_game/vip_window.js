(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),U=cfg.SurvivalUI,M=cfg.SurvivalMenuV10;
    if(cfg.SurvivalVIP&&cfg.SurvivalVIP.Dispose)cfg.SurvivalVIP.Dispose();
    else if(cfg.SurvivalVIP&&cfg.SurvivalVIP.Close)cfg.SurvivalVIP.Close();
    if(!M)return;
    var catalog=cfg.VIPRewardCatalog||{rewards:[]},previewSteamID='76561198104787442';
    var group='privileges',selected='',snapshot=null,states={},busy=false,requestSerial=0;
    var disposed=false,subscriptions=[],profileSubscription=null,view=null,tipAnchor=null;
    var windowPanel=null,viewDirty=true,statusMessage='';
    var groups=[['privileges','等级特权'],['medals','VIP勋章'],['packages','专属礼包']];
    function valid(panel){return panel&&(!panel.IsValid||panel.IsValid());}
    function p(id){if(!valid(root))return null;var panel=root.FindChildTraverse(id);return valid(panel)?panel:null;}
    function active(){return !disposed&&valid(root)&&valid(windowPanel);}
    function style(panel,values){if(valid(panel))Object.keys(values).forEach(function(key){panel.style[key]=values[key];});}
    function preview(){
        if(!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var player=Game.GetPlayerInfo(Game.GetLocalPlayerID());
        return !!player&&String(player.player_steamid)===previewSteamID;
    }
    function available(){
        var profile=CustomNetTables.GetTableValue('survival_player_public_profiles',String(Game.GetLocalPlayerID()))||{};
        return preview()||profile.vip_badge===true||Number(profile.vip_badge)===1;
    }
    var shell;
    windowPanel=p('VIPWindow');
    function close(){hideTooltip();if(view)view.Close();}
    view=M.Adopt({id:'vip',navId:'vip',panel:p('VIPWindow'),root:root,scrim:p('VIPScrim'),title:'VIP特权',onClose:close});
    shell=view.shell;
    function label(parent,id,text,cls){var node=$.CreatePanel('Label',parent,id);node.text=text;node.hittest=false;if(cls)node.AddClass(cls);return node;}
    function yuan(fen){var n=Number(fen)||0;return n%100===0?String(n/100):(n/100).toFixed(2);}
    function threshold(level){var all=catalog.recharge_levels||[];for(var i=0;i<all.length;i++)if(all[i].level===level)return all[i].required_recharge_fen;return 0;}
    function rows(){return catalog.rewards.filter(function(r){return r.group_id===group;});}
    function current(){var all=rows();for(var i=0;i<all.length;i++)if(all[i].reward_id===selected)return all[i];return all[0];}
    function state(row){return states[row.reward_id]||{};}
    function owned(row){return Number(state(row).owned)===1;}
    function actionable(row){return !!snapshot&&snapshot.ok===true&&!busy&&Number(snapshot.pending)!==1&&!owned(row)&&Number(state(row).eligible)===1&&
        (row.group_id==='privileges'||row.group_id==='packages'&&Number(state(row).affordable)===1);}
    function hideTooltip(){
        if(valid(tipAnchor))tipAnchor.RemoveClass('VIPHovered');tipAnchor=null;
        if(view)view.TooltipHide();var tip=p('VIPTooltip');if(tip)tip.AddClass('ArchiveHidden');
    }
    function note(row){return row.reward_id==='vip_package_10'?'木材加成作用于已有伤害产木收益':row.medal_id?'礼包与附赠勋章属性同时生效':row.group_id==='privileges'?'永久生效 · 各级累计':'永久生效 · 每项仅获得一次';}
    function showTooltip(row,card){
        if(!active()||!shell.IsOpen()||!valid(card))return;
        hideTooltip();tipAnchor=card;card.AddClass('VIPHovered');
        p('VIPTooltipName').text=row.display_name;
        p('VIPTooltipState').text=!snapshot||snapshot.ok!==true?'会员数据尚未同步':owned(row)?'已获得':Number(state(row).eligible)===1?'尚未获得':'未满足获得条件';
        p('VIPTooltipCondition').text=row.condition||'';
        p('VIPTooltipPrice').text=row.group_id==='packages'?'价格  '+row.price+' 付费币':row.group_id==='privileges'?'达标后免费领取':'随对应礼包附送';
        p('VIPTooltipEffect').text=String(row.description||'暂无效果说明').split('；').join('\n');
        p('VIPTooltipNote').text=note(row);
        view.TooltipShow({name:row.display_name,state:p('VIPTooltipState').text,condition:row.condition||'',description:p('VIPTooltipEffect').text+'\n\n'+note(row),metric:'获得方式',quantity:p('VIPTooltipPrice').text},card);
    }
    function prepareV10(){
        var win=p('VIPWindow');win.AddClass('VIPV10Page');win.RemoveClass('VIPPurple');
        ['VIPHeader','VIPBody'].forEach(function(id){style(p(id),{visibility:'collapse'});});
        ['VIPGrid','VIPWallet','VIPRechargeProgress'].forEach(function(id){view.Move(p(id),view.content);});
        M.Place(p('VIPWallet'),0,0,1113,27);style(p('VIPWallet'),{margin:'0px',padding:'0px',fontSize:'18px',color:'#d1badd',height:'27px'});
        M.Place(p('VIPRechargeProgress'),0,31,1113,27);style(p('VIPRechargeProgress'),{margin:'0px',padding:'0px',fontSize:'17px',color:'#c0acda',height:'27px'});
        M.Place(p('VIPGrid'),0,70,1113,540);style(p('VIPGrid'),{padding:'0px',margin:'0px',flowChildren:'none',overflow:'squish scroll',horizontalAlign:'left',verticalAlign:'top',backgroundImage:'none',backgroundColor:'transparent'});
        view.Move(p('VIPDetailTitle'),view.actions);view.Move(p('VIPAction'),view.actions);
        M.Place(p('VIPDetailTitle'),0,12,870,32);style(p('VIPDetailTitle'),{fontSize:'21px',color:'#ebc97e',margin:'0px'});
        M.Place(p('VIPAction'),889,8,206,38);style(p('VIPAction'),{margin:'0px',padding:'0px'});
        var tip=p('VIPTooltip')||$.CreatePanel('Panel',win.GetParent(),'VIPTooltip');tip.AddClass('ArchiveHidden');tip.style.visibility='collapse';tip.hittest=false;tip.hittestchildren=false;tip.RemoveAndDeleteChildren();
        ['VIPTooltipName','VIPTooltipState','VIPTooltipCondition','VIPTooltipPrice','VIPTooltipEffect','VIPTooltipNote'].forEach(function(id){label(tip,id,'');});
        view.SetSidebar(groups.map(function(g){return {id:g[0],label:g[1]};}),group,function(id){if(!active())return;group=id;selected='';render();});
    }
    function request(action,row){
        if(!active())return;
        if(action!=='view'&&!shell.IsOpen())return;
        if(action!=='view'&&(!row||!actionable(row)))return;
        if(action!=='view'){busy=true;statusMessage='';}
        var token=++requestSerial;
        GameEvents.SendCustomGameEventToServer('survival_vip_request',{action:action,reward_id:row?row.reward_id:''});
        if(busy)render();
        $.Schedule(8,function(){if(!active()||token!==requestSerial)return;busy=false;
            statusMessage=snapshot?'请求尚未确认，请稍后刷新':'奖励预览 · 会员数据尚未同步';
            viewDirty=true;render();});
    }
    function renderDetails(row){
        if(!row)return;
        p('VIPDetailTitle').text=row.display_name;
        p('VIPCondition').text=row.condition;
        var effects=row.description.split('；'),half=Math.ceil(effects.length/2);
        p('VIPEffectsLeft').text=effects.slice(0,half).join('\n');
        p('VIPEffectsRight').text=effects.slice(half).join('\n');
        p('VIPDetailNote').text=note(row);
        var text='';
        if(owned(row))text=row.group_id==='packages'?'已购买':'已获得';
        else if(busy||snapshot&&Number(snapshot.pending)===1)text='正在保存…';
        else if(row.group_id==='medals')text='购买对应礼包赠送';
        else if(!snapshot||snapshot.ok!==true)text='等待会员数据';
        else if(Number(state(row).eligible)!==1)text=row.group_id==='privileges'?'需达到VIP'+row.level:'需开通VIP';
        else if(row.group_id==='packages'&&Number(state(row).affordable)!==1)text='付费币不足';
        else text=row.group_id==='privileges'?'免费领取':'购买 · '+row.price+' 付费币';
        p('VIPActionText').text=text;p('VIPAction').enabled=actionable(row);
        style(p('VIPAction'),{backgroundImage:'url("'+cfg.ArchiveV10Data.assets[actionable(row)?'filter_selected':'filter_default'].file+'")',backgroundSize:'100% 100%',backgroundColor:'transparent',border:'0px',opacity:actionable(row)?'1':'.58'});
        style(p('VIPActionText'),{color:actionable(row)?'#f5d88d':'#a393b4',fontSize:'19px',fontWeight:'normal',width:'100%',height:'38px',margin:'0px',padding:'0px',textAlign:'center',textOverflow:'clip'});
        p('VIPAction').SetPanelEvent('onactivate',function(){request(row.group_id==='privileges'?'claim':'purchase',row);});
    }
    function render(){
        if(!active())return;
        // Public profile checkpoints and action responses can arrive while this
        // window is closed. Cache their state without rebuilding hidden cards.
        if(!shell.IsOpen()){viewDirty=true;return;}
        hideTooltip();
        var list=rows(),row=current();if(row)selected=row.reward_id;
        p('VIPGrid').RemoveAndDeleteChildren();
        list.forEach(function(item){
            var button=$.CreatePanel('Button',p('VIPGrid'),'VIPCard_'+item.reward_id);button.AddClass('VIPRewardCard');
            button.SetHasClass('VIPOwned',owned(item));button.SetHasClass('VIPSelected',item.reward_id===selected);
            view.DecorateCell(button,{index:list.indexOf(item),name:item.display_name,count:Number(item.level)>0?'V'+item.level:undefined,icon:'file://{images}/custom_game/topnav_reference_v2/vip.svg'});
            button.hittestchildren=false;
            button.SetPanelEvent('onactivate',function(){selected=item.reward_id;render();});
            button.SetPanelEvent('onmouseover',function(){showTooltip(item,button);});
            button.SetPanelEvent('onmouseout',hideTooltip);
        });
        for(var i=0;i<groups.length;i++)p('VIPTab_'+groups[i][0]).SetHasClass('VIPTabSelected',groups[i][0]===group);
        view.SetSelected(group);view.SetTitle(group==='privileges'?'等级特权':group==='medals'?'VIP勋章':'专属礼包');
        p('VIPGroupTitle').text=group==='privileges'?'等级礼包 · 免费领取 · 属性累计':group==='medals'?'专属勋章 · 随礼包赠送':'专属礼包 · 使用商城付费币购买';
        p('VIPRechargeProgress').text=snapshot&&snapshot.ok===true?'累计充值 '+yuan(snapshot.recharge_total_fen)+' 元'+(snapshot.level>=12?' · 已达最高等级':' · 距VIP'+(snapshot.level+1)+'还差 '+yuan(Math.max(0,threshold(snapshot.level+1)-(Number(snapshot.recharge_total_fen)||0)))+' 元'):'VIP等级按累计充值解锁 · 消费不降级';
        p('VIPWallet').text=snapshot&&snapshot.ok===true?'当前 VIP'+snapshot.level+'    商城付费币 '+snapshot.balance:'当前等级 —    商城付费币 —';
        p('VIPStatus').text=busy?'正在保存奖励，请稍候':snapshot&&snapshot.ok===true?'已获得的奖励点亮显示 · 永久生效':'奖励预览 · 会员数据尚未同步';
        renderDetails(row);
        if(statusMessage)p('VIPStatus').text=statusMessage;
        view.SetStatus(p('VIPStatus').text);
        viewDirty=false;
    }
    p('VIPSidebar').RemoveAndDeleteChildren();
    groups.forEach(function(g,i){
        var tab=$.CreatePanel('Button',p('VIPSidebar'),'VIPTab_'+g[0]);tab.AddClass('VIPTab');tab.style.position='0px '+(i*54)+'px 0px';tab.hittestchildren=false;
        var icon=$.CreatePanel('Image',tab,'');icon.SetImage('file://{images}/custom_game/topnav_reference_v2/vip.svg');icon.hittest=false;
        label(tab,'',g[1]);tab.SetPanelEvent('onactivate',function(){group=g[0];selected='';render();});
    });
    function refresh(){if(!active())return;viewDirty=true;if(!shell.IsOpen())return;if(!available()){close();return;}render();}
    function open(){if(!active()||!available())return false;view.Open();if(viewDirty)render();request('view');return true;}
    function registerToolsProbe(){
        if(!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var probe=cfg.SurvivalClientCallbackProbe;
        if(!probe||!probe.RegisterModule)return false;
        return probe.RegisterModule('vip',[
            {name:'refresh',get:function(){return refresh;},set:function(fn){refresh=fn;}},
            {name:'render',get:function(){return render;},set:function(fn){render=fn;}}
        ],Number(cfg.HandoffGeneration||0));
    }
    cfg.SurvivalVIP={IsAvailable:function(){return active()&&available();},IsPreview:preview,IsOpen:function(){return active()&&shell.IsOpen();},Open:open,Close:close,
        Toggle:function(){if(!active())return;if(shell.IsOpen())close();else open();},Refresh:function(){refresh();if(active()&&shell.IsOpen())request('view');},RegisterToolsProbe:registerToolsProbe,
        Dispose:function(){if(disposed)return;disposed=true;requestSerial++;close();subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];if(profileSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(profileSubscription);profileSubscription=null;if(view&&view.Dispose)view.Dispose();}};
    $.RegisterEventHandler('Cancelled',p('VIPWindow'),function(){
        var layers=cfg.SurvivalUILayers;
        if(layers&&typeof layers.HandleEscape==='function')return layers.HandleEscape('vip');
        close();return true;
    });
    profileSubscription=CustomNetTables.SubscribeNetTableListener('survival_player_public_profiles',function(_,key){if(active()&&String(key)===String(Game.GetLocalPlayerID()))refresh();});
    subscriptions.push(GameEvents.Subscribe('survival_vip_tools_preview',function(){if(active()&&preview())open();}));
    subscriptions.push(GameEvents.Subscribe('survival_vip_snapshot',function(data){
        if(!active())return;
        requestSerial++;busy=false;
        if(data.ok===true){snapshot=data;states={};var incoming=data.rows||{};Object.keys(incoming).forEach(function(key){var row=incoming[key];states[row.id]=row;});}
        statusMessage=data.action_result&&data.action_result.ok===false&&data.action_result.error?data.action_result.error:
            data.ok!==true?data.error||'会员数据暂不可用':'';
        viewDirty=true;render();
    }));
    prepareV10();close();refresh();
    registerToolsProbe();
    if(Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){
        if(!cfg.VIPRewardCommandsRegistered){
            Game.AddCommand('survival_vip_rewards_open',function(){cfg.SurvivalVIP.Open();},'Open current VIP rewards window',0);
            Game.AddCommand('survival_vip_rewards_close',function(){cfg.SurvivalVIP.Close();},'Close current VIP rewards window',0);
            cfg.VIPRewardCommandsRegistered=true;
        }
    }
    $.Msg('[VIP_WINDOW_READY] rewards='+catalog.rewards.length+' available='+available()+' preview='+preview());
})();
