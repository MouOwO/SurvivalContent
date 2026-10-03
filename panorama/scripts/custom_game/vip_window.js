(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),U=cfg.SurvivalUI;
    var catalog=cfg.VIPRewardCatalog||{rewards:[]},previewSteamID='76561198104787442';
    var group='privileges',selected='',snapshot=null,states={},busy=false,requestSerial=0;
    var groups=[['privileges','等级特权'],['medals','VIP勋章'],['packages','专属礼包']];
    function p(id){return root.FindChildTraverse(id);}
    function preview(){
        if(!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var player=Game.GetPlayerInfo(Game.GetLocalPlayerID());
        return !!player&&String(player.player_steamid)===previewSteamID;
    }
    function available(){
        var profile=CustomNetTables.GetTableValue('survival_player_public_profiles',String(Game.GetLocalPlayerID()))||{};
        return preview()||profile.vip_badge===true||Number(profile.vip_badge)===1;
    }
    if(cfg.SurvivalVIP&&cfg.SurvivalVIP.Close)cfg.SurvivalVIP.Close();
    var shell;
    function close(){if(shell)shell.Close();}
    shell=U.ModalShell.Adopt({id:'vip',panel:p('VIPWindow'),root:root,scrim:p('VIPScrim'),header:p('VIPHeader'),
        titlePanel:p('VIPTitle'),closeButton:p('VIPClose'),width:869,height:816,fit:{reference:[1672,941]},onClose:close});
    cfg.ReferenceWindows.Apply(p('VIPWindow'),p('VIPHeader'),p('VIPClose'));
    p('VIPTitle').style.fontSize='32px';p('VIPTitle').style.fontFamily='"Source Han Serif SC"';p('VIPTitle').style.color='#eed8a7';
    function label(parent,id,text,cls){var node=$.CreatePanel('Label',parent,id);node.text=text;node.hittest=false;if(cls)node.AddClass(cls);return node;}
    function yuan(fen){var n=Number(fen)||0;return n%100===0?String(n/100):(n/100).toFixed(2);}
    function threshold(level){var all=catalog.recharge_levels||[];for(var i=0;i<all.length;i++)if(all[i].level===level)return all[i].required_recharge_fen;return 0;}
    function rows(){return catalog.rewards.filter(function(r){return r.group_id===group;});}
    function current(){var all=rows();for(var i=0;i<all.length;i++)if(all[i].reward_id===selected)return all[i];return all[0];}
    function state(row){return states[row.reward_id]||{};}
    function owned(row){return Number(state(row).owned)===1;}
    function actionable(row){return !!snapshot&&snapshot.ok===true&&!busy&&Number(snapshot.pending)!==1&&!owned(row)&&Number(state(row).eligible)===1&&
        (row.group_id==='privileges'||row.group_id==='packages'&&Number(state(row).affordable)===1);}
    function request(action,row){
        if(action!=='view'&&(!row||!actionable(row)))return;
        if(action!=='view')busy=true;
        var token=++requestSerial;
        GameEvents.SendCustomGameEventToServer('survival_vip_request',{action:action,reward_id:row?row.reward_id:''});
        if(busy){render();p('VIPStatus').text='正在保存奖励，请稍候';}
        $.Schedule(8,function(){if(token!==requestSerial)return;busy=false;if(shell.IsOpen()){
            render();p('VIPStatus').text=snapshot?'请求尚未确认，请稍后刷新':'奖励预览 · 会员数据尚未同步';
        }});
    }
    function renderDetails(row){
        if(!row)return;
        p('VIPDetailTitle').text=row.display_name;
        p('VIPCondition').text=row.condition;
        var effects=row.description.split('；'),half=Math.ceil(effects.length/2);
        p('VIPEffectsLeft').text=effects.slice(0,half).join('\n');
        p('VIPEffectsRight').text=effects.slice(half).join('\n');
        p('VIPDetailNote').text=row.reward_id==='vip_package_10'?'木材加成作用于已有伤害产木收益':row.medal_id?'礼包与附赠勋章属性同时生效':row.group_id==='privileges'?'永久生效 · 各级累计':'永久生效 · 每项仅获得一次';
        var text='';
        if(owned(row))text=row.group_id==='packages'?'已购买':'已获得';
        else if(busy||snapshot&&Number(snapshot.pending)===1)text='正在保存…';
        else if(row.group_id==='medals')text='购买对应礼包赠送';
        else if(!snapshot||snapshot.ok!==true)text='等待会员数据';
        else if(Number(state(row).eligible)!==1)text=row.group_id==='privileges'?'需达到VIP'+row.level:'需开通VIP';
        else if(row.group_id==='packages'&&Number(state(row).affordable)!==1)text='付费币不足';
        else text=row.group_id==='privileges'?'免费领取':'购买 · '+row.price+' 付费币';
        p('VIPActionText').text=text;p('VIPAction').enabled=actionable(row);
        p('VIPAction').SetPanelEvent('onactivate',function(){request(row.group_id==='privileges'?'claim':'purchase',row);});
    }
    function render(){
        var list=rows(),row=current();if(row)selected=row.reward_id;
        p('VIPGrid').RemoveAndDeleteChildren();
        list.forEach(function(item){
            var button=$.CreatePanel('Button',p('VIPGrid'),'VIPCard_'+item.reward_id);button.AddClass('VIPRewardCard');
            button.SetHasClass('VIPOwned',owned(item));button.SetHasClass('VIPSelected',item.reward_id===selected);
            var emblem=$.CreatePanel('Image',button,'');emblem.AddClass('VIPRewardIcon');emblem.hittest=false;
            emblem.SetImage('file://{images}/custom_game/topnav_reference_v2/vip.svg');
            label(button,'',item.level?'V'+item.level:'礼','VIPRewardRank');
            label(button,'',item.display_name,'VIPRewardName');
            var status=owned(item)?'已获得':item.group_id==='packages'?item.price+' 付费币':item.group_id==='medals'?'礼包赠送':
                Number(state(item).eligible)===1?'可免费领取':'累计 '+yuan(threshold(item.level))+' 元';
            label(button,'',status,'VIPRewardState');
            button.SetPanelEvent('onactivate',function(){selected=item.reward_id;render();});
        });
        for(var i=0;i<groups.length;i++)p('VIPTab_'+groups[i][0]).SetHasClass('VIPTabSelected',groups[i][0]===group);
        p('VIPGroupTitle').text=group==='privileges'?'等级礼包 · 免费领取 · 属性累计':group==='medals'?'专属勋章 · 随礼包赠送':'专属礼包 · 使用商城付费币购买';
        p('VIPRechargeProgress').text=snapshot&&snapshot.ok===true?'累计充值 '+yuan(snapshot.recharge_total_fen)+' 元'+(snapshot.level>=12?' · 已达最高等级':' · 距VIP'+(snapshot.level+1)+'还差 '+yuan(Math.max(0,threshold(snapshot.level+1)-(Number(snapshot.recharge_total_fen)||0)))+' 元'):'VIP等级按累计充值解锁 · 消费不降级';
        p('VIPWallet').text=snapshot&&snapshot.ok===true?'当前 VIP'+snapshot.level+'    商城付费币 '+snapshot.balance:'当前等级 —    商城付费币 —';
        p('VIPStatus').text=busy?'正在保存奖励，请稍候':snapshot&&snapshot.ok===true?'已获得的奖励点亮显示 · 永久生效':'奖励预览 · 会员数据尚未同步';
        renderDetails(row);
    }
    p('VIPSidebar').RemoveAndDeleteChildren();
    groups.forEach(function(g,i){
        var tab=$.CreatePanel('Button',p('VIPSidebar'),'VIPTab_'+g[0]);tab.AddClass('VIPTab');tab.style.position='0px '+(i*68)+'px 0px';
        var icon=$.CreatePanel('Image',tab,'');icon.SetImage('file://{images}/custom_game/topnav_reference_v2/vip.svg');icon.hittest=false;
        label(tab,'',g[1]);tab.SetPanelEvent('onactivate',function(){group=g[0];selected='';render();});
    });
    function refresh(){if(!available()&&shell.IsOpen())close();render();}
    function open(){if(!available())return false;refresh();shell.Open();request('view');return true;}
    cfg.SurvivalVIP={IsAvailable:available,IsPreview:preview,IsOpen:shell.IsOpen,Open:open,Close:close,
        Toggle:function(){if(shell.IsOpen())close();else open();},Refresh:function(){refresh();if(shell.IsOpen())request('view');}};
    $.RegisterEventHandler('Cancelled',p('VIPWindow'),close);
    CustomNetTables.SubscribeNetTableListener('survival_player_public_profiles',function(_,key){if(String(key)===String(Game.GetLocalPlayerID()))refresh();});
    GameEvents.Subscribe('survival_vip_tools_preview',function(){if(preview())open();});
    GameEvents.Subscribe('survival_vip_snapshot',function(data){
        requestSerial++;busy=false;
        if(data.ok===true){snapshot=data;states={};var incoming=data.rows||{};Object.keys(incoming).forEach(function(key){var row=incoming[key];states[row.id]=row;});}
        render();if(data.action_result&&data.action_result.ok===false&&data.action_result.error)p('VIPStatus').text=data.action_result.error;
        else if(data.ok!==true)p('VIPStatus').text=data.error||'会员数据暂不可用';
    });
    close();refresh();
    if(Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){
        if(!cfg.VIPRewardCommandsRegistered){
            Game.AddCommand('survival_vip_rewards_open',function(){cfg.SurvivalVIP.Open();},'Open current VIP rewards window',0);
            Game.AddCommand('survival_vip_rewards_close',function(){cfg.SurvivalVIP.Close();},'Close current VIP rewards window',0);
            cfg.VIPRewardCommandsRegistered=true;
        }
    }
    $.Msg('[VIP_WINDOW_READY] rewards='+catalog.rewards.length+' available='+available()+' preview='+preview());
})();
