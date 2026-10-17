(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig();
    function valid(node){return node&&(!node.IsValid||node.IsValid());}
    function level(value){var n=Number(value);return value!==null&&value!==""&&typeof value!=="boolean"&&isFinite(n)&&n===Math.floor(n)&&n>=1&&n<=12?n:0;}
    function resolve(item){var id=String(item&&(item.reward_id||item.id)||""),match=/^vip_(?:privilege|medal|package)_0?(\d+)$/.exec(id);return match?level(match[1]):0;}
    function rect(node,x,y,w,h){node.style.position=x+"px "+y+"px 0px";node.style.width=w+"px";node.style.height=h+"px";node.style.margin="0px";node.style.padding="0px";}
    function render(parent,value,options){
        if(!valid(parent))return null;options=options||{};var n=level(value),badge=parent.__survivalVIPBadge;
        if(!n){if(badge&&valid(badge.host))badge.host.visible=false;return null;}
        var w=Number(options.width)||74,h=Number(options.height)||74;
        if(!badge||!valid(badge.host)){
            var host=$.CreatePanel("Panel",parent,options.id||"");host.hittest=false;host.hittestchildren=false;
            var art=$.CreatePanel("Image",host,"");art.SetImage("file://{images}/custom_game/topnav_reference_v2/vip.svg");art.SetScaling("stretch-to-fit-preserve-aspect");art.hittest=false;
            var number=$.CreatePanel("Label",host,"");number.hittest=false;number.style.fontFamily='"Source Han Sans SC"';number.style.fontWeight="bold";number.style.color="#f2d38e";number.style.textAlign="left";number.style.textOverflow="shrink";number.style.textShadow="#000000 0px 1px 2px 1.0";
            badge=parent.__survivalVIPBadge={host:host,image:art,number:number,key:""};
        }
        var key=[n,w,h,Number(options.x)||0,Number(options.y)||0].join(":");badge.host.visible=true;
        if(badge.key!==key){rect(badge.host,Number(options.x)||0,Number(options.y)||0,w,h);rect(badge.image,0,0,w*.67,h);rect(badge.number,w*.66,h*.24,w*.34,h*.55);badge.number.style.fontSize=Math.floor(Math.min(h*.43,w*.33/(String(n).length*.58)))+"px";badge.number.text=String(n);badge.key=key;}
        return badge;
    }
    cfg.SurvivalVIPBadges={Level:level,Resolve:resolve,Render:render};
})();
