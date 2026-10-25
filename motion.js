/* Mentor 7.8.2 — interactions, independent of stored data and AI. */
(function(){
  'use strict';
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease='cubic-bezier(.22,1,.36,1)';
  const detailsControllers=new WeakMap();
  const listAnimations=new WeakMap();
  const liveAnimations=new Set();
  let initialized=false;
  let editor={revision:0,open:false,active:false,animations:[],returnFocus:null,overflow:''};

  function canAnimate(){return !preference.matches&&typeof Element.prototype.animate==='function'}
  function animate(el,frames,options={}){
    if(!el||!canAnimate())return null;
    try{
      const animation=el.animate(frames,{duration:300,easing:ease,...options});
      liveAnimations.add(animation);
      animation.finished.then(()=>liveAnimations.delete(animation),()=>liveAnimations.delete(animation));
      return animation;
    }catch{return null}
  }
  function settled(animation){return animation?animation.finished.catch(()=>{}):Promise.resolve()}
  function cancel(animation){if(animation)animation.cancel()}
  function finishMotion(){for(const a of liveAnimations){try{a.finish()}catch{a.cancel()}}}
  preference.addEventListener?.('change',e=>{if(e.matches)finishMotion()});

  function prepareDetails(details){
    if(detailsControllers.has(details))return detailsControllers.get(details);
    const summary=[...details.children].find(el=>el.tagName==='SUMMARY');
    if(!summary)return null;
    const popup=details.classList.contains('moreTools');
    const body=document.createElement('div');
    body.className=popup?'motion-popup-body':'motion-details-body';
    for(const node of [...details.childNodes])if(node!==summary)body.appendChild(node);
    details.appendChild(body);
    details.classList.add('motion-details');
    if(popup)summary.setAttribute('aria-label','Opciones de Mentor');
    const c={details,summary,body,popup,panel:popup?body.querySelector('.moreToolsMenu'):body,expanded:details.open,revision:0,animation:null};
    detailsControllers.set(details,c);
    summary.setAttribute('aria-expanded',String(c.expanded));
    summary.addEventListener('click',e=>{e.preventDefault();setDetailsOpen(details,!c.expanded)});
    details.addEventListener('toggle',()=>{
      if(!c.animation){c.expanded=details.open;summary.setAttribute('aria-expanded',String(c.expanded));details.dataset.motionExpanded=String(c.expanded);c.body.inert=!c.expanded}
    });
    return c;
  }

  async function setDetailsOpen(details,expanded){
    const c=prepareDetails(details);if(!c)return;
    if(c.expanded===expanded&&!c.animation)return;
    const wasOpen=details.open;
    const height=wasOpen?c.body.getBoundingClientRect().height:0;
    const visibleStyle=wasOpen?getComputedStyle(c.panel):null;
    const opacity=wasOpen?visibleStyle.opacity:'0';
    const transform=wasOpen?visibleStyle.transform:'translateY(-8px) scale(.97)';
    const revision=++c.revision;
    cancel(c.animation);c.animation=null;
    c.expanded=expanded;
    c.summary.setAttribute('aria-expanded',String(expanded));
    c.details.dataset.motionExpanded=String(expanded);
    c.body.inert=!expanded;
    if(!expanded&&c.body.contains(document.activeElement))c.summary.focus({preventScroll:true});
    if(!canAnimate()){
      details.open=expanded;
      c.body.style.overflow='';
      return;
    }
    // Keep native details open until its closing animation has finished.
    details.open=true;
    if(c.popup){
      c.animation=animate(c.panel,[
        {opacity,transform},
        {opacity:expanded?1:0,transform:expanded?'translateY(0) scale(1)':'translateY(-6px) scale(.97)'}
      ],{duration:expanded?260:180});
    }else{
      c.body.style.overflow='hidden';
      c.animation=animate(c.body,[
        {height:height+'px',opacity:wasOpen?1:0},
        {height:(expanded?c.body.scrollHeight:0)+'px',opacity:expanded?1:0}
      ],{duration:expanded?320:230});
    }
    await settled(c.animation);
    if(c.revision!==revision)return;
    c.animation=null;
    details.open=expanded;
    c.body.style.overflow='';
  }

  function pressFeedback(target,event){
    if(!canAnimate()||target.disabled)return;
    animate(target,[{transform:'scale(1)'},{transform:'scale(.975)',offset:.3},{transform:'scale(1)'}],{duration:220});
    // A tiny light wave is clipped inside the control, without changing its size.
    const rect=target.getBoundingClientRect();
    const wave=document.createElement('span');
    wave.className='motion-ripple';wave.setAttribute('aria-hidden','true');
    const size=Math.max(rect.width,rect.height)*1.8;
    const x=event.detail?event.clientX-rect.left:rect.width/2;
    const y=event.detail?event.clientY-rect.top:rect.height/2;
    Object.assign(wave.style,{width:size+'px',height:size+'px',left:(x-size/2)+'px',top:(y-size/2)+'px'});
    target.appendChild(wave);
    const animation=animate(wave,[{transform:'scale(.1)',opacity:.1},{transform:'scale(1)',opacity:0}],{duration:340});
    settled(animation).then(()=>wave.remove());
  }

  function openEditor(){
    const backdrop=document.getElementById('editorBackdrop');
    const modal=backdrop.querySelector('.editorModal');
    const wasActive=editor.active;
    const current=wasActive?{opacity:getComputedStyle(modal).opacity,transform:getComputedStyle(modal).transform}:{opacity:0,transform:'translateY(20px) scale(.975)'};
    const backdropOpacity=wasActive?getComputedStyle(backdrop).opacity:0;
    if(!editor.active){editor.returnFocus=document.activeElement;editor.overflow=document.body.style.overflow;editor.active=true}
    editor.revision++;editor.open=true;
    editor.animations.forEach(cancel);
    backdrop.inert=false;backdrop.classList.add('visible');
    document.body.style.overflow='hidden';
    editor.animations=[
      animate(backdrop,[{opacity:backdropOpacity},{opacity:1}],{duration:240}),
      animate(modal,[current,{opacity:1,transform:'translateY(0) scale(1)'}],{duration:360})
    ];
    modal.focus({preventScroll:true});
  }
  async function closeEditor(){
    if(!editor.active||!editor.open)return;
    const revision=++editor.revision;
    editor.open=false;
    const backdrop=document.getElementById('editorBackdrop');
    const modal=backdrop.querySelector('.editorModal');
    // Capture the current pose so fast open/close gestures remain continuous.
    const current={opacity:getComputedStyle(modal).opacity,transform:getComputedStyle(modal).transform};
    const backdropOpacity=getComputedStyle(backdrop).opacity;
    editor.animations.forEach(cancel);
    backdrop.inert=true;
    editor.animations=[
      animate(backdrop,[{opacity:backdropOpacity},{opacity:0}],{duration:200}),
      animate(modal,[current,{opacity:0,transform:'translateY(12px) scale(.985)'}],{duration:200})
    ];
    await Promise.all(editor.animations.map(settled));
    if(editor.revision!==revision)return;
    backdrop.classList.remove('visible');
    editor.active=false;editor.animations=[];
    document.body.style.overflow=editor.overflow;
    const target=editor.returnFocus?.isConnected?editor.returnFocus:document.getElementById('inbox');
    target?.focus({preventScroll:true});
  }

  function renderList(container,items,renderItem){
    const oldHeight=container.getBoundingClientRect().height;
    cancel(listAnimations.get(container));
    const old=new Map([...container.querySelectorAll('.item[data-id]')].map(el=>[el.dataset.id,{el,rect:el.getBoundingClientRect(),markup:el._mentorMarkup}]));
    let cursor=container.firstChild;
    const entered=[];const changed=[];
    for(const item of items){
      const markup=renderItem(item);const prev=old.get(item.id);
      let el=prev?.el;
      if(!el||prev.markup!==markup){
        const template=document.createElement('template');template.innerHTML=markup.trim();
        const fresh=template.content.firstElementChild;
        fresh._mentorMarkup=markup;
        if(el){
          const focused=[...el.querySelectorAll('button')].indexOf(document.activeElement);
          if(cursor===el)cursor=fresh;
          el.replaceWith(fresh);
          if(focused>=0)fresh.querySelectorAll('button')[focused]?.focus({preventScroll:true});
          changed.push({el:fresh,prev,item});
        }else entered.push(fresh);
        el=fresh;
      }
      if(el!==cursor)container.insertBefore(el,cursor);
      cursor=el.nextSibling;
    }
    // Remove only obsolete rows; untouched controls keep focus on background sync.
    const ids=new Set(items.map(x=>x.id));
    for(const [id,prev] of old)if(!ids.has(id)){
      if(canAnimate()&&prev.rect.height){
        const ghost=prev.el.cloneNode(true);
        ghost.classList.add('motion-item-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
        ghost.querySelectorAll('.motion-ripple').forEach(n=>n.remove());
        const computed=getComputedStyle(prev.el);
        Object.assign(ghost.style,{position:'fixed',left:prev.rect.left+'px',top:prev.rect.top+'px',width:prev.rect.width+'px',height:prev.rect.height+'px',padding:computed.padding,margin:'0',zIndex:80,pointerEvents:'none'});
        document.body.appendChild(ghost);
        settled(animate(ghost,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-20px) scale(.985)'}],{duration:260})).then(()=>ghost.remove());
      }
      prev.el.remove();
    }
    container.querySelectorAll('.empty').forEach(el=>{if(items.length)el.remove()});
    if(!items.length&&!container.querySelector('.empty')){
      const empty=document.createElement('div');empty.className='empty';empty.textContent='Un poco de espacio libre por acá.';container.appendChild(empty);
      animate(empty,[{opacity:0},{opacity:1}],{duration:320,delay:80});
    }
    if(!canAnimate())return;
    const endHeight=container.getBoundingClientRect().height;
    if(old.size&&Math.abs(endHeight-oldHeight)>1){
      const a=animate(container,[{height:oldHeight+'px'},{height:endHeight+'px'}],{duration:360});
      listAnimations.set(container,a);
    }
    for(const [index,el] of entered.entries())animate(el,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:380,delay:Math.min(index*28,140)});
    for(const {el,prev,item} of changed){
      const delta=prev.rect.top-el.getBoundingClientRect().top;
      animate(el,[{opacity:.55,transform:`translateY(${delta}px)`,backgroundColor:item.done?'rgba(140,194,163,.10)':'rgba(177,157,198,.09)'},{opacity:1,transform:'translateY(0)',backgroundColor:'transparent'}],{duration:380});
    }
    for(const el of container.querySelectorAll('.item[data-id]')){
      if(entered.includes(el)||changed.some(c=>c.el===el))continue;
      const prev=old.get(el.dataset.id);if(!prev)continue;
      const delta=prev.rect.top-el.getBoundingClientRect().top;
      if(Math.abs(delta)>1)animate(el,[{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:360});
    }
  }

  function updateCount(el,value){
    const text=String(value);if(el.textContent===text)return;
    el.textContent=text;
    animate(el,[{transform:'scale(.85)',opacity:.6},{transform:'scale(1.12)',opacity:1,offset:.55},{transform:'scale(1)',opacity:1}],{duration:320});
  }

  function init(){
    if(initialized)return;initialized=true;
    document.querySelectorAll('details').forEach(prepareDetails);
    const modal=document.querySelector('.editorModal');
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('tabindex','-1');
    modal.querySelector('h3').id='editorHeading';modal.setAttribute('aria-labelledby','editorHeading');
    modal.querySelectorAll('label').forEach(label=>{const field=label.parentElement.querySelector('input,select,textarea');if(field?.id)label.htmlFor=field.id});
    document.addEventListener('click',e=>{
      const control=e.target.closest('button,summary');
      if(control&&!control.closest('[inert]'))pressFeedback(control,e);
    },true);
    document.addEventListener('pointerdown',e=>{
      document.querySelectorAll('.moreTools[open]').forEach(details=>{if(!details.contains(e.target))setDetailsOpen(details,false)});
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if(editor.open){e.preventDefault();closeEditor();return}
        document.querySelectorAll('.moreTools[open]').forEach(details=>{e.preventDefault();setDetailsOpen(details,false);details.querySelector('summary').focus()});
      }
      if(e.key==='Tab'&&editor.open){
        const controls=[...modal.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(el=>!el.disabled);
        const first=controls[0],last=controls.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===modal)){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===modal)){e.preventDefault();first?.focus()}
      }
    });
    // Feedback for filters, checkboxes, file uploads and newly visible messages.
    document.addEventListener('change',e=>{
      if(e.target.matches('select,input[type=checkbox],input[type=radio]'))animate(e.target,[{boxShadow:'0 0 0 3px rgba(201,176,237,.25)'},{boxShadow:'0 0 0 0 transparent'}],{duration:420});
    });
    const visibilityObserver=new MutationObserver(records=>{
      for(const {target} of records){
        if(getComputedStyle(target).display!=='none'&&target.getBoundingClientRect().height)animate(target,[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:280});
      }
    });
    for(const id of ['lastAction','questionbox','transcript','photoGrid','audioStatus','textStatus']){
      const el=document.getElementById(id);if(el)visibilityObserver.observe(el,{attributes:true,attributeFilter:['style','class'],childList:['photoGrid','audioStatus','textStatus'].includes(id)});
    }
  }
  window.MentorMotion={init,openEditor,closeEditor,renderList,setDetailsOpen,updateCount};
})();
