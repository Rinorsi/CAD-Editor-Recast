var TL={phase:'boot',start:Date.now(),requests:[],pages:[],fire:0,draws:[],calls:{}};
(function(){
 var ingest=Reg.ingest;Reg.ingest=function(k,v){var t=Date.now();try{return ingest.apply(this,arguments);}finally{TL.pages.push({t:t,ms:Date.now()-t,key:k,offset:v&&v.offset,done:v&&v.done,phase:TL.phase});}};
 var fire=Reg.fire;Reg.fire=function(k){TL.fire++;return fire.apply(this,arguments);};
 var draw=drawTabBody;drawTabBody=function(){TL.draws.push({t:Date.now(),phase:TL.phase});return draw.apply(this,arguments);};
 ['options','defaultsOf','blockProps','blockPropsAll'].forEach(function(k){var f=Reg[k];Reg[k]=function(){TL.calls[k]=(TL.calls[k]||0)+1;return f.apply(this,arguments);};});
})();
