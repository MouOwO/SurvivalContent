(function(){
    // Runs before the original UI controllers. Keep the first native layout frame hidden.
    var ctx=$.GetContextPanel(),root=ctx;
    ctx.AddClass("HandoffBoot");
    while(root.GetParent&&root.GetParent())root=root.GetParent();
    var lower=root.FindChildTraverse("lower_hud");
    if(lower){lower.style.transitionDuration="0s";lower.style.transitionProperty="none";lower.style.animationName="none";lower.style.opacity="0";}
})();
