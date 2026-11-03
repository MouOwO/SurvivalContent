// Presentation wire only: no reward authority, native bridge or periodic work.
// Schema indexing is O(N+F) once. A frame costs O(bytes); a commit costs O(K).
// Default 24-character payload is a candidate budget, not native byte evidence.
(function (root, factory) {
    "use strict";
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (typeof GameUI !== "undefined" && GameUI.CustomUIConfig) GameUI.CustomUIConfig().SurvivalCompactWire = api;
}(this, function () {
    "use strict";
    var MAX_UINT=4294967295, MAX_SINT=2147483647, MAX_TOKEN=16383, MAX_REV=2097151;
    var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", reverse=Object.create(null);
    var compiled=new WeakMap(), i;
    for(i=0;i<alphabet.length;i++) reverse[alphabet.charAt(i)]=i;
    function need(ok,code){if(!ok)throw new Error(code);}
    function integer(n,min,max){return typeof n==="number" && isFinite(n) && Math.floor(n)===n && n>=min && n<=max;}
    function sha(s){return typeof s==="string" && /^[a-f0-9]{64}$/.test(s);}
    function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
    function dense(a,max){
        need(Array.isArray(a) && a.length<=max,"array_required");
        need(Object.keys(a).length===a.length,"sparse_or_named_array");
        for(var n=0;n<a.length;n++)need(own(a,n),"sparse_or_named_array");
        return a.length;
    }
    function uint(value){
        need(integer(value,0,MAX_UINT),"uint32_required");var out="",part;
        do{part=value%128;value=Math.floor(value/128);out+=String.fromCharCode(part+(value>0?128:0));}while(value>0);
        return out;
    }
    function readUint(raw,cursor){
        var value=0,multiplier=1,b,n;
        for(n=0;n<5;n++){
            need(cursor.at<raw.length,"truncated_varint");b=raw.charCodeAt(cursor.at++);
            value+=(b%128)*multiplier;need(value<=MAX_UINT,"varint_overflow");
            if(b<128){need(n===0 || b!==0,"noncanonical_varint");return value;}
            multiplier*=128;
        }
        throw new Error("varint_overflow");
    }
    function b64encode(raw){
        var out="",a,b,c,n;
        for(n=0;n<raw.length;n+=3){a=raw.charCodeAt(n);b=raw.charCodeAt(n+1)||0;c=raw.charCodeAt(n+2)||0;
            out+=alphabet.charAt(Math.floor(a/4))+alphabet.charAt((a%4)*16+Math.floor(b/16));
            if(n+1<raw.length)out+=alphabet.charAt((b%16)*4+Math.floor(c/64));
            if(n+2<raw.length)out+=alphabet.charAt(c%64);
        }return out;
    }
    function b64decode(value){
        need(typeof value==="string" && !/[^A-Za-z0-9_-]/.test(value) && value.length%4!==1,"invalid_base64url");
        var out="",a,b,c,d,n;
        for(n=0;n<value.length;n+=4){a=reverse[value.charAt(n)];b=reverse[value.charAt(n+1)];c=reverse[value.charAt(n+2)];d=reverse[value.charAt(n+3)];
            need(a!==undefined && b!==undefined,"invalid_base64url");out+=String.fromCharCode(a*4+Math.floor(b/16));
            if(c!==undefined){out+=String.fromCharCode((b%16)*16+Math.floor(c/4));
                if(d!==undefined)out+=String.fromCharCode((c%4)*64+d);else need(c%4===0,"noncanonical_base64url");
            }else need(b%16===0,"noncanonical_base64url");
        }return out;
    }
    function dataOf(schema){var data=compiled.get(schema);need(!!data,"uncompiled_schema");return data;}
    function compileSchema(spec){
        need(spec && integer(spec.id,1,MAX_TOKEN) && sha(spec.sha256),"schema_identity_invalid");
        var data={id:spec.id,sha256:spec.sha256,records:Object.create(null),fields:Object.create(null)},n,id,f,kind,lo,hi,min,max,definition,keys;
        dense(spec.records,65535);
        for(n=0;n<spec.records.length;n++){id=spec.records[n];need(integer(id,1,65535) && !data.records[id],"record_registry_invalid");data.records[id]=true;}
        need(spec.fields && typeof spec.fields==="object","field_registry_required");keys=Object.keys(spec.fields);
        for(n=0;n<keys.length;n++){
            id=Number(keys[n]);f=spec.fields[keys[n]];need(integer(id,1,255) && f && typeof f==="object","field_registry_invalid");kind=f.kind;
            need(kind==="uint" || kind==="sint" || kind==="bool","field_type_unknown");lo=kind==="sint"?-MAX_SINT:0;hi=kind==="bool"?1:kind==="sint"?MAX_SINT:MAX_UINT;
            min=f.min===undefined?lo:f.min;max=f.max===undefined?hi:f.max;
            need(integer(min,lo,hi) && integer(max,min,hi),"field_range_invalid");
            need(f.default===undefined || f.default===null || integer(f.default,min,max),"field_default_invalid");
            definition={kind:kind,min:min,max:max};if(f.default!==undefined && f.default!==null)definition.default=f.default;
            if(f.enum){dense(f.enum,256);definition.enum=Object.create(null);need(f.enum.length>0,"field_enum_default_invalid");
                for(var j=0;j<f.enum.length;j++){var v=f.enum[j];need(integer(v,min,max) && !definition.enum[v],"field_enum_invalid");definition.enum[v]=true;}
                need(definition.default===undefined || definition.enum[definition.default],"field_enum_default_invalid");
            }data.fields[id]=definition;
        }
        need(keys.length>0,"field_registry_empty");var schema=Object.freeze({id:data.id,sha256:data.sha256,record_count:spec.records.length,field_count:keys.length});compiled.set(schema,data);return schema;
    }
    function compileLookup(lookup,token){
        lookup=lookup && (lookup.Data || lookup);need(lookup && sha(lookup.sha256) && lookup.records && lookup.fields,"lookup_identity_invalid");
        var ids=[],fields=Object.create(null),records=lookup.records,keys=Object.keys(records),n,r;
        for(n=0;n<keys.length;n++){r=records[keys[n]];need(r && integer(r.id,1,65535) && (Array.isArray(records) || Number(keys[n])===r.id) && (r.tombstone===undefined || typeof r.tombstone==="boolean"),"record_registry_invalid");if(r.tombstone!==true)ids.push(r.id);}
        keys=Object.keys(lookup.fields);
        for(n=0;n<keys.length;n++){r=lookup.fields[keys[n]];var id=r.id===undefined?Number(keys[n]):r.id;need(!own(fields,id),"field_registry_invalid");fields[id]=r;}
        return compileSchema({id:token,sha256:lookup.sha256,records:ids,fields:fields});
    }
    function bindingData(schema,binding){
        var data=dataOf(schema);need(binding && binding.schema_sha256===data.sha256 && binding.schema===data.id,"schema_binding_mismatch");
        need(integer(binding.session,1,MAX_TOKEN) && integer(binding.epoch,1,MAX_TOKEN) && integer(binding.view,1,MAX_TOKEN),"binding_token_invalid");
        return {schema:data.id,schema_sha256:data.sha256,session:binding.session,epoch:binding.epoch,view:binding.view};
    }
    function fieldValue(field,value){
        if(field.kind==="bool" && typeof value==="boolean")value=value?1:0;
        need(integer(value,field.min,field.max),"field_value_range");need(!field.enum || field.enum[value],"field_enum_unknown");return value;
    }
    function decodeChanges(data,raw){
        var out=[],seen=Object.create(null),cursor={at:0},record,tag,id,field,value,key,change;
        while(cursor.at<raw.length){record=readUint(raw,cursor);tag=readUint(raw,cursor);need(data.records[record],"record_unknown");id=Math.floor(tag/2);field=data.fields[id];need(!!field,"field_unknown");key=record*256+id;need(!seen[key],"duplicate_changed_index");seen[key]=true;change={record:record,field:id};
            if(tag%2===1)change.remove=true;else{value=readUint(raw,cursor);if(field.kind==="sint")value=value%2===1?-(value+1)/2:value/2;change.value=fieldValue(field,value);}
            out.push(change);need(out.length<=65535,"change_count_limit");
        }return out;
    }
    function valueBudget(options){var budget=options && options.value_budget || 24;need(integer(budget,16,50),"value_budget_invalid");return budget;}
    function parsePacket(packet,options){
        var budget=valueBudget(options);
        need(packet && typeof packet==="object" && !Array.isArray(packet),"packet_required");var keys=Object.keys(packet);need(keys.length===1 && keys[0]==="d","packet_key_unknown");
        need(typeof packet.d==="string" && packet.d.length<=budget,"encoded_value_budget_exceeded");
        var raw=b64decode(packet.d),tag=raw.charCodeAt(0),cursor={at:1},v=[],n;need(tag===16 || tag===17 || tag===18,"wire_version_unknown");
        for(n=0;n<7;n++)v.push(readUint(raw,cursor));
        for(n=0;n<4;n++)need(integer(v[n],1,MAX_TOKEN),"binding_token_invalid");
        need(integer(v[4],tag===18?0:1,MAX_REV),"revision_requires_new_epoch");need(integer(v[6],1,MAX_TOKEN) && integer(v[5],1,v[6]),"fragment_index_invalid");
        return {kind:tag===18?"resync":tag===17?"full":"delta",full:tag===17,schema:v[0],session:v[1],epoch:v[2],view:v[3],revision:v[4],index:v[5],count:v[6],body:raw.slice(cursor.at)};
    }
    function peekHeader(packet,options){var frame=parsePacket(packet,options);delete frame.body;return frame;}
    function decodePacket(schema,binding,packet,options){
        binding=bindingData(schema,binding);var frame=parsePacket(packet,options);
        need(frame.schema===binding.schema,"schema_unknown");need(frame.session===binding.session && frame.epoch===binding.epoch && frame.view===binding.view,"stale_binding");return frame;
    }
    function header(binding,revision,tag,index,count){return String.fromCharCode(tag)+uint(binding.schema)+uint(binding.session)+uint(binding.epoch)+uint(binding.view)+uint(revision)+uint(index)+uint(count);}
    function encode(schema,binding,revision,changes,options){
        options=options||{};binding=bindingData(schema,binding);need(integer(revision,1,MAX_REV),"revision_requires_new_epoch");
        var budget=valueBudget(options),data=dataOf(schema),raw="",seen=Object.create(null),n,c,field,key,value;
        dense(changes,65535);
        for(n=0;n<changes.length;n++){c=changes[n];need(c&&typeof c==="object","change_required");Object.keys(c).forEach(function(k){need(k==="record"||k==="field"||k==="value"||k==="remove","change_key_unknown");});
            need(data.records[c.record],"record_unknown");field=data.fields[c.field];need(!!field,"field_unknown");key=c.record*256+c.field;need(!seen[key],"duplicate_changed_index");seen[key]=true;need(c.remove===undefined||c.remove===true,"remove_flag_invalid");
            raw+=uint(c.record)+uint(c.field*2+(c.remove?1:0));if(c.remove)need(c.value===undefined,"removed_value_present");else{value=fieldValue(field,c.value);if(field.kind==="sint")value=value<0?-value*2-1:value*2;raw+=uint(value);}
        }
        if(!raw.length&&!options.full)return {packets:[],report:{changes:0,business_bytes:0,protocol_bytes:0,ascii_bytes:0,native_bytes:null}};
        var rawLimit=Math.floor(budget*3/4),count=1,capacity,next,tag=options.full===true?17:16;
        for(;;){capacity=rawLimit-header(binding,revision,tag,count,count).length;need(capacity>0||!raw.length&&capacity===0,"context_exceeds_value_budget");next=raw.length?Math.ceil(raw.length/capacity):1;need(next<=MAX_TOKEN,"transaction_fragment_limit");if(next===count)break;count=next;}
        var packets=[],totalRaw=0,totalASCII=0,maxASCII=0;
        for(n=1;n<=count;n++){var frame=header(binding,revision,tag,n,count)+raw.slice((n-1)*capacity,n*capacity),ascii=b64encode(frame);need(ascii.length<=budget,"encoded_value_budget_exceeded");packets.push({d:ascii});totalRaw+=frame.length;totalASCII+=ascii.length;maxASCII=Math.max(maxASCII,ascii.length);}
        return {packets:packets,report:{changes:changes.length,business_bytes:raw.length,protocol_bytes:totalRaw,ascii_bytes:totalASCII,max_value_bytes:maxASCII,fragments:count,value_budget:budget,native_bytes:null}};
    }
    function encodeResync(schema,binding,revision,reason,options){
        binding=bindingData(schema,binding);need(integer(revision,0,MAX_REV) && integer(reason,1,5),"resync_fields_invalid");
        var value=b64encode(header(binding,revision,18,1,1)+uint(reason));need(value.length<=valueBudget(options),"encoded_value_budget_exceeded");return {d:value};
    }
    function decodeResync(schema,binding,packet,options){
        var frame=decodePacket(schema,binding,packet,options);need(frame.kind==="resync" && frame.index===1 && frame.count===1,"resync_frame_required");var cursor={at:0},reason=readUint(frame.body,cursor);need(integer(reason,1,5) && cursor.at===frame.body.length,"resync_fields_invalid");return {revision:frame.revision,reason:reason};
    }
    function newReceiver(schema,binding,options){
        var data=dataOf(schema);binding=bindingData(schema,binding);options=options||{};valueBudget(options);
        var limit=options.assembly_bytes===undefined?262144:options.assembly_bytes,maxFragments=options.max_fragments===undefined?MAX_TOKEN:options.max_fragments;
        need(integer(limit,1,1048576) && integer(maxFragments,1,MAX_TOKEN),"receiver_budget_invalid");
        var revision=0,initialized=false,assembly=null,pending=null,disposed=false,generation=1;
        function accept(packet){
            need(!disposed,"disposed");need(!pending,"commit_required");var frame=decodePacket(schema,binding,packet,options);need(frame.kind!=="resync","unexpected_control");need(frame.revision>revision,"stale_revision");
            if(assembly && frame.revision<assembly.revision)throw new Error("stale_fragment");
            if(!frame.full && (!initialized || frame.revision!==revision+1)){assembly=null;throw new Error("missing_base");}
            if(frame.count>maxFragments){assembly=null;throw new Error("assembly_fragment_limit");}
            if(!assembly || frame.revision>assembly.revision)assembly={revision:frame.revision,full:frame.full,count:frame.count,parts:Object.create(null),received:0,bytes:0};
            if(assembly.full!==frame.full || assembly.count!==frame.count){assembly=null;throw new Error("fragment_identity_conflict");}
            var old=assembly.parts[frame.index];if(old!==undefined){if(old!==frame.body){assembly=null;throw new Error("duplicate_fragment_conflict");}return {pending:true,duplicate:true};}
            if(assembly.bytes+frame.body.length>limit){assembly=null;throw new Error("assembly_byte_limit");}
            assembly.parts[frame.index]=frame.body;assembly.bytes+=frame.body.length;assembly.received++;
            if(assembly.received<assembly.count)return {pending:true,received:assembly.received,count:assembly.count};
            var parts=[],n,changes;for(n=1;n<=assembly.count;n++)parts.push(assembly.parts[n]);
            try{changes=decodeChanges(data,parts.join(""));}catch(error){assembly=null;throw error;}
            var transaction={full:assembly.full,revision:assembly.revision,changes:changes,generation:generation};pending={transaction:transaction,revision:assembly.revision};assembly=null;return transaction;
        }
        function commit(transaction){need(!disposed,"disposed");need(pending && pending.transaction===transaction,"transaction_not_pending");revision=pending.revision;initialized=true;pending=null;return true;}
        function abort(){assembly=null;pending=null;}
        function inspect(){return {revision:revision,initialized:initialized,assembling:!!assembly,commit_pending:!!pending,received:assembly?assembly.received:0,buffered_bytes:assembly?assembly.bytes:0,generation:generation,disposed:disposed};}
        function rebind(next){need(!disposed,"disposed");binding=bindingData(schema,next);revision=0;initialized=false;abort();generation++;return generation;}
        function dispose(){abort();disposed=true;generation++;}
        return {Accept:accept,Commit:commit,Abort:abort,Inspect:inspect,Rebind:rebind,Dispose:dispose,accept:accept,commit:commit,abort:abort,inspect:inspect};
    }
    // Transport integration is injected. Failed/stale frames never become model
    // values. Resync is latched until a valid full commit or trusted rebind.
    function newClient(schema,binding,options){
        options=options||{};binding=bindingData(schema,binding);var receiver=newReceiver(schema,binding,options),state=Object.create(null),disposed=false,generation=1,resyncPending=false;
        var queues=[[],[]],heads=[0,0],queued=0,limit=options.queue_packets===undefined?2048:options.queue_packets;
        var clock=options.now || function(){return Date.now();},deadline=options.assembly_deadline_ms===undefined?5000:options.assembly_deadline_ms,started=null,timer=null;
        need(integer(limit,1,65536) && integer(deadline,1,60000),"client_budget_invalid");
        var counters={frames:0,commits:0,changed_fields:0,resyncs:0,stale:0,queued:0};
        function cancelDeadline(){if(timer!==null && options.cancel)options.cancel(timer);timer=null;started=null;}
        function failure(code){
            if(code==="stale_binding" || code==="stale_revision" || code==="stale_fragment"){counters.stale++;return {error:code,stale:true};}
            receiver.Abort();cancelDeadline();var reason=code==="missing_base"?1:code==="assembly_deadline"?2:code==="schema_unknown"?3:code==="assembly_byte_limit" || code==="assembly_fragment_limit" || code==="queue_limit"?5:4;
            if(!resyncPending && !disposed){resyncPending=true;counters.resyncs++;var packet=encodeResync(schema,binding,receiver.Inspect().revision,reason,options);if(options.onResync)options.onResync(packet,reason);}
            return {error:code,resync_pending:resyncPending};
        }
        function expire(now){if(disposed)return {error:"disposed"};if(started!==null && now-started>=deadline)return failure("assembly_deadline");return {pending:receiver.Inspect().assembling};}
        function armDeadline(){
            if(started!==null)return;started=clock();
            if(options.schedule){var current=generation;timer=options.schedule(deadline,function(){timer=null;if(!disposed && current===generation)expire(clock());});}
        }
        function accept(packet){
            if(disposed)return {error:"disposed"};counters.frames++;
            if(started!==null && clock()-started>=deadline)failure("assembly_deadline");
            var tx;try{tx=receiver.Accept(packet);}catch(error){return failure(error.message);}
            if(tx.pending){armDeadline();return tx;}
            cancelDeadline();var next=tx.full?Object.create(null):state,changed=[],seen=Object.create(null),n,c,row;
            // Stage copies only of changed dynamic records. No catalogue clone.
            var staged=Object.create(null);
            var effective=0;
            for(n=0;n<tx.changes.length;n++){c=tx.changes[n];row=state[c.record];
                if(!tx.full && (c.remove? !row || !own(row,c.field):row && own(row,c.field) && row[c.field]===c.value))continue;
                effective++;if(!seen[c.record]){seen[c.record]=true;changed.push(c.record);row=Object.create(null);
                if(!tx.full && state[c.record]){var keys=Object.keys(state[c.record]);for(var j=0;j<keys.length;j++)row[keys[j]]=state[c.record][keys[j]];}
                staged[c.record]=row;
            }row=staged[c.record];if(c.remove)delete row[c.field];else row[c.field]=c.value;}
            try{if(options.validate && options.validate(tx,staged)===false)throw new Error("application_rejected");}catch(error){return failure(error.message || "application_rejected");}
            for(n=0;n<changed.length;n++)next[changed[n]]=staged[changed[n]];
            state=next;receiver.Commit(tx);if(tx.full)resyncPending=false;counters.commits++;counters.changed_fields+=effective;
            if(options.onCommit && (tx.full || changed.length))options.onCommit(tx,changed,read);
            return {committed:true,full:tx.full,revision:tx.revision,changed:changed};
        }
        function read(record,field){var row=state[record];return field===undefined?row:row && row[field];}
        function enqueue(packet,priority){
            if(disposed)return {error:"disposed"};if(queued>=limit)return failure("queue_limit");
            // Copy the only scalar; callers cannot mutate a queued packet.
            if(!packet || typeof packet.d!=="string" || Object.keys(packet).length!==1)return failure("packet_key_unknown");
            if(packet.d.length>valueBudget(options))return failure("encoded_value_budget_exceeded");
            queues[priority?0:1].push({d:packet.d});queued++;counters.queued++;return {queued:true};
        }
        function drain(budget){need(integer(budget,1,65536),"drain_budget_invalid");var out=[],q,item;while(queued>0 && budget-->0){q=heads[0]<queues[0].length?0:1;item=queues[q][heads[q]];queues[q][heads[q]++]=null;queued--;out.push(accept(item));if(heads[q]===queues[q].length){queues[q]=[];heads[q]=0;}else if(heads[q]>=limit){queues[q]=queues[q].slice(heads[q]);heads[q]=0;}}return out;}
        function clearQueue(){queues=[[],[]];heads=[0,0];queued=0;}
        function abort(){receiver.Abort();cancelDeadline();clearQueue();}
        function rebind(next){need(!disposed,"disposed");next=bindingData(schema,next);receiver.Rebind(next);binding=next;state=Object.create(null);resyncPending=false;generation++;cancelDeadline();clearQueue();return generation;}
        function dispose(){if(disposed)return;disposed=true;generation++;cancelDeadline();clearQueue();state=Object.create(null);receiver.Dispose();}
        function inspect(){return {receiver:receiver.Inspect(),generation:generation,disposed:disposed,resync_pending:resyncPending,queued:queued,deadline_active:started!==null,counters:{frames:counters.frames,commits:counters.commits,changed_fields:counters.changed_fields,resyncs:counters.resyncs,stale:counters.stale,queued:counters.queued}};}
        return {Accept:accept,Read:read,Enqueue:enqueue,Drain:drain,Expire:expire,Abort:abort,Rebind:rebind,Dispose:dispose,Inspect:inspect};
    }
    return {EVENT:"cw",KEY:"d",VERSION:1,DEFAULT_VALUE_BUDGET:24,CompileSchema:compileSchema,CompileLookup:compileLookup,PeekHeader:peekHeader,DecodePacket:decodePacket,DecodeResync:decodeResync,Encode:encode,EncodeResync:encodeResync,NewReceiver:newReceiver,NewClient:newClient,
        compile_schema:compileSchema,compile_lookup:compileLookup,decode_packet:decodePacket,encode_resync:encodeResync,new_receiver:newReceiver,
        limits:{record_id:65535,field_id:255,token:MAX_TOKEN,revision:MAX_REV,uint:MAX_UINT,sint:MAX_SINT}};
}));
