/* ST2 FramePack decorative layer only. No gameplay or data synchronization. */
(function () {
    var root = $.GetContextPanel();
    if (root && !root.BHasClass("Theme_ST2")) {
        root.AddClass("Theme_ST2");
    }
    $.Msg("[ST2_FRAMEPACK] decorative theme enabled");
})();
