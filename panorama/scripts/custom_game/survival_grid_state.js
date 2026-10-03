(function () {
    "use strict";
    var shared=GameUI.CustomUIConfig();
    function decode(source) {
        var f=String(source||"").split("|");
        if(f[0]!=="3" || f.length!==8) return null;
        var size=Number(f[1]),x=Number(f[2]),y=Number(f[3]),w=Number(f[4]),h=Number(f[5]),z=Number(f[6]);
        if(![size,x,y,w,h,z].every(isFinite) || size<=0 || w<1 || h<1 || w*h>65536
            || [x,y,w,h].some(function(v){return v!==Math.floor(v);})
            || f[7].length!==Math.ceil(w*h/2) || !/^[0-9a-f]+$/i.test(f[7])) return null;
        var states=[];
        for(var i=0;i<w*h;i++) {
            var state=(parseInt(f[7].charAt(Math.floor(i/2)),16) >> ((i%2)*2)) & 3;
            if(state===3) return null;
            states.push(state);
        }
        return {size:size,x:x,y:y,w:w,h:h,z:z,states:states};
    }
    function sample(atlas,x,y) {
        if(!atlas) return 0;
        var gx=Math.floor(x/atlas.size)-atlas.x,gy=Math.floor(y/atlas.size)-atlas.y;
        return gx>=0 && gx<atlas.w && gy>=0 && gy<atlas.h ? atlas.states[gx*atlas.h+gy] : 0;
    }
    function runs(atlas) {
        var result=[];
        for(var x=0;x<atlas.w;x++) {
            var start=-1;
            for(var y=0;y<=atlas.h;y++) {
                var red=y<atlas.h && atlas.states[x*atlas.h+y]===1;
                if(red && start<0) start=y;
                if(start>=0 && (!red || y-start>=8)) {
                    result.push([(atlas.x+x)*atlas.size,(atlas.y+start)*atlas.size,
                        (atlas.x+x+1)*atlas.size,(atlas.y+y)*atlas.size]);start=red?y:-1;
                }
            }
        }
        // Merge equal spans across adjacent columns, capped to 8x8 cells.
        // This keeps solid terrain cheap without giant offscreen clip panels.
        var merged=[],previous={};
        for(var i=0;i<result.length;i++) {
            var r=result[i],key=r[1]+":"+r[3],last=previous[key];
            if(last && last[2]===r[0] && r[2]-last[0]<=atlas.size*8) last[2]=r[2];
            else {merged.push(r);previous[key]=r;}
        }
        return merged;
    }
    // Intersect wedges at opposite vertices: one solid fill, four exact edges,
    // no translucent strip/triangle seams and no unsupported matrix transform.
    function wedge(center,a,b,width,height) {
        // Both clipping panels use the SAME SQUARE coordinate frame. This makes
        // pixel and normalized angles identical, including long terrain runs.
        var start=Math.atan2(a[0]-center[0],center[1]-a[1])*180/Math.PI;
        var end=Math.atan2(b[0]-center[0],center[1]-b[1])*180/Math.PI;
        var span=(end-start+360)%360;
        if(span>180) {start=end;span=360-span;}
        return "radial("+(100*center[0]/width).toFixed(6)+"% "+(100*center[1]/height).toFixed(6)+
            "%,"+start.toFixed(6)+"deg,"+span.toFixed(6)+"deg)";
    }
    function create(options) {
        var atlas=null,redRuns=[],terrain=[],foot=[],marks=[],dynamic=null,dynamicUntil=0;
        var dynamicRuns=[],dynamicPanels=[],dynamicRevision=0;
        var viewKey="",revision=0,footKey="",atlasSource="",drawKey="";
        var buildBounds=null,outsideRuns=[],outsidePanels=[],outsideZ=0,layoutKey="";
        var visibleWorld=null;
        var stats={terrain_builds:0,terrain_layouts:0,footprint_layouts:0,terrain_panels:0,footprint_panels:0};
        function newPanel(host,kind) {
            var p=$.CreatePanel("Panel",host,"");p.hittest=false;p.visible=false;
            p.AddClass("GridStateQuad");p.AddClass(kind);
            p.__fill=$.CreatePanel("Panel",p,"");p.__fill.hittest=false;p.__fill.AddClass("GridStateFill");
            return p;
        }
        function paint(panel,rect,z) {
            if(visibleWorld && (rect[2]<visibleWorld[0] || rect[0]>visibleWorld[2]
                || rect[3]<visibleWorld[1] || rect[1]>visibleWorld[3])) {
                if(panel.visible) panel.visible=false;
                return;
            }
            var points=[[rect[0],rect[1],z],[rect[2],rect[1],z],
                [rect[2],rect[3],z],[rect[0],rect[3],z]].map(options.project);
            if(points.some(function(p){return !p;})) {panel.visible=false;return;}
            var xs=points.map(function(p){return p[0];}),ys=points.map(function(p){return p[1];});
            var left=Math.min.apply(Math,xs),top=Math.min.apply(Math,ys),viewport=options.viewport();
            if(Math.max.apply(Math,xs)<0 || left>viewport[0] || Math.max.apply(Math,ys)<0 || top>viewport[1]) {
                panel.visible=false;return;
            }
            left=Math.floor(left);top=Math.floor(top);
            // A non-square clip frame skews the native radial edges. Keep the
            // projected vertices unchanged and only pad the invisible bounds.
            var side=Math.max(1,Math.ceil(Math.max.apply(Math,xs))-left,Math.ceil(Math.max.apply(Math,ys))-top);
            var width=side,height=side;
            points=points.map(function(p){return [p[0]-left,p[1]-top];});
            options.setStyle(panel,"position",left+"px "+top+"px 0px");
            options.setStyle(panel,"width",width+"px");options.setStyle(panel,"height",height+"px");
            options.setStyle(panel,"clip",wedge(points[0],points[1],points[3],width,height));
            options.setStyle(panel.__fill,"clip",wedge(points[2],points[1],points[3],width,height));
            panel.visible=true;
        }
        function staticSample(x,y) {
            if(buildBounds && (x<buildBounds.min_x || x>=buildBounds.max_x
                || y<buildBounds.min_y || y>=buildBounds.max_y)) return 1;
            return sample(atlas,x,y);
        }
        function configureLayout(layout) {
            if(!layout || !layout.bounds || !layout.build_bounds) return;
            var key=JSON.stringify(layout);if(key===layoutKey) return;
            layoutKey=key;buildBounds=layout.build_bounds;outsideZ=Number(layout.height)||0;
            var a=layout.bounds,b=buildBounds;
            outsideRuns=[
                [a.min_x,a.min_y,b.min_x,a.max_y],[b.max_x,a.min_y,a.max_x,a.max_y],
                [b.min_x,a.min_y,b.max_x,b.min_y],[b.min_x,b.max_y,b.max_x,a.max_y]
            ].filter(function(r){return r[2]>r[0] && r[3]>r[1];});
            revision++;footKey="";drawKey="";
            if(dynamic) rebuildDynamic();
        }
        function warm() {
            var next=options.cameraKey(),budget=24;
            if(next!==viewKey) {viewKey=next;revision++;footKey="";}
            var nextDraw=revision+":"+dynamicRevision;
            if(drawKey===nextDraw && terrain.length>=redRuns.length && dynamicPanels.length>=dynamicRuns.length) return;
            drawKey=nextDraw;
            // The whole non-buildable map is four static rectangles, not
            // hundreds of thousands of ocean cells. Clip only on camera change.
            while(outsidePanels.length<outsideRuns.length) outsidePanels.push(newPanel(options.terrainHost,"TerrainBlocked"));
            var visible=options.visibleBounds && options.visibleBounds();
            visibleWorld=visible;
            for(var k=0;k<outsidePanels.length;k++) {
                var outer=outsidePanels[k],r=outsideRuns[k];
                if(!r) {outer.visible=false;continue;}
                if(outer.__revision===revision) continue;
                var clipped=visible?[Math.max(r[0],visible[0]),Math.max(r[1],visible[1]),
                    Math.min(r[2],visible[2]),Math.min(r[3],visible[3])]:r;
                if(clipped[2]>clipped[0] && clipped[3]>clipped[1]) paint(outer,clipped,outsideZ+options.zOffset());
                else outer.visible=false;
                outer.__revision=revision;
            }
            while(terrain.length<redRuns.length && budget-->0) terrain.push(newPanel(options.terrainHost,"TerrainBlocked"));
            for(var i=0;i<terrain.length;i++) {
                var p=terrain[i];
                if(i>=redRuns.length) {p.visible=false;continue;}
                if(p.__revision===revision) continue;
                paint(p,redRuns[i],atlas.z+options.zOffset());p.__revision=revision;stats.terrain_layouts++;
            }
            stats.terrain_panels=terrain.length;
            if(dynamic) {
                while(dynamicPanels.length<dynamicRuns.length && budget-->0) dynamicPanels.push(newPanel(options.dynamicHost,"TerrainBlocked"));
                for(var j=0;j<dynamicPanels.length;j++) {
                    var p=dynamicPanels[j];
                    if(j>=dynamicRuns.length) {p.visible=false;continue;}
                    var key=revision+":"+dynamicRevision;
                    if(p.__revision===key) continue;
                    paint(p,dynamicRuns[j],dynamic.z+options.zOffset());p.__revision=key;
                }
            }
        }
        function update(world,profile,validation) {
            warm();
            if(!world || !profile) {hideFoot();return;}
            var size=options.cellSize(),nx=Number(profile.grid_footprint_x)||2,ny=Number(profile.grid_footprint_y)||2;
            var x0=world[0]-nx*size/2,y0=world[1]-ny*size/2,z=atlas?atlas.z:Number(world[2]);
            var exact={};
            if(validation && validation.cells) {
                var cells=validation.cells;
                for(var id in cells) if(cells.hasOwnProperty(id)) {
                    var c=cells[id];exact[Math.floor(Number(c.x)/size)+":"+Math.floor(Number(c.y)/size)]=Number(c.ok)===1?2:1;
                }
            }
            var states=[],now=Date.now();
            for(var x=0;x<nx;x++) for(var y=0;y<ny;y++) {
                var cx=x0+(x+0.5)*size,cy=y0+(y+0.5)*size;
                var key=Math.floor(cx/size)+":"+Math.floor(cy/size);
                var state=staticSample(cx,cy);
                var recent=dynamic && now<dynamicUntil ? sample(dynamic,cx,cy) : 0;
                if(state!==1 && recent) state=recent;
                if(exact.hasOwnProperty(key)) state=exact[key];
                states.push(state);
            }
            var key=[x0,y0,z,nx,ny,size,options.cameraKey(),states.join("")].join(":");
            if(key===footKey) return;
            footKey=key;
            while(foot.length<states.length) foot.push(newPanel(options.footHost,"FootprintTile"));
            for(var i=0;i<foot.length;i++) {
                var panel=foot[i];
                if(i>=states.length) {panel.visible=false;continue;}
                panel.SetHasClass("Blocked",states[i]===1);panel.SetHasClass("Clear",states[i]===2);
                panel.SetHasClass("Unknown",states[i]===0);
                var gx=Math.floor(i/ny),gy=i%ny;
                paint(panel,[x0+gx*size,y0+gy*size,x0+(gx+1)*size,y0+(gy+1)*size],z+options.zOffset());
            }
            stats.footprint_layouts++;stats.footprint_panels=foot.length;
            var corners=[[x0,y0,z],[x0+nx*size,y0,z],[x0+nx*size,y0+ny*size,z],[x0,y0+ny*size,z]];
            for(var m=0;m<4;m++) {
                var p=options.project([corners[m][0],corners[m][1],z+options.zOffset()]);
                var mark=marks[m];mark.visible=!!p;
                if(p) options.setStyle(mark,"position",(p[0]-4).toFixed(3)+"px "+(p[1]-4).toFixed(3)+"px 0px");
            }
        }
        function hideFoot() {
            footKey="";for(var i=0;i<foot.length;i++) foot[i].visible=false;
            for(var j=0;j<marks.length;j++) marks[j].visible=false;
        }
        function configure(source) {
            if(source===atlasSource && atlas) return true;
            var next=decode(source);if(!next) return false;
            atlasSource=source;atlas=next;redRuns=runs(atlas);revision++;viewKey="";footKey="";stats.terrain_builds++;
            if(dynamic) rebuildDynamic();
            return true;
        }
        function prewarm(count) {
            while(foot.length<Math.min(64,count)) foot.push(newPanel(options.footHost,"FootprintTile"));
            while(marks.length<4) {
                var p=$.CreatePanel("Panel",options.footHost,"");p.hittest=false;p.visible=false;p.AddClass("StaticGridMark");marks.push(p);
            }
        }
        function rebuildDynamic() {
            var next=dynamic;
            var overlay={size:next.size,x:next.x,y:next.y,w:next.w,h:next.h,z:next.z,states:next.states.slice()};
            for(var x=0;x<next.w;x++) for(var y=0;y<next.h;y++) {
                if(staticSample((next.x+x+0.5)*next.size,(next.y+y+0.5)*next.size)===1) overlay.states[x*next.h+y]=0;
            }
            dynamicRuns=runs(overlay);dynamicRevision++;
        }
        prewarm(16);
        return {configure:configure,warm:warm,update:update,hideFoot:hideFoot,stats:stats,
            prewarm:prewarm,configureLayout:configureLayout,
            ingestDynamic:function(source){
                var next=decode(source);if(!next) return;
                dynamic=next;dynamicUntil=Date.now()+1000;footKey="";
                rebuildDynamic();
            },
            ready:function(){return !!atlas;}};
    }
    shared.SurvivalGridState={decode:decode,sample:sample,runs:runs,wedge:wedge,create:create};
})();
