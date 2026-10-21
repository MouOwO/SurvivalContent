(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig(),view=cfg.ArchiveHandoff,entries=(cfg.SurvivalItemResources?cfg.SurvivalItemResources.Rows():[]).map(function(row){
        return {item_id:row.id,category_id:row.category_id||"items",display_name:row.name,
            runtime_uri:row.uri,display_width:84,display_height:84};
    });
    var originalIcon=view.Icon,originalInit=view.Init,originalObserve=view.Observe,index={},trial,caption,trialCategory;
    var names={shadow:'虚空之影',points:'积分道具',fragment:'神兵碎片',pet:'秘法牢笼',friend:'我的好基友',ex:'我的前女友',wife:'我的老婆',beast:'瑞兽赐福',fishing:'钓鱼存档',building:'存档神器',shop:'商店道具'};
    var categories=[],category='shadow',page=0,grid,heading,pageText,previousPage,nextPage;
    entries.forEach(function(row){index[row.category_id+':'+row.item_id]=row;});
    entries.forEach(function(row){if(categories.indexOf(row.category_id)<0)categories.push(row.category_id);});
    function label(parent,text,cls){var p=$.CreatePanel('Label',parent,'');p.AddClass(cls);p.text=text;p.hittest=false;return p;}
    function fillIcon(icon,item){var shared=cfg.SurvivalRewardPresentation||cfg.SurvivalItemResources;if(shared&&shared.FillIcon)return shared.FillIcon(icon,item);if(icon&&icon.SetScaling)icon.SetScaling('stretch-to-cover-preserve-aspect');return icon;}
    function image(parent,row){
        if(row.category_id==='endless'){
            return cfg.SurvivalRewardPresentation.CreateRegisteredIcon(parent,row.item_id,'ArchiveRewardIcon');
        }
        var p=$.CreatePanel('Image',parent,'');p.AddClass('ArchiveRewardIcon');
        // 64px full-body textures lose the face at the native card size.
        p.SetImage(row.runtime_uri||'file://{images}/'+row.icon_path);fillIcon(p,row.item_id);p.hittest=false;p.hittestchildren=false;
        if(row.portrait){var v=row.portrait,s=(parent.__archiveDisplayWidth||row.display_width)/v[2];parent.AddClass('ArchivePortraitViewport');p.style.width=s+'px';p.style.height=s+'px';p.style.position=(-v[0]*s)+'px '+(-v[1]*s)+'px 0px';}
        if(row.tone_color){
            // Keep the artwork's identity; the shared theme owns its quiet frame.
            parent.AddClass('ArchiveToneArt');
            if(row.tint_icon)p.style.washColor=(row.category_id==='clear'||row.category_id==='endless')?cfg.SurvivalArchiveColors.achievement_tint:row.tone_color;
        }
        return p;
    }
    function action(parent,id,text,callback){var b=$.CreatePanel('Button',parent,id);b.AddClass('ArchiveArtTrialAction');label(b,text,'ArchiveArtTrialActionText');b.SetPanelEvent('onactivate',callback);return b;}
    function selectedRows(){return entries.filter(function(row){return row.category_id===category;});}
    function renderTrial(){
        var rows=selectedRows(),pages=Math.max(1,Math.ceil(rows.length/8));page=Math.max(0,Math.min(page,pages-1));
        heading.text='图标试览 · '+(names[category]||category)+' · '+rows.length+' 项';
        pageText.text=(page+1)+' / '+pages;grid.RemoveAndDeleteChildren();
        previousPage.enabled=page>0;nextPage.enabled=page<pages-1;
        previousPage.SetHasClass('Disabled',!previousPage.enabled);nextPage.SetHasClass('Disabled',!nextPage.enabled);
        rows.slice(page*8,page*8+8).forEach(function(row){
            var unit=$.CreatePanel('Panel',grid,'');unit.AddClass('ArchiveArtTrialUnit');
            var card=$.CreatePanel('Panel',unit,'');card.AddClass('ArchiveArtTrialCard');
            var art=$.CreatePanel('Panel',card,'');art.AddClass('ArchiveArt');
            art.style.width='72px';art.style.height='56px';art.__archiveDisplayWidth=72;image(art,row);
            label(card,row.display_name,'ArchiveArtTrialName');
            if(cfg.SurvivalUI&&cfg.SurvivalUI.Tooltip)cfg.SurvivalUI.Tooltip.Bind(card,{title:row.display_name,body:row.description||'属性以当前游戏配置为准'});
        });
    }
    function changeCategory(step){var i=categories.indexOf(category);category=categories[(i+step+categories.length)%categories.length];page=0;renderTrial();}
    view.Icon=function(parent,item,category,buildings){
        var resources=cfg.SurvivalItemResources,presentation=cfg.SurvivalRewardPresentation;
        if(resources&&resources.Lookup(item)&&presentation&&presentation.CreateRegisteredIcon){
            var common=$.CreatePanel('Panel',parent,'');common.AddClass('ArchiveArt');common.hittest=false;
            if(presentation.CreateRegisteredIcon(common,item,'ArchiveRewardIcon')){
                var fragment=category==='fragment',social=['friend','ex','wife','beast'].indexOf(category)>=0,collection=category==='fishing'||category==='work';
                common.style.width=fragment?'128px':social?'96px':collection?'88px':'84px';common.style.height=fragment?'112px':social?'96px':collection?'88px':'84px';
                if(category==='points'){
                    var tier=String(item.quality||'').toUpperCase();
                    if(['N','R','SR','SSR','UR'].indexOf(tier)>=0){var rarity=label(common,tier,'ArchiveRarityBadge');rarity.AddClass('ArchiveRarity_'+tier);}
                }
                label(parent,view.CardProgress(item,category),'ArchiveCount');return;
            }
            common.DeleteAsync(0);
        }
        if(category==='building' && buildings && buildings[item.id]) {
            var artifact=$.CreatePanel('Panel',parent,'');artifact.AddClass('ArchiveArt');artifact.AddClass('ArchiveArtifactArt');artifact.hittest=false;
            var original=$.CreatePanel('Image',artifact,'');original.AddClass('ArchiveRewardIcon');original.AddClass('ArchiveNativeArtifactIcon');
            original.SetImage('file://{images}/items/'+String(buildings[item.id]).replace(/^item_/,'')+'.png');
            fillIcon(original,item);original.hittest=false;original.hittestchildren=false;
            parent.AddClass('ArchiveArtifactCard');label(parent,view.CardProgress(item,category),'ArchiveCount');return;
        }
        var row=index[category+':'+item.id];
        if(!row){var result=originalIcon.call(view,parent,item,category,buildings);return result;}
        var art=$.CreatePanel('Panel',parent,'');art.AddClass('ArchiveArt');art.hittest=false;
        var fragment=category==='fragment',social=category==='friend'||category==='ex'||category==='wife'||category==='beast';
        var collection=category==='fishing'||category==='work';
        var rewardArt=row.art_status==='generated_reward_v5';
        if(rewardArt)parent.AddClass('ArchiveRewardV5Card');
        if(collection)parent.AddClass('ArchiveCollectionCard');
        if(category==='work')parent.AddClass('ArchiveWorkCard');
        if(social)parent.AddClass('ArchiveSocialPortraitCard');
        art.style.width=fragment?'128px':social?'96px':collection?'88px':rewardArt?'84px':'72px';art.style.height=fragment?'112px':social?'96px':collection?'88px':rewardArt?'84px':'56px';art.__archiveDisplayWidth=fragment?128:social?96:collection?88:rewardArt?84:72;
        image(art,row);
        if(category==='points'){
            var q=String(item.quality||'').toUpperCase();
            if(['N','R','SR','SSR','UR'].indexOf(q)>=0){
                var badge=label(art,q,'ArchiveRarityBadge');badge.AddClass('ArchiveRarity_'+q);
            }
        }
        // Retain the real server count / target and the existing badge formatter.
        label(parent,view.CardProgress(item,category),'ArchiveCount');

    };
    view.Observe=function(data){
        originalObserve.call(view,data);
        if(trial&&trial.visible&&data.category_id!==trialCategory){trial.visible=false;caption.text='图标试览';}
    };
    view.OpenPreview=function(){if(trial){trial.visible=true;category=view.snapshot&&view.snapshot.category_id||categories[0];page=0;renderTrial();}};
    view.ClosePreview=function(){if(trial)trial.visible=false;};
    view.Init=function(){
        originalInit.call(view);
        var content=$.GetContextPanel().FindChildTraverse('ArchiveContent');
        var toggle=$.CreatePanel('Button',content,'ArchiveArtTrialToggle');
        caption=label(toggle,'图标试览','ArchiveArtTrialToggleText');toggle.visible=false;toggle.hittest=false;
        trial=$.CreatePanel('Panel',content,'ArchiveArtTrial');trial.visible=false;
        heading=label(trial,'','ArchiveArtTrialHeading');
        label(trial,'美术试览不表示持有。悬停查看配置说明；每页 8 项。','ArchiveArtTrialHint');
        var nav=$.CreatePanel('Panel',trial,'ArchiveArtTrialNav');
        action(nav,'ArchiveArtPreviousCategory','上一分类',function(){changeCategory(-1);});
        action(nav,'ArchiveArtNextCategory','下一分类',function(){changeCategory(1);});
        grid=$.CreatePanel('Panel',trial,'ArchiveArtTrialGrid');
        var footer=$.CreatePanel('Panel',trial,'ArchiveArtTrialFooter');
        previousPage=action(footer,'ArchiveArtPreviousPage','上一页',function(){page--;renderTrial();});
        pageText=label(footer,'','ArchiveArtTrialPageText');
        nextPage=action(footer,'ArchiveArtNextPage','下一页',function(){page++;renderTrial();});
        toggle.SetPanelEvent('onactivate',function(){view.Hide();trialCategory=view.snapshot&&view.snapshot.category_id;trial.visible=!trial.visible;caption.text=trial.visible?'返回存档':'图标试览';if(trial.visible){category=categories.indexOf(trialCategory)>=0?trialCategory:categories[0];page=0;renderTrial();}else grid.RemoveAndDeleteChildren();});
    };
})();
