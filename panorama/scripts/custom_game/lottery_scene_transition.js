(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    if (cfg.LotterySceneTransition) cfg.LotterySceneTransition.Close();
    var pools = ["map", "cultivation", "dragon_knight", "summer"];
    var selected = null, width = 0, height = 0, alternateFade = false;
    function panel(id) { return $("#" + id); }
    function valid(node) { return node && (!node.IsValid || node.IsValid()); }
    function position(animate) {
        var track = panel("LotterySceneTrack");
        if (!valid(track)) return;
        // Native transitions retarget from the currently rendered position.
        // A three-page jump still takes 0.2 seconds, rather than three slides.
        track.style.transitionDuration = animate ? "0.2s" : "0s";
        track.style.transform = "translate3d(" + (-(selected || 0) * width) + "px,0px,0px)";
    }
    function clearFade() {
        var canvas = panel("LotteryMainCanvas");
        if (!valid(canvas)) return;
        canvas.RemoveClass("LotteryPoolFadeA");
        canvas.RemoveClass("LotteryPoolFadeB");
    }
    cfg.LotterySceneTransition = {
        Resize: function (w, h) {
            if (!(w > 0 && h > 0 && isFinite(w) && isFinite(h))) return;
            var track = panel("LotterySceneTrack");
            if (!valid(track) || (w === width && h === height)) return;
            width = w; height = h;
            track.style.width = (width * pools.length) + "px";
            track.style.height = height + "px";
            pools.forEach(function (id) {
                var page = panel("LotteryScenePage_" + id);
                if (valid(page)) { page.style.width = width + "px"; page.style.height = height + "px"; }
            });
            // Resizing must not animate through incorrectly sized pages.
            position(false);
        },
        Select: function (poolId) {
            var next = pools.indexOf(poolId);
            if (next < 0) next = 0;
            if (next === selected) return; // Snapshot refreshes must not restart a switch.
            var root = panel("LotteryWindow"), canvas = panel("LotteryMainCanvas");
            var animate = selected !== null && width > 0 && height > 0 &&
                valid(root) && !root.BHasClass("LotteryClosed");
            selected = next;
            position(animate);
            if (animate && valid(canvas)) {
                // Alternating identical native keyframes restarts a fade on
                // rapid clicks without a JS timer or a forced layout pass.
                alternateFade = !alternateFade;
                canvas.SetHasClass("LotteryPoolFadeA", alternateFade);
                canvas.SetHasClass("LotteryPoolFadeB", !alternateFade);
            } else clearFade();
        },
        Close: function () { clearFade(); position(false); }
    };
})();
