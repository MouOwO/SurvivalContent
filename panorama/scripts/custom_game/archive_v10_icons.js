// Generated compatibility adapter; no archive-only item icon overrides.
(function(){"use strict";var cfg=GameUI.CustomUIConfig();
cfg.ArchiveV10Icons={Resolve:function(item,category){
    var row=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item);if(!row)return null;
    return {uri:row.uri,fit:row.fit||(row.kind==="image"||row.kind==="hero"?"cover":"contain"),sourceSize:(row.source_size||[84,84]).slice(),
        iconKey:row.id+":"+row.uri,name:row.name};
}};})();
