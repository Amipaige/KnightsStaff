// Retire the old Items Report tab and duplicate dashboard shortage UI.
(function(){
  function cleanup(){
    document.querySelectorAll('[data-tab="report"]').forEach(el=>el.remove());
    document.querySelectorAll('#report').forEach(el=>el.remove());
    document.querySelectorAll('.shortage-panel,.shortage-card').forEach(el=>el.remove());
    document.querySelectorAll('#dashboard .panel').forEach(el=>{
      const text=(el.textContent||'').trim().toLowerCase();
      if(text.startsWith('stock shortages')) el.remove();
    });
    document.querySelectorAll('#dashboard .card').forEach(el=>{
      const label=el.querySelector('.label');
      if(label && label.textContent.trim().toLowerCase()==='stock shortages') el.remove();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',cleanup); else cleanup();
  setTimeout(cleanup,50);
  setTimeout(cleanup,500);
  setTimeout(cleanup,1500);
  new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true});
})();
