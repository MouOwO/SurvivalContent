(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), version = "1.0.2";
    if (cfg.SurvivalTooltipDismiss && cfg.SurvivalTooltipDismiss.version === version) return;
    var owners = [], blocked = null, job = null, epoch = 0;
    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function cursor() {
        if (!GameUI.GetCursorPosition) return null;
        var at = GameUI.GetCursorPosition();
        return at && isFinite(at[0]) && isFinite(at[1]) ? {x:Number(at[0]),y:Number(at[1])} : null;
    }
    function rect(panel, read) {
        if (!valid(panel)) return null;
        var value;
        if (read) value = read(panel);
        else if (panel.GetPositionWithinWindow) {
            var at = panel.GetPositionWithinWindow();
            // Owners with a CSS Fit transform supply getRect: positions already
            // include the transform, while native layout sizes do not.
            value = {x:at.x,y:at.y,width:panel.actuallayoutwidth,height:panel.actuallayoutheight};
        }
        if (!value || !isFinite(value.x) || !isFinite(value.y) || !(value.width > 0) || !(value.height > 0)) return null;
        return {x:Number(value.x),y:Number(value.y),width:Number(value.width),height:Number(value.height)};
    }
    function inside(at, box) {
        return !!at && !!box && at.x >= box.x && at.x < box.x+box.width && at.y >= box.y && at.y < box.y+box.height;
    }
    function release(at) {
        if (!blocked) return;
        if (!blocked.owner.alive()) { blocked=null; return; }
        var source=rect(blocked.anchor,blocked.owner.readRect) || blocked.anchorBox;
        if (at && !inside(at,blocked.box) && !inside(at,source)) blocked=null;
    }
    function cancelIdle() {
        if (blocked || owners.some(function (owner) { return owner.shown && owner.alive(); })) return;
        epoch++;
        if (job !== null && $.CancelScheduled) $.CancelScheduled(job);
        job=null;
    }
    function watch() {
        if (job !== null || !GameUI.GetCursorPosition) return;
        var serial=epoch;
        job=$.Schedule(.03,function () {
            if (serial!==epoch) return;
            job=null;
            var at=cursor();
            release(at);
            owners.slice().forEach(function (owner) {
                if (!owner.alive()) { owner.Dispose(); return; }
                if (owner.shown && owner.visible() && !owner.allowTooltipHover() && inside(at,rect(owner.surface,owner.readRect))) owner.Dismiss();
            });
            if (blocked || owners.some(function (owner) { return owner.shown && owner.alive() && owner.visible(); })) watch();
            else cancelIdle();
        });
    }
    function create(options) {
        var panel=options.panel, surface=options.surface || panel, dead=false, anchor=null;
        var owner={panel:panel,surface:surface,shown:false,readRect:options.getRect};
        owner.alive=function () { return !dead && valid(panel) && valid(surface) && (!options.isAlive || options.isAlive()); };
        owner.visible=function () { return owner.alive() && (options.isVisible ? options.isVisible() : panel.visible!==false); };
        owner.allowTooltipHover=function () { return !!(options.allowTooltipHover && options.allowTooltipHover()); };
        owner.CanShow=function (source) {
            if (!owner.alive()) return false;
            var at=cursor();
            release(at);
            // A real move to another reward must not inherit this owner's old
            // popup region. Keep other windows and nested source entries blocked.
            if (blocked && blocked.owner===owner && options.allowSourceSwitch && source!==blocked.anchor &&
                inside(at,rect(source,owner.readRect)) && !inside(at,rect(blocked.anchor,owner.readRect) || blocked.anchorBox)) {
                blocked=null;cancelIdle();
            }
            if (blocked && (inside(at,blocked.box) || inside(at,rect(blocked.anchor,blocked.owner.readRect) || blocked.anchorBox) || (!at && source===blocked.anchor))) return false;
            return true;
        };
        owner.SourceLeft=function (source) {
            if (!owner.alive() || !blocked || blocked.owner!==owner) return;
            var at=cursor();
            if (source) {
                if (source!==blocked.anchor || inside(at,rect(source,owner.readRect) || blocked.anchorBox)) return;
            } else if (inside(at,blocked.box)) return;
            blocked=null;cancelIdle();
        };
        owner.Shown=function (source) { if (!owner.alive()) return; anchor=source;owner.shown=true;watch(); };
        owner.Hidden=function () { owner.shown=false;anchor=null;cancelIdle(); };
        owner.Dismiss=function () {
            if (!owner.shown || !owner.visible()) return;
            blocked={owner:owner,anchor:anchor,anchorBox:rect(anchor,owner.readRect),box:rect(surface,owner.readRect)};
            owner.shown=false;anchor=null;
            options.hide();
            // A source leave may return before the next geometry watch. Drop
            // its old region immediately when the cursor already left both.
            release(cursor());
            watch();
        };
        owner.Dispose=function () {
            if (dead) return;
            dead=true;owner.shown=false;anchor=null;
            if (blocked && blocked.owner===owner) blocked=null;
            owners=owners.filter(function (entry) { return entry!==owner; });
            cancelIdle();
        };
        owners.push(owner);
        // Multiple renderers may share a surface (native and takeover ability
        // tooltips). Dispatch only to the visible renderer's current owner.
        surface.SetPanelEvent("onmouseover",function () {
            owners.slice().forEach(function (entry) { if (entry.surface===surface && !entry.allowTooltipHover()) entry.Dismiss(); });
        });
        return owner;
    }
    cfg.SurvivalTooltipDismiss={version:version,Create:create,Inspect:function () { return {version:version,owners:owners.length,watching:job!==null,blocked:!!blocked}; }};
})();
