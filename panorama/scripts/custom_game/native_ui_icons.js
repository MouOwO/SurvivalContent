// Generated compatibility adapter; item assets live only in data/ui/item_resources.json.
(function(){"use strict";var cfg=GameUI.CustomUIConfig();
function resolve(value){var r=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(value);
    return r?{name:r.native_name||r.id,type:r.native_type||r.kind,uri:r.uri}:null;}
function create(parent,item,className){
    var p=cfg.SurvivalRewardPresentation,n=p&&p.CreateRegisteredIcon&&p.CreateRegisteredIcon(parent,item,className);
    if(n)return n;var r=resolve(item);if(!r)return null;
    n=$.CreatePanel("Image",parent,"");if(className)n.AddClass(className);
    n.SetImage(r.uri);cfg.SurvivalItemResources.FillIcon(n,item);n.hittest=false;n.hittestchildren=false;return n;
}
cfg.SurvivalNativeIcons={Resolve:resolve,Create:create};})();
