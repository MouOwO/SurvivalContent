// The packed public catalogue is the local display source. Network messages
// update this HUD-session cache; opening a lottery panel never downloads data.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), version = "lottery_cache_v1";
    if (cfg.SurvivalLotteryCache && cfg.SurvivalLotteryCache.Dispose) cfg.SurvivalLotteryCache.Dispose();
    var memo = cfg.SurvivalLotteryCacheState;
    if (!memo || memo.version !== version) memo = cfg.SurvivalLotteryCacheState = {
        version:version, catalog:{}, md5:"", configHash:"", raw:{}, sequences:{}, errors:{},
        listeners:[], identity:null, handshake:"", retired:{}, catalogSequence:0
    };
    var subscriptions = [], tableSubscription = null, disposed = false, generation = 0;
    var assemblies = {}, catalogAssembly = null, resyncPending = {}, handshakeTimerKey="";
    memo.errors=memo.errors || {};
    memo.oldHashes=memo.oldHashes || {};
    function integer(value) {return isFinite(value) && Math.floor(value)===value;}
    function rows(value) { return Array.isArray(value) ? value : Object.keys(value || {}).sort(function (a,b) { return Number(a)-Number(b); }).map(function (key) { return value[key]; }); }
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function md5(text) {
        // RFC 1321 over UTF-8 bytes, including non-ASCII names and descriptions.
        var bytes = [], i, point, low;
        text = String(text);
        for (i=0;i<text.length;i++) {
            point=text.charCodeAt(i);
            if (point>=0xd800 && point<=0xdbff) {
                low=text.charCodeAt(i+1);
                if (low>=0xdc00 && low<=0xdfff) { point=0x10000+((point-0xd800)<<10)+(low-0xdc00); i++; }
                else point=0xfffd;
            } else if (point>=0xdc00 && point<=0xdfff) point=0xfffd;
            if (point<0x80) bytes.push(point);
            else if (point<0x800) bytes.push(0xc0|(point>>>6),0x80|(point&63));
            else if (point<0x10000) bytes.push(0xe0|(point>>>12),0x80|((point>>>6)&63),0x80|(point&63));
            else bytes.push(0xf0|(point>>>18),0x80|((point>>>12)&63),0x80|((point>>>6)&63),0x80|(point&63));
        }
        var length=bytes.length, words=[], count=((length+8)>>>6)+1;
        for(i=0;i<count*16;i++) words[i]=0;
        for(i=0;i<length;i++) words[i>>>2]|=bytes[i]<<((i%4)*8);
        words[length>>>2]|=0x80<<((length%4)*8);
        words[count*16-2]=(length*8)|0; words[count*16-1]=Math.floor(length/0x20000000);
        var a=0x67452301,b=0xefcdab89|0,c=0x98badcfe|0,d=0x10325476;
        var shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21], constants=[];
        for(i=0;i<64;i++) constants[i]=(Math.abs(Math.sin(i+1))*0x100000000)|0;
        for(var offset=0;offset<words.length;offset+=16) {
            var aa=a,bb=b,cc=c,dd=d;
            for(i=0;i<64;i++) {
                var f,g,round=i>>>4;
                if(round===0){f=(b&c)|(~b&d);g=i;}
                else if(round===1){f=(d&b)|(~d&c);g=(5*i+1)%16;}
                else if(round===2){f=b^c^d;g=(3*i+5)%16;}
                else {f=c^(b|~d);g=(7*i)%16;}
                var total=(a+f+constants[i]+words[offset+g])|0,shift=shifts[round*4+i%4];
                a=d;d=c;c=b;b=(b+((total<<shift)|(total>>>(32-shift))))|0;
            }
            a=(a+aa)|0;b=(b+bb)|0;c=(c+cc)|0;d=(d+dd)|0;
        }
        var result="";
        [a,b,c,d].forEach(function(word){for(var j=0;j<4;j++)result+=("0"+((word>>>(j*8))&255).toString(16)).slice(-2);});
        return result;
    }
    function identity() {
        var state=null, player=null;
        try { if(typeof CustomNetTables!=="undefined" && CustomNetTables.GetTableValue) state=CustomNetTables.GetTableValue("survival_loading","state"); } catch(ignored) {}
        try { if(typeof Game!=="undefined" && Game.GetLocalPlayerInfo) player=Game.GetLocalPlayerInfo(); } catch(ignoredPlayer) {}
        var mode=String(state && state.setup && state.setup.mode_id || "");
        if(mode && mode!=="pure") mode="standard";
        return {session:String(state && state.session_id || ""),account:accountId(player && player.player_steamid),mode:mode};
    }
    function accountId(value) {
        // Panorama exposes SteamID64; the HTTP provider stamps SteamAccountID.
        // Do not coerce a 64-bit decimal string to an imprecise JS Number.
        if(typeof value==="number" && (!integer(value) || value<0 || value>0xffffffff))return "";
        var text=String(value===undefined || value===null ? "" : value);
        if(!/^\d+$/.test(text))return "";
        var account=0;
        for(var i=0;i<text.length;i++)account=(account*10+text.charCodeAt(i)-48)%4294967296;
        return String(account);
    }
    function sameIdentity(a,b) { return !!a && !!b && a.session===b.session && a.account===b.account && a.mode===b.mode; }
    function notify(pool,packet) {
        memo.listeners.slice().forEach(function(fn){try {fn(pool || "",packet);} catch(error) {if($.Msg)$.Msg("[LOTTERY_CACHE_LISTENER] "+String(error));}});
    }
    function send(name,payload) { if(!disposed) GameEvents.SendCustomGameEventToServer(name,payload); }
    function syncIdentity() {
        var next=identity();
        if(!sameIdentity(memo.identity,next)) {
            var changed=!!memo.identity;
            if(memo.identity && (memo.identity.session!==next.session || memo.identity.account!==next.account)) {
                memo.catalogSequence=0;memo.retired={};memo.oldHashes={};catalogAssembly=null;
            }
            memo.identity=next;memo.raw={};memo.sequences={};memo.errors={};memo.pendingHash="";memo.pendingMd5="";assemblies={};resyncPending={};
            if(changed) notify("");
        }
        return next;
    }
    function handshake() {
        var current=syncIdentity(), key=current.account+"|"+current.session;
        // Native startup publishes the session before the HUD becomes usable.
        if(typeof CustomNetTables!=="undefined" && CustomNetTables.GetTableValue && !current.session) return;
        if(memo.handshake!==key) {memo.handshake=key;send("ui_lottery_catalog_sync",{md5:memo.md5});}
        if(memo.confirmedHandshake===key || handshakeTimerKey===key)return;
        handshakeTimerKey=key;
        var token=generation;
        $.Schedule(3,function(){if(!disposed && token===generation && memo.handshake===key && memo.confirmedHandshake!==key)resync("map");});
    }
    function compatibleOwner(packet) {
        var current=syncIdentity();
        if(current.session && String(packet.session_id || "")!==current.session) return false;
        if(current.account && String(packet.account_id || "")!==current.account) return false;
        if(current.mode && String(packet.profile_mode || "")!==current.mode) return false;
        return true;
    }
    function resync(pool) {
        pool=String(pool || "map");
        if(resyncPending[pool]) return;
        var request={};resyncPending[pool]=request;
        send("ui_lottery_cache_resync",{pool_id:pool,md5:memo.md5});
        var token=generation;
        $.Schedule(5,function(){if(!disposed && token===generation && resyncPending[pool]===request){delete resyncPending[pool];resync(pool);}});
    }
    function staticCatalog(raw,expected,hash) {
        if(typeof raw!=="string" || !/^[0-9a-f]{32}$/.test(String(expected)) || !/^[0-9a-f]{64}$/.test(String(hash)) || md5(raw)!==expected) return false;
        var data, catalog={};
        try {data=JSON.parse(raw);} catch(ignored) {return false;}
        if(!data || data.schema!==1 || !Array.isArray(data.snapshots) || !data.snapshots.length) return false;
        for(var i=0;i<data.snapshots.length;i++) {
            var snapshot=data.snapshots[i],id=String(snapshot && snapshot.selected_pool_id || "");
            if(!id || catalog[id] || !snapshot.selected_pool || String(snapshot.selected_pool.id)!==id || !Array.isArray(snapshot.items))return false;
            catalog[id]=snapshot;
        }
        var oldHash=memo.configHash;
        memo.catalog=catalog;memo.md5=expected;memo.configHash=String(hash || "");memo.pendingHash="";memo.pendingMd5="";
        if(oldHash && oldHash!==memo.configHash) {memo.oldHashes[oldHash]=true;memo.raw={};memo.sequences={};memo.errors={};assemblies={};}
        else Object.keys(memo.raw).forEach(function(id){if(!catalog[id] || !revisionMatches(memo.raw[id],catalog[id])){delete memo.raw[id];delete memo.sequences[id];}});
        return true;
    }
    function revisionMatches(packet,base) {
        return String(packet && packet.selected_pool && packet.selected_pool.revision || "")===String(base && base.selected_pool && base.selected_pool.revision || "");
    }
    function catalogue(packet) {
        if(!packet || packet.ok===false || Number(packet.ok)===0) return;
        var current=syncIdentity();
        if(current.session && String(packet.session_id || "")!==current.session)return;
        var sequence=Number(packet.catalog_sequence || 0);
        if(!integer(sequence) || sequence<0 || sequence<memo.catalogSequence || (current.session && sequence<1))return;
        if(!/^[0-9a-f]{32}$/.test(String(packet.catalog_md5)) || !/^[0-9a-f]{64}$/.test(String(packet.config_hash)))return;
        if(sequence===memo.catalogSequence && sequence>0 && packet.catalog_md5!==memo.md5)return;
        if(memo.pendingHash && packet.config_hash!==memo.pendingHash && sequence<=memo.catalogSequence)return;
        if(memo.pendingMd5 && packet.catalog_md5!==memo.pendingMd5 && sequence<=memo.catalogSequence)return;
        if(Number(packet.unchanged)===1) {
            if(String(packet.catalog_md5 || "")!==memo.md5) {memo.handshake="";handshake();return;}
            if(packet.config_hash && memo.configHash!==String(packet.config_hash)) {
                memo.oldHashes[memo.configHash]=true;memo.configHash=String(packet.config_hash);memo.raw={};memo.sequences={};memo.errors={};assemblies={};notify("");resync("map");
            }
            memo.pendingHash="";memo.pendingMd5="";memo.catalogSequence=Math.max(memo.catalogSequence,sequence);memo.confirmedHandshake=memo.handshake;return;
        }
        var id=String(packet.transfer_id || ""),hash=String(packet.catalog_md5 || ""),chunk=Number(packet.chunk),chunks=Number(packet.chunks);
        if(!id || memo.retired[id] || !/^[0-9a-f]{32}$/.test(hash) || !integer(chunk) || !integer(chunks) || chunk<1 || chunks<1 || chunk>chunks || chunks>1024 || typeof packet.catalog_chunk!=="string" || packet.catalog_chunk.length>3500)return;
        if(catalogAssembly && sequence<catalogAssembly.sequence)return;
        if(!catalogAssembly || catalogAssembly.id!==id) {
            if(catalogAssembly)memo.retired[catalogAssembly.id]=true;
            catalogAssembly={id:id,md5:hash,hash:String(packet.config_hash || ""),chunks:chunks,parts:{},size:0,sequence:sequence};
            var assembly=catalogAssembly,token=generation;
            $.Schedule(3,function(){if(!disposed && token===generation && catalogAssembly===assembly){memo.retired[assembly.id]=true;catalogAssembly=null;resync("map");}});
        }
        var active=catalogAssembly;
        if(active.md5!==hash || active.hash!==String(packet.config_hash || "") || active.chunks!==chunks || active.sequence!==sequence)return;
        if(active.parts[chunk]!==undefined) {if(active.parts[chunk]!==packet.catalog_chunk){memo.retired[id]=true;catalogAssembly=null;resync("map");}return;}
        active.parts[chunk]=packet.catalog_chunk;active.size+=packet.catalog_chunk.length;
        if(active.size>2*1024*1024){memo.retired[id]=true;catalogAssembly=null;resync("map");return;}
        if(Object.keys(active.parts).length!==chunks)return;
        var raw="";for(var n=1;n<=chunks;n++)raw+=active.parts[n];
        memo.retired[id]=true;catalogAssembly=null;
        if(!staticCatalog(raw,hash,active.hash)){resync("map");return;}
        memo.catalogSequence=Math.max(memo.catalogSequence,sequence);memo.confirmedHandshake=memo.handshake;resyncPending={};notify("");resync("map");
    }
    function ingest(packet) {
        if(disposed || !packet || !compatibleOwner(packet))return false;
        var id=String(packet.selected_pool_id || packet.selected_pool && packet.selected_pool.id || "");
        if(memo.md5 && !/^[0-9a-f]{64}$/.test(String(packet.config_hash || "")))return false;
        if(memo.md5 && (String(packet.config_hash || "")!==memo.configHash || String(packet.catalog_md5 || memo.md5)!==memo.md5)) {
            if(memo.oldHashes[String(packet.config_hash || "")])return false;
            if(/^[0-9a-f]{64}$/.test(String(packet.config_hash || "")))memo.pendingHash=String(packet.config_hash);
            if(/^[0-9a-f]{32}$/.test(String(packet.catalog_md5 || "")))memo.pendingMd5=String(packet.catalog_md5);
            Object.keys(memo.raw).forEach(function(pool){memo.errors[pool]="lottery_config_hash_mismatch";});
            notify("");resync(id);return false;
        }
        if(memo.pendingHash && memo.pendingHash!==memo.configHash || memo.pendingMd5 && memo.pendingMd5!==memo.md5){resync(id);return false;}
        if(packet.error) {
            (id?[id]:Object.keys(memo.raw)).forEach(function(pool){memo.errors[pool]=String(packet.error);});
            notify(id);resync(id || "map");return false;
        }
        if(!id)return false;
        var seq=Number(packet.cache_sequence || 0),scope=String(packet.snapshot_scope || "main"),base=memo.catalog[id],snapshot=packet;
        if(scope==="read") {
            if(!memo.raw[id] || packet.read_error){notify(id,packet);return false;}
            if(base && !revisionMatches(packet,base))return false;
            // A read receipt may have been created before a concurrent draw's
            // balance/ownership push. It only acknowledges the notice flags.
            var receipt=clone(memo.raw[id]),flags=["update_unread","notice_unread"];
            copyFields(receipt.selected_pool,packet.selected_pool,flags);
            var readPools={};rows(packet.pools).forEach(function(pool){readPools[pool.id]=pool;});
            rows(receipt.pools).forEach(function(pool){copyFields(pool,readPools[pool.id],flags);});
            memo.raw[id]=receipt;notify(id,packet);return true;
        }
        if(scope==="cache" || scope==="cache_patch") {
            if(!integer(seq) || seq<1)return false;
            if(seq<=(memo.sequences[id] || 0))return false;
            if(scope==="cache_patch") {
                var chunk=Number(packet.chunk),chunks=Number(packet.chunks);
                if(!integer(chunk) || !integer(chunks) || chunk<1 || chunk>chunks || chunks>1024)return false;
                var parts=assemblies[id];
                if(!parts || seq>parts.sequence) {
                    parts=assemblies[id]={sequence:seq,chunks:chunks,base:Number(packet.base_sequence),parts:{}};
                    (function(assembly,token){$.Schedule(3,function(){if(!disposed && token===generation && assemblies[id]===assembly){delete assemblies[id];resync(id);}});})(parts,generation);
                }
                if(seq!==parts.sequence || chunks!==parts.chunks || Number(packet.base_sequence)!==parts.base)return false;
                parts.parts[chunk]=rows(packet.changes);
                if(Object.keys(parts.parts).length!==chunks)return false;
                delete assemblies[id];
                if(!memo.raw[id] || memo.sequences[id]!==parts.base){resync(id);return false;}
                var changes=[];for(var i=1;i<=chunks;i++)changes=changes.concat(parts.parts[i]);
                try {snapshot=cfg.SurvivalSnapshotCache.Apply(memo.raw[id],changes);} catch(error) {resync(id);return false;}
                // Delta paths can change contents, never their delivery owner.
                ["account_id","session_id","profile_mode","config_hash","catalog_md5"].forEach(function(key){snapshot[key]=packet[key];});
            }
        } else {
            if(packet.cache_sequence!==undefined && (!integer(seq) || seq<1))return false;
            if(seq && seq<=(memo.sequences[id] || 0))return false;
            if(memo.md5 && memo.sequences[id] && !seq){resync(id);return false;}
        }
        if(base && !revisionMatches(snapshot,base)){resync(id);return false;}
        snapshot=clone(snapshot);snapshot.snapshot_scope="main";
        delete snapshot.cache_sequence;
        memo.raw[id]=snapshot;delete memo.errors[id];
        if(seq)memo.sequences[id]=seq;
        if(assemblies[id] && assemblies[id].sequence<=seq)delete assemblies[id];
        delete resyncPending[id];
        notify(id,packet);return true;
    }
    var poolDynamic=["tickets","unlocked","unlock_progress","update_unread","notice_unread","draws"];
    var itemDynamic=["owned","owned_count","at_max_owned"];
    function copyFields(target,source,fields) {fields.forEach(function(key){if(source && source[key]!==undefined)target[key]=clone(source[key]);});}
    function authoritative(id) {
        var current=syncIdentity(),raw=memo.raw[id],base=memo.catalog[id];
        if(!raw || memo.errors[id] || memo.pendingHash && memo.pendingHash!==memo.configHash || memo.pendingMd5 && memo.pendingMd5!==memo.md5)return false;
        var balance=raw.selected_pool && raw.selected_pool.tickets;
        if(typeof balance!=="number" || !integer(balance) || balance<0)return false;
        if(memo.md5 && (!current.account || !current.session || !current.mode))return false;
        return (!base || revisionMatches(raw,base)) && (!memo.md5 || String(raw.config_hash || "")===memo.configHash);
    }
    function snapshot(id) {
        syncIdentity();id=String(id || "map");
        var base=memo.catalog[id],raw=memo.raw[id];
        // Isolated presentation fixtures can feed full server snapshots without
        // a packed catalogue. Native HUD builds always include the seed first.
        if(!base){var legacy=memo.md5?null:clone(raw || null);if(legacy)legacy.authoritative_ready=authoritative(id);return legacy;}
        var result=clone(base),ready=authoritative(id);
        result.authoritative_ready=ready;result.catalog_md5=memo.md5;result.config_hash=memo.configHash;
        if(!raw) {result.selected_pool.tickets=0;return result;}
        copyFields(result,raw,["starjoy_points","shop_points","map_level","draws","tickets"]);
        copyFields(result.selected_pool,raw.selected_pool,poolDynamic);
        var pools={};rows(raw.pools).forEach(function(pool){pools[pool.id]=pool;});
        rows(result.pools).forEach(function(pool){copyFields(pool,pools[pool.id],poolDynamic);});
        var items={};rows(raw.items).forEach(function(item){items[item.id]=item;});
        rows(result.items).forEach(function(item){copyFields(item,items[item.id],itemDynamic);});
        result.tickets=result.selected_pool.tickets;
        return result;
    }
    var seed=cfg.SurvivalLotteryCatalogSeed;
    // Keep a verified hot catalogue when a controller/layout reload re-executes
    // the packed seed. The login handshake determines which version is current.
    if(!memo.md5 && seed)staticCatalog(seed.catalog_json,seed.md5,seed.config_hash);
    var api={Version:version,MD5:md5,Snapshot:snapshot,Ingest:ingest,IsAuthoritative:authoritative,
        Subscribe:function(fn){memo.listeners.push(fn);return function(){memo.listeners=memo.listeners.filter(function(candidate){return candidate!==fn;});};},
        Refresh:function(){syncIdentity();notify("");},Resync:resync,
        Invalidate:function(pool){pool=String(pool || "map");memo.errors[pool]="authoritative_snapshot_unavailable";notify(pool);resync(pool);},
        ReadAck:function(pool,action){if(pool && pool.id && pool.revision)send("ui_lottery_read_ack",{pool_id:String(pool.id),read_action:String(action),revision:String(pool.revision)});},
        Catalog:function(){return {md5:memo.md5,config_hash:memo.configHash,pools:Object.keys(memo.catalog)};},
        Dispose:function(){if(disposed)return;disposed=true;generation++;subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});if(tableSubscription!==null && CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(tableSubscription);}
    };
    cfg.SurvivalLotteryCache=api;
    subscriptions.push(GameEvents.Subscribe("ui_lottery_catalog",function(packet){if(!disposed)catalogue(packet);}));
    subscriptions.push(GameEvents.Subscribe("ui_lottery_snapshot",ingest));
    if(typeof CustomNetTables!=="undefined" && CustomNetTables.SubscribeNetTableListener)tableSubscription=CustomNetTables.SubscribeNetTableListener("survival_loading",function(table,key){if(!disposed && key==="state")handshake();});
    handshake();
})();
