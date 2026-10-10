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
    function clipPolygon(points,distance) {
        if(!points.length) return points;
        var result=[],previous=points[points.length-1],before=distance(previous);
        for(var i=0;i<points.length;i++) {
            var current=points[i],after=distance(current);
            if((before>=0)!==(after>=0)) {
                var t=before/(before-after);
                result.push([previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t]);
            }
            if(after>=0) result.push(current);
            previous=current;before=after;
        }
        return result;
    }
    function clipViewport(points,viewport) {
        points=clipPolygon(points,function(p){return p[0];});
        points=clipPolygon(points,function(p){return viewport[0]-p[0];});
        points=clipPolygon(points,function(p){return p[1];});
        return clipPolygon(points,function(p){return viewport[1]-p[1];});
    }
    function tidyPolygon(points) {
        var clean=[];
        for(var i=0;i<points.length;i++) {
            var p=points[i],last=clean[clean.length-1];
            if(!last || Math.abs(p[0]-last[0])+Math.abs(p[1]-last[1])>1e-6) clean.push(p);
        }
        if(clean.length>1 && Math.abs(clean[0][0]-clean[clean.length-1][0])+
            Math.abs(clean[0][1]-clean[clean.length-1][1])<1e-6) clean.pop();
        for(var j=clean.length-1;j>=0 && clean.length>=3;j--) {
            var a=clean[(j+clean.length-1)%clean.length],b=clean[j],c=clean[(j+1)%clean.length];
            if(Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))<1e-7) clean.splice(j,1);
        }
        return clean;
    }
    function runIndex(rects,bucketSize) {
        var buckets={},bounds=null,size=Math.max(512,Number(bucketSize)||512);
        for(var i=0;i<rects.length;i++) {
            var r=rects[i];
            if(!bounds) bounds=r.slice();
            else bounds=[Math.min(bounds[0],r[0]),Math.min(bounds[1],r[1]),Math.max(bounds[2],r[2]),Math.max(bounds[3],r[3])];
            for(var x=Math.floor(r[0]/size);x<=Math.floor(r[2]/size);x++)
                for(var y=Math.floor(r[1]/size);y<=Math.floor(r[3]/size);y++) {
                    var key=x+":"+y;if(!buckets[key]) buckets[key]=[];buckets[key].push(i);
                }
        }
        return {buckets:buckets,bounds:bounds,size:size,rects:rects};
    }
    function visibleRuns(index,visible) {
        if(!index || !index.bounds) return [];
        var b=index.bounds,r=visible?[Math.max(visible[0],b[0]),Math.max(visible[1],b[1]),
            Math.min(visible[2],b[2]),Math.min(visible[3],b[3])]:b;
        var seen={},selected=[];
        if(r[2]<r[0] || r[3]<r[1]) return selected;
        for(var x=Math.floor(r[0]/index.size);x<=Math.floor(r[2]/index.size);x++)
            for(var y=Math.floor(r[1]/index.size);y<=Math.floor(r[3]/index.size);y++) {
                var ids=index.buckets[x+":"+y]||[];
                for(var i=0;i<ids.length;i++) {
                    var id=ids[i],q=index.rects[id];
                    if(seen[id] || q[2]<r[0] || q[0]>r[2] || q[3]<r[1] || q[1]>r[3]) continue;
                    seen[id]=true;selected.push(id);
                }
            }
        return selected;
    }
    function create(options) {
        var atlas=null,redRuns=[],terrain=[],foot=[],marks=[],dynamic=null,dynamicUntil=0;
        var dynamicRuns=[],dynamicPanels=[],dynamicRevision=0,dynamicSource="";
        var viewKey="",revision=0,footKey="",atlasSource="",drawKey="";
        var buildBounds=null,outsideRuns=[],outsidePanels=[],outsideZ=0,layoutKey="";
        var visibleWorld=null,range=null,rangeKey="",rangeEdges=[];
        var terrainIndex=runIndex([]),dynamicIndex=runIndex([]),lastTerrain=[],lastDynamic=[],terrainVersion=0;
        var stats={terrain_builds:0,terrain_layouts:0,footprint_layouts:0,terrain_panels:0,footprint_panels:0,terrain_candidates:0,
            dynamic_decodes:0,dynamic_builds:0,dynamic_reuses:0};
        function newPanel(host,kind) {
            var p=$.CreatePanel("Panel",host,"");p.hittest=false;p.visible=false;
            p.AddClass("GridStateQuad");p.AddClass(kind);
            p.__fill=$.CreatePanel("Panel",p,"");p.__fill.hittest=false;p.__fill.AddClass("GridStateFill");
            p.__clips=[p,p.__fill];
            return p;
        }
        function refreshRange() {
            var next=options.range && options.range();
            if(!next || !isFinite(next.x) || !isFinite(next.y) || !(next.radius>0) || !isFinite(next.radius)) next=null;
            var key=next?[next.x,next.y,next.radius].join(":"):"";
            if(key===rangeKey) return false;
            rangeKey=key;range=next;rangeEdges=[];
            if(next) {
                // An inscribed polygon avoids a full-viewport opacity mask.
                // The inner radius also identifies rectangles requiring no clip.
                for(var i=0;i<32;i++) {
                    var angle=(i+0.5)*Math.PI/16;
                    rangeEdges.push([Math.cos(angle),Math.sin(angle),next.radius*Math.cos(Math.PI/32)]);
                }
            }
            return true;
        }
        function rangeRelation(rect) {
            if(!range) return 1;
            var nearX=Math.max(rect[0]-range.x,0,range.x-rect[2]);
            var nearY=Math.max(rect[1]-range.y,0,range.y-rect[3]);
            if(nearX*nearX+nearY*nearY>range.radius*range.radius) return 0;
            var farX=Math.max(Math.abs(rect[0]-range.x),Math.abs(rect[2]-range.x));
            var farY=Math.max(Math.abs(rect[1]-range.y),Math.abs(rect[3]-range.y));
            var inner=range.radius*Math.cos(Math.PI/32);
            return farX*farX+farY*farY<=inner*inner?1:2;
        }
        function paint(panel,rect,z,clipRange) {
            if(visibleWorld && (rect[2]<visibleWorld[0] || rect[0]>visibleWorld[2]
                || rect[3]<visibleWorld[1] || rect[1]>visibleWorld[3])) {
                if(panel.visible) panel.visible=false;
                return;
            }
            // This bound can move with buffered coverage without changing the
            // camera. Use it only to reject candidates: cropping a cached run
            // here would leave holes when that coverage window expands again.
            // Exact circle/viewport clipping below supplies all actual edges.
            var r=rect;
            var relation=clipRange?rangeRelation(r):1;
            if(relation===0) {panel.visible=false;return;}
            var points=[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
            if(relation===2) for(var edge=0;edge<rangeEdges.length && points.length;edge++) {
                var e=rangeEdges[edge];
                points=clipPolygon(points,function(p){return e[2]-e[0]*(p[0]-range.x)-e[1]*(p[1]-range.y);});
            }
            if(points.length<3) {panel.visible=false;return;}
            var world=points.map(function(p){return [p[0],p[1],z];}),viewport=options.viewport();
            // Homogeneous clipping preserves the visible part when one world
            // corner crosses the camera plane, before perspective division.
            points=options.projectPolygon?options.projectPolygon(world):world.map(options.project);
            if(!points || points.some(function(p){return !p || !isFinite(p[0]) || !isFinite(p[1]);})) {
                panel.visible=false;return;
            }
            points=tidyPolygon(clipViewport(points,viewport));
            if(points.length<3) {panel.visible=false;return;}
            var xs=points.map(function(p){return p[0];}),ys=points.map(function(p){return p[1];});
            var left=Math.max(0,Math.floor(Math.min.apply(Math,xs))),top=Math.max(0,Math.floor(Math.min.apply(Math,ys)));
            // A non-square clip frame skews the native radial edges. Keep the
            // projected vertices unchanged and only pad the invisible bounds.
            // Viewport clipping bounds every render target even at extreme zoom.
            var side=Math.max(1,Math.min(viewport[0],Math.ceil(Math.max.apply(Math,xs)))-left,
                Math.min(viewport[1],Math.ceil(Math.max.apply(Math,ys)))-top);
            var width=side,height=side;
            points=points.map(function(p){return [p[0]-left,p[1]-top];});
            options.setStyle(panel,"position",left+"px "+top+"px 0px");
            options.setStyle(panel,"width",width+"px");options.setStyle(panel,"height",height+"px");
            // Each nested wedge supplies two polygon edges. Only the deepest
            // panel paints, so clipping introduces no translucent overlap seams.
            var count=Math.ceil(points.length/2),clips=panel.__clips;
            while(clips.length<count) {
                var previous=clips[clips.length-1];
                options.setStyle(previous,"backgroundColor","#00000000");
                var child=$.CreatePanel("Panel",previous,"");child.hittest=false;child.AddClass("GridStateFill");
                options.setStyle(child,"overflow","clip");clips.push(child);
            }
            for(var i=0;i<clips.length;i++) {
                var vertex=i*2;
                // Panorama does not clear an existing radial primitive for
                // "none" (a rect clip is additive, too). Replace unused layers
                // with a full radial sweep so old polygon edges cannot remain.
                options.setStyle(clips[i],"clip",i<count?wedge(points[vertex],points[(vertex+1)%points.length],
                    points[(vertex+points.length-1)%points.length],width,height):"radial(50% 50%,0deg,360deg)");
            }
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
            var camera=options.cameraKey(),next=camera+":"+(options.coverageKey?options.coverageKey():""),budget=24;
            if(next!==viewKey) {viewKey=next;revision++;footKey="";}
            if(refreshRange()) revision++;
            var nextDraw=revision+":"+dynamicRevision;
            if(drawKey===nextDraw && terrain.length>=redRuns.length && dynamicPanels.length>=dynamicRuns.length) return;
            drawKey=nextDraw;
            // The non-buildable map uses four rectangles. Reclip their visible
            // portions only when the camera or placement range changes.
            while(outsidePanels.length<outsideRuns.length) outsidePanels.push(newPanel(options.terrainHost,"TerrainBlocked"));
            var visible=options.visibleBounds && options.visibleBounds();
            visibleWorld=visible;
            if(range) {
                var circleBounds=[range.x-range.radius,range.y-range.radius,range.x+range.radius,range.y+range.radius];
                visible=visible?[Math.max(visible[0],circleBounds[0]),Math.max(visible[1],circleBounds[1]),
                    Math.min(visible[2],circleBounds[2]),Math.min(visible[3],circleBounds[3])]:circleBounds;
            }
            for(var k=0;k<outsidePanels.length;k++) {
                var outer=outsidePanels[k],r=outsideRuns[k];
                if(!r) {outer.visible=false;continue;}
                if(outer.__revision===revision) continue;
                var clipped=visible?[Math.max(r[0],visible[0]),Math.max(r[1],visible[1]),
                    Math.min(r[2],visible[2]),Math.min(r[3],visible[3])]:r;
                if(clipped[2]>clipped[0] && clipped[3]>clipped[1]) paint(outer,clipped,outsideZ+options.zOffset(),true);
                else outer.visible=false;
                outer.__revision=revision;
            }
            while(terrain.length<redRuns.length && budget-->0) terrain.push(newPanel(options.terrainHost,"TerrainBlocked"));
            var candidates=visibleRuns(terrainIndex,visible),wanted={};
            stats.terrain_candidates=candidates.length;
            for(var c=0;c<candidates.length;c++) wanted[candidates[c]]=true;
            for(var t=0;t<lastTerrain.length;t++) {
                var old=lastTerrain[t];if(!wanted[old] && terrain[old]) terrain[old].visible=false;
            }
            for(var i=0;i<candidates.length;i++) {
                var id=candidates[i],p=terrain[id];if(!p) continue;
                var paintKey=camera+":"+terrainVersion+":"+(rangeRelation(redRuns[id])===1?"inside":rangeKey);
                if(p.__paintKey!==paintKey) {
                    paint(p,redRuns[id],atlas.z+options.zOffset(),true);p.__paintKey=paintKey;p.__paintVisible=p.visible;stats.terrain_layouts++;
                } else p.visible=p.__paintVisible;
            }
            lastTerrain=candidates;
            stats.terrain_panels=terrain.length;
            if(dynamic) {
                while(dynamicPanels.length<dynamicRuns.length && budget-->0) dynamicPanels.push(newPanel(options.dynamicHost,"TerrainBlocked"));
                var selected=visibleRuns(dynamicIndex,visible),dynamicWanted={};
                for(var s=0;s<selected.length;s++) dynamicWanted[selected[s]]=true;
                for(var d=0;d<lastDynamic.length;d++) {
                    var old=lastDynamic[d];if(!dynamicWanted[old] && dynamicPanels[old]) dynamicPanels[old].visible=false;
                }
                for(var j=0;j<selected.length;j++) {
                    var p=dynamicPanels[selected[j]];if(!p) continue;
                    var key=camera+":"+dynamicRevision+":"+(rangeRelation(dynamicRuns[selected[j]])===1?"inside":rangeKey);
                    if(p.__paintKey!==key) {
                        paint(p,dynamicRuns[selected[j]],dynamic.z+options.zOffset(),true);p.__paintKey=key;p.__paintVisible=p.visible;
                    } else p.visible=p.__paintVisible;
                }
                lastDynamic=selected;
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
            var viewport=options.viewport();
            for(var m=0;m<4;m++) {
                var p=options.project([corners[m][0],corners[m][1],z+options.zOffset()]);
                if(p && (!isFinite(p[0]) || !isFinite(p[1]) || p[0]<-4 || p[1]<-4
                    || p[0]>viewport[0]+4 || p[1]>viewport[1]+4)) p=null;
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
            atlasSource=source;atlas=next;redRuns=runs(atlas);terrainIndex=runIndex(redRuns,atlas.size*8);terrainVersion++;
            revision++;viewKey="";footKey="";stats.terrain_builds++;
            if(dynamic) rebuildDynamic();
            return true;
        }
        function prewarm(count) {
            while(foot.length<Math.min(64,count)) foot.push(newPanel(options.footHost,"FootprintTile"));
            while(marks.length<4) {
                var p=$.CreatePanel("Panel",options.footHost,"");p.hittest=false;p.visible=false;p.AddClass("StaticGridMark");marks.push(p);
            }
        }
        function prewarmTerrain() {
            var budget=24;
            while(outsidePanels.length<outsideRuns.length && budget-->0) outsidePanels.push(newPanel(options.terrainHost,"TerrainBlocked"));
            while(terrain.length<redRuns.length && budget-->0) terrain.push(newPanel(options.terrainHost,"TerrainBlocked"));
            stats.terrain_panels=terrain.length;
        }
        function rebuildDynamic() {
            var next=dynamic;
            var overlay={size:next.size,x:next.x,y:next.y,w:next.w,h:next.h,z:next.z,states:next.states.slice()};
            for(var x=0;x<next.w;x++) for(var y=0;y<next.h;y++) {
                if(staticSample((next.x+x+0.5)*next.size,(next.y+y+0.5)*next.size)===1) overlay.states[x*next.h+y]=0;
            }
            dynamicRuns=runs(overlay);dynamicIndex=runIndex(dynamicRuns,dynamic.size*8);dynamicRevision++;stats.dynamic_builds++;
        }
        prewarm(16);
        return {configure:configure,warm:warm,update:update,hideFoot:hideFoot,stats:stats,
            prewarm:prewarm,prewarmTerrain:prewarmTerrain,configureLayout:configureLayout,
            ingestDynamic:function(source){
                // Area notifications and validation replies can carry the same
                // payload. Renew freshness without decoding, rebuilding the
                // spatial index or invalidating an unchanged painted overlay.
                // configure()/configureLayout() still rebuild on static changes.
                if(dynamic && source===dynamicSource) {
                    dynamicUntil=Date.now()+1000;stats.dynamic_reuses++;return;
                }
                stats.dynamic_decodes++;
                var next=decode(source);if(!next) return;
                dynamic=next;dynamicSource=source;dynamicUntil=Date.now()+1000;footKey="";
                rebuildDynamic();
            },
            ready:function(){return !!atlas;}};
    }
    shared.SurvivalGridState={decode:decode,sample:sample,runs:runs,wedge:wedge,create:create};
})();
