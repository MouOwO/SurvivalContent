(function () {
    "use strict";

    // Pure plane geometry. The white grid has no dependency on validation,
    // cursor position, units, terrain scans or server preview packets.
    function geometry(layout, size) {
        var b=layout && layout.bounds;
        if (!b || !(size>0)) return null;
        var values=[b.min_x,b.min_y,b.max_x,b.max_y,layout.height].map(Number);
        if (!values.every(isFinite) || values[2]<=values[0] || values[3]<=values[1]) return null;
        var xs=[],ys=[],segments=[];
        var x0=Math.ceil(values[0]/size),x1=Math.floor(values[2]/size);
        var y0=Math.ceil(values[1]/size),y1=Math.floor(values[3]/size);
        if (x1-x0>512 || y1-y0>512) return null;
        for (var x=x0;x<=x1;x++) xs.push(x*size);
        for (var y=y0;y<=y1;y++) ys.push(y*size);
        if (xs.length<2 || ys.length<2) return null;
        for (var i=0;i<xs.length;i++) segments.push([xs[i],ys[0],xs[i],ys[ys.length-1]]);
        for (var j=0;j<ys.length;j++) segments.push([xs[0],ys[j],xs[xs.length-1],ys[j]]);
        var cx=(values[0]+values[2])/2,cy=(values[1]+values[3])/2;
        return {xs:xs,ys:ys,segments:segments,height:values[4],size:size,
            reference:[cx-512,cy-512,1024,1024]};
    }

    function invert(m) {
        var a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8];
        var det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
        if (Math.abs(det)<1e-12) return null;
        return [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d]
            .map(function(v){return v/det;});
    }

    // Recover a plane homography from four engine projections. This retains
    // perspective, unlike an affine approximation that creates half-cell gaps.
    function projection(reference, points) {
        if (points.length!==4 || points.some(function(p){return !p || !p.every(isFinite);})) return null;
        var p=points,dx1=p[1][0]-p[2][0],dx2=p[3][0]-p[2][0];
        var dy1=p[1][1]-p[2][1],dy2=p[3][1]-p[2][1];
        var sx=p[0][0]-p[1][0]+p[2][0]-p[3][0],sy=p[0][1]-p[1][1]+p[2][1]-p[3][1];
        var det=dx1*dy2-dx2*dy1;
        if (Math.abs(det)<1e-9) return null;
        var g=(sx*dy2-dx2*sy)/det,h=(dx1*sy-sx*dy1)/det;
        var a=p[1][0]-p[0][0]+g*p[1][0],b=p[3][0]-p[0][0]+h*p[3][0];
        var d=p[1][1]-p[0][1]+g*p[1][1],e=p[3][1]-p[0][1]+h*p[3][1];
        var x=reference[0],y=reference[1],w=reference[2],v=reference[3];
        var m=[a/w,b/v,p[0][0]-a*x/w-b*y/v,d/w,e/v,p[0][1]-d*x/w-e*y/v,
            g/w,h/v,1-g*x/w-h*y/v];
        var inverse=invert(m);
        return inverse ? {matrix:m,inverse:inverse} : null;
    }

    function homogeneous(view,x,y) {
        var m=view.matrix;
        return [m[0]*x+m[1]*y+m[2],m[3]*x+m[4]*y+m[5],m[6]*x+m[7]*y+m[8]];
    }

    function point(view,x,y) {
        var p=homogeneous(view,x,y);
        return p[2]>1e-6 ? [p[0]/p[2],p[1]/p[2]] : null;
    }

    function unproject(view,x,y) {
        if(!view || !isFinite(x) || !isFinite(y)) return null;
        var n=view.inverse,w=n[6]*x+n[7]*y+n[8];
        if(Math.abs(w)<1e-9) return null;
        var world=[(n[0]*x+n[1]*y+n[2])/w,(n[3]*x+n[4]*y+n[5])/w];
        return world.every(isFinite) && point(view,world[0],world[1]) ? world : null;
    }

    function segment(view,line,width,height) {
        var a=homogeneous(view,line[0],line[1]),b=homogeneous(view,line[2],line[3]);
        if (a[2]<=1e-6 && b[2]<=1e-6) return null;
        if (a[2]<=1e-6 || b[2]<=1e-6) {
            var t=(1e-6-a[2])/(b[2]-a[2]);
            var cut=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,1e-6];
            if (a[2]<=1e-6) a=cut; else b=cut;
        }
        var ax=a[0]/a[2],ay=a[1]/a[2],dx=b[0]/b[2]-ax,dy=b[1]/b[2]-ay;
        var ps=[-dx,dx,-dy,dy],qs=[ax,width-ax,ay,height-ay],lo=0,hi=1;
        for (var i=0;i<4;i++) {
            if (Math.abs(ps[i])<1e-9) { if (qs[i]<0) return null; }
            else if (ps[i]<0) lo=Math.max(lo,qs[i]/ps[i]);
            else hi=Math.min(hi,qs[i]/ps[i]);
        }
        return lo<=hi ? [[ax+lo*dx,ay+lo*dy],[ax+hi*dx,ay+hi*dy]] : null;
    }

    // Transform the actual world circle conic, including off-center perspective
    // and camera rotation. A screen-space bounding-box ellipse is not sufficient.
    function ellipse(view,x,y,radius) {
        var n=view.inverse,q=[1,0,-x,0,1,-y,-x,-y,x*x+y*y-radius*radius],out=[];
        for (var i=0;i<3;i++) for (var j=0;j<3;j++) {
            var sum=0;
            for (var k=0;k<3;k++) for (var l=0;l<3;l++) sum+=n[k*3+i]*q[k*3+l]*n[l*3+j];
            out[i*3+j]=sum;
        }
        var a=out[0],b=out[1],c=out[4],d=out[2],e=out[5],f=out[8];
        if (a<0) {a=-a;b=-b;c=-c;d=-d;e=-e;f=-f;}
        var det=a*c-b*b;
        if (det<=1e-12) return null;
        var cx=(b*e-c*d)/det,cy=(b*d-a*e)/det;
        var scale=-(f+d*cx+e*cy),delta=Math.sqrt((a-c)*(a-c)+4*b*b);
        var small=(a+c-delta)/2,large=(a+c+delta)/2;
        if (scale<=0 || small<=0) return null;
        var angle=(Math.atan2(2*b,a-c)/2+Math.PI/2)*180/Math.PI;
        while (angle>90) angle-=180;
        return {x:cx,y:cy,rx:Math.sqrt(scale/small),ry:Math.sqrt(scale/large),angle:angle};
    }

    function create(options) {
        var mesh=null,view=null,viewKey="",worldKey="",width=0,height=0;
        var lines=[],marks=[],screenLines=[],screenMarks=[],revision=0;
        var visual={},configured=false;
        var laidOutRevision=-1,laidOutLines=0,laidOutMarks=0;
        var mask=options.mask,host=options.host,outline=options.outline,planeRange=false;
        var set=options.setStyle;
        var stats={geometry_builds:0,view_builds:0,layout_writes:0,mask_updates:0,line_panels:0,mark_panels:0,reference_rebases:0,corner_candidates:0};
        var reportedState="";
        function report(state, details) {
            stats.state=state;
            if (reportedState===state) return;
            reportedState=state;
            if ($.Msg) $.Msg("[SurvivalStaticGrid] "+state+" "+JSON.stringify(details || {}));
        }

        function allocate(lineTarget,markTarget,budget) {
            while (lines.length<lineTarget && budget-->0) {
                var line=$.CreatePanel("Panel",host,"StaticGridLine"+lines.length);
                line.AddClass("StaticGridLine"); line.hittest=false; line.visible=false; lines.push(line);
            }
            while (marks.length<markTarget && budget-->0) {
                var mark=$.CreatePanel("Panel",host,"StaticGridMark"+marks.length);
                mark.AddClass("StaticGridMark"); mark.hittest=false; mark.visible=false; marks.push(mark);
            }
            stats.line_panels=lines.length; stats.mark_panels=marks.length;
        }

        function visibleBounds() {
            if(!view) return null;
            var corners=[[-8,-8],[width+8,-8],[width+8,height+8],[-8,height+8]].map(function(p){
                return unproject(view,p[0],p[1]);
            });
            if(corners.some(function(p){return !p;})) return null;
            return [Math.min.apply(Math,corners.map(function(p){return p[0];})),
                Math.min.apply(Math,corners.map(function(p){return p[1];})),
                Math.max.apply(Math,corners.map(function(p){return p[0];})),
                Math.max.apply(Math,corners.map(function(p){return p[1];}))];
        }
        function refreshView() {
            if (!mesh) return;
            var viewport=options.viewport();
            if (!viewport || !viewport.every(isFinite) || viewport[0]<=0 || viewport[1]<=0) {
                report("viewport_unavailable",{viewport:viewport});return;
            }
            // Engine projections have finite pixel precision. A small patch at
            // the map origin becomes an unstable extrapolation far away. Keep
            // a wide reference patch near the CAMERA, independent of the cursor.
            var center=options.referenceWorld && options.referenceWorld();
            var r=mesh.reference,z=mesh.height;
            if(center && isFinite(center[0]) && isFinite(center[1])
                && (Math.abs(center[0]-r[0]-r[2]/2)>1024 || Math.abs(center[1]-r[1]-r[3]/2)>1024)) {
                mesh.reference=r=[Math.round(center[0]/512)*512-512,Math.round(center[1]/512)*512-512,1024,1024];
                stats.reference_rebases++;
            }
            var points=[[r[0],r[1],z],[r[0]+r[2],r[1],z],
                [r[0]+r[2],r[1]+r[3],z],[r[0],r[1]+r[3],z]].map(options.project);
            var key=points.map(function(p){return p?p[0].toFixed(3)+","+p[1].toFixed(3):"off";}).join(";")
                +":"+viewport.join(",");
            if (view && viewKey===key) return;
            view=projection(r,points);
            if (!view) {
                // The old reference patch can move behind the camera after a
                // long pan. Rebase on the viewport, never on mouse motion.
                if (center && isFinite(center[0]) && isFinite(center[1])
                    && (Math.abs(center[0]-r[0]-r[2]/2)>1 || Math.abs(center[1]-r[1]-r[3]/2)>1)) {
                    mesh.reference=[center[0]-512,center[1]-512,1024,1024];
                    viewKey="";return refreshView();
                }
                mask.visible=false;if(outline) outline.visible=false;
                report("projection_unavailable",{reference:r,points:points});return;
            }
            width=viewport[0];height=viewport[1];viewKey=key;worldKey="";revision++;
            stats.view_builds++;
            set(host,"width",width.toFixed(2)+"px");set(host,"height",height.toFixed(2)+"px");
            screenLines=[];screenMarks=[];
            for (var i=0;i<mesh.segments.length;i++) {
                var clipped=segment(view,mesh.segments[i],width,height);
                if (clipped) screenLines.push(clipped);
            }
            // Full-map geometry is cheap; never project 263,169 offscreen marks
            // when the camera moves. Only inspect the visible world rectangle.
            var bounds=visibleBounds(),x0=0,y0=0,x1=mesh.xs.length-1,y1=mesh.ys.length-1;
            if(bounds) {
                x0=Math.max(0,Math.floor((bounds[0]-mesh.xs[0])/mesh.size));
                y0=Math.max(0,Math.floor((bounds[1]-mesh.ys[0])/mesh.size));
                x1=Math.min(x1,Math.ceil((bounds[2]-mesh.xs[0])/mesh.size));
                y1=Math.min(y1,Math.ceil((bounds[3]-mesh.ys[0])/mesh.size));
            }
            // Bound work before enumeration, including a camera near the horizon.
            var candidateCount=Math.max(0,x1-x0+1)*Math.max(0,y1-y0+1);
            var markStep=Math.max(1,Math.ceil(Math.sqrt(candidateCount/4096)));
            x0=Math.ceil(x0/markStep)*markStep;y0=Math.ceil(y0/markStep)*markStep;
            stats.corner_candidates=0;
            for (var xi=x0;xi<=x1;xi+=markStep) for (var yi=y0;yi<=y1;yi+=markStep) {
                stats.corner_candidates++;
                var p=point(view,mesh.xs[xi],mesh.ys[yi]);
                if (p && p[0]>=-4 && p[0]<=width+4 && p[1]>=-4 && p[1]<=height+4)
                    screenMarks.push({x:p[0],y:p[1],gx:xi,gy:yi});
            }
            // Only corner glyphs get a zoomed-out LOD. All 64-unit grid lines
            // remain intact. Never instantiate thousands of offscreen cells.
            if (screenMarks.length>2048) {
                var stride=Math.ceil(Math.sqrt(screenMarks.length/2048));
                screenMarks=screenMarks.filter(function(p){return p.gx%stride===0 && p.gy%stride===0;});
            }
        }

        function layout() {
            if (laidOutRevision===revision && laidOutLines===lines.length && laidOutMarks===marks.length) return;
            for (var i=0;i<lines.length;i++) {
                var line=lines[i],s=screenLines[i];
                if (!s) { if(line.visible)line.visible=false; continue; }
                if (line.__revision===revision) continue;
                options.positionSegment(line,s[0],s[1],2);
                line.visible=true;line.__revision=revision;stats.layout_writes++;
            }
            for (var j=0;j<marks.length;j++) {
                var mark=marks[j],p=screenMarks[j];
                if (!p) { if(mark.visible)mark.visible=false; continue; }
                if (mark.__revision===revision) continue;
                set(mark,"position",(p.x-4).toFixed(2)+"px "+(p.y-4).toFixed(2)+"px 0px");
                mark.visible=true;mark.__revision=revision;stats.layout_writes++;
            }
            laidOutRevision=revision;laidOutLines=lines.length;laidOutMarks=marks.length;
        }

        function configure(data,size,settings) {
            var next=geometry(data,size);
            if (!next) {
                configured=false;mask.RemoveClass("StaticGridActive");
                set(mask,"position","0px 0px 0px");set(mask,"width","100%");set(mask,"height","100%");
                set(mask,"transform","none");set(host,"position","0px 0px 0px");
                set(host,"width","100%");set(host,"height","100%");set(host,"transform","none");
                for(var i=0;i<lines.length;i++) lines[i].visible=false;
                for(var j=0;j<marks.length;j++) marks[j].visible=false;
                return false;
            }
            mask.AddClass("StaticGridActive");
            var key=JSON.stringify([data,size,settings.grid_z_offset]);
            if (mesh && mesh.key===key && configured) return true;
            mesh=next;mesh.key=key;mesh.height+=Number(settings.grid_z_offset)||0;
            visual=settings;viewKey="";worldKey="";configured=true;
            stats.geometry_builds++;mask.visible=false;
            return true;
        }

        function warm() {
            if (!configured) return;
            refreshView();
            allocate(Math.max(128,screenLines.length),Math.max(1024,screenMarks.length),32);
            layout();
        }

        function update(world,viewIsCurrent) {
            if (!world) {mask.visible=false;if(outline) outline.visible=false;return;}
            if (!configured) {mask.visible=true;return;}
            if(!viewIsCurrent) refreshView();
            if (!view) return;
            allocate(screenLines.length,screenMarks.length,32);layout();
            var key=world[0]+":"+world[1]+":"+visual.radius+":"+viewKey;
            if (worldKey!==key) {
                var circle=ellipse(view,world[0],world[1],visual.radius);
                // A plane crossing the camera horizon does not project to a
                // finite ellipse; reject it instead of assigning NaN styles.
                if (!circle || circle.rx>32768 || circle.ry>32768) {
                    mask.visible=false;if(outline) outline.visible=false;
                    report("mask_unavailable",{world:world,radius:visual.radius,matrix:view.matrix,circle:circle});return;
                }
                var left=circle.x-circle.rx,top=circle.y-circle.ry;
                set(mask,"position",left.toFixed(2)+"px "+top.toFixed(2)+"px 0px");
                set(mask,"width",(2*circle.rx).toFixed(2)+"px");
                set(mask,"height",(2*circle.ry).toFixed(2)+"px");
                set(mask,"transform","rotateZ("+circle.angle.toFixed(4)+"deg)");
                if(outline) {
                    set(outline,"position",left.toFixed(2)+"px "+top.toFixed(2)+"px 0px");
                    set(outline,"width",(2*circle.rx).toFixed(2)+"px");set(outline,"height",(2*circle.ry).toFixed(2)+"px");
                    set(outline,"transform","rotateZ("+circle.angle.toFixed(4)+"deg)");
                }
                // Counter-transform the retained screen mesh. The mask moves,
                // but the world grid underneath it never follows the cursor.
                set(host,"position",(-left).toFixed(2)+"px "+(-top).toFixed(2)+"px 0px");
                set(host,"transformOrigin",(circle.x/width*100).toFixed(5)+"% "+(circle.y/height*100).toFixed(5)+"%");
                set(host,"transform","rotateZ("+(-circle.angle).toFixed(4)+"deg)");
                worldKey=key;stats.mask_updates++;
            }
            // An unusually early Q may precede startup warmup. Reveal shared
            // lines together, rather than showing columns growing in batches.
            mask.visible=lines.length>=screenLines.length;
            if(outline) outline.visible=planeRange && mask.visible;
            report(mask.visible?"visible":"warming",{lines:screenLines.length,marks:screenMarks.length,
                viewport:[width,height],mask:mask.style.position,size:[mask.style.width,mask.style.height],
                matrix:view.matrix});
        }

        return {configure:configure,warm:warm,update:update,hide:function(){mask.visible=false;if(outline)outline.visible=false;},
            setPlaneRange:function(enabled){planeRange=enabled;return !!outline;},
            refreshView:refreshView,visibleBounds:visibleBounds,
            worldAtScreen:function(screen){
                var world=configured && screen ? unproject(view,screen[0],screen[1]) : null;
                return world ? [world[0],world[1],mesh.height-(Number(visual.grid_z_offset)||0)] : null;
            },
            project:function(world){return configured && view && Math.abs(world[2]-mesh.height)<0.001
                ? point(view,world[0],world[1]) : null;},cameraKey:function(){return viewKey;},
            enabled:function(){return configured;},stats:stats};
    }

    GameUI.CustomUIConfig().SurvivalStaticGrid={geometry:geometry,projection:projection,
        point:point,unproject:unproject,segment:segment,ellipse:ellipse,create:create};
})();
