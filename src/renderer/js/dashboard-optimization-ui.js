(function initDashboardOptimizationUi(globalScope) {
  'use strict';
  const baseRender = globalScope.renderDashboardOverview;
  let visibleAttention = [];

  function preserveScroll(mutator) {
    const before = document.querySelector('#dashboardWorkplace .workplace-scroll-content')?.scrollTop || 0;
    mutator(); globalScope.saveDatabase(); baseRender(); optimize();
    globalScope.requestAnimationFrame?.(() => { const area=document.querySelector('#dashboardWorkplace .workplace-scroll-content'); if(area) area.scrollTop=before; });
  }
  function snapshot() { return DashboardWorkplace.snapshot(db, { schoolYear:db.schoolYear || '2026-2027' }); }
  function escText(value) { return typeof globalScope.esc === 'function' ? globalScope.esc(String(value ?? '')) : String(value ?? ''); }

  globalScope.setDashboardAnalyticsScope = scope => preserveScroll(() => { DashboardWorkplace.normalize(db).preferences.analyticsScope=scope==='all'?'all':'current'; });
  globalScope.setDashboardAnalyticsTerm = term => preserveScroll(() => {
    const value=['1','2','3'].includes(String(term))?String(term):'1'; db.currentTerm=value; DashboardWorkplace.rememberContext(db,{assignmentId:db.currentAssignmentId,term:value});
  });
  globalScope.manageDashboardAssessments = () => globalScope.openDashboardWorkplaceAction('grading',db.currentAssignmentId,db.currentTerm);
  globalScope.setDashboardAttentionScope = scope => preserveScroll(() => { DashboardWorkplace.normalize(db).preferences.attentionScope=scope==='all'?'all':'current'; });
  globalScope.dismissDashboardAttentionItem = index => {
    const item=visibleAttention[index]; if(!item?.dismissible)return;
    preserveScroll(()=>{const prefs=DashboardWorkplace.normalize(db).preferences;prefs.dismissedAttention=Array.from(new Set([...(prefs.dismissedAttention||[]),item.id]));});
  };
  globalScope.snoozeDashboardAttentionItem = index => {
    const item=visibleAttention[index]; if(!item?.dismissible)return;
    preserveScroll(()=>{const until=new Date();until.setDate(until.getDate()+1);DashboardWorkplace.normalize(db).preferences.snoozedAttention[item.id]=until.toISOString();});
  };
  globalScope.openOptimizedDashboardAttention = index => {
    const item=visibleAttention[index]; if(!item)return;
    if(item.action==='advisory')return globalScope.openDashboardWorkplaceAction('advisory');
    globalScope.openDashboardWorkplaceAction(item.action||'grading',item.assignmentId,item.term);
  };

  function optimizeClassPerformance(data) {
    const card=document.querySelector('#dashboardWorkplace .workplace-component-card');
    if(!card)return;
    const chart=card.querySelector('[data-component-performance]');
    const assignment=data.currentAssignment, performance=data.analytics.componentPerformance||{};
    const components=[['written','Written Works','written'],['performance','Performance Tasks','performance'],['quarterly','SA&TE','quarterly']];
    const rows=components.map(([key,label,tone])=>{const item=performance[key]||{};const value=item.percent;const hasHps=Number(item.expected||0)>0;const achievementWidth=value==null?0:Math.max(2,Math.min(100,value));const coverage=Number(item.coverage||0);const completionWidth=Math.max(0,Math.min(100,coverage));return `<div class="workplace-component-row workplace-component-row--${tone}"><div class="workplace-component-row__heading"><span><i></i><strong>${label}</strong></span>${hasHps?'':`<small>No assessments with HPS</small>`}</div>${hasHps?`<div class="workplace-component-metric"><span>Class achievement</span><div class="workplace-component-row__track" role="img" aria-label="${label} class achievement ${value}%"><i style="width:${achievementWidth}%"></i></div><strong>${value}%</strong></div><div class="workplace-component-metric workplace-component-metric--completion"><span>Entry completion <small>${item.entered||0}/${item.expected||0}</small></span><div class="workplace-component-row__track" role="img" aria-label="${label} entry completion ${coverage}%"><i style="width:${completionWidth}%"></i></div><strong>${coverage}%</strong></div>`:`<div class="workplace-component-empty">Add an assessment and its Highest Possible Score to calculate performance.</div>`}</div>`;}).join('');
    card.querySelector('header').innerHTML=`<div><h4>Overall class performance</h4><p>${assignment?`Grade ${escText(assignment.gradeLevel||'')} - ${escText(assignment.section||'')} · ${escText(assignment.subject||'')}`:'No working class selected'} · Term ${data.currentTerm}</p></div>`;
    chart.innerHTML=rows+`<p class="workplace-component-note">Written Works and Performance Tasks use earned points against HPS. SA&TE follows the grading sheet: ST1 30% + ST2 30% + TE 40%. Entry completion shows grading progress; missing scores contribute zero until entered.</p>`;
  }

  function actionLabel(item) {
    return { 'invalid-scores':'Review Scores','missing-hps':'Set HPS','incomplete-scores':'Continue Grading','empty-class':'Add Learners','advisory-conflicts':'Review Conflict','upcoming-deadline':'Review' }[item.type]||'Review';
  }
  function optimizeAttention(data) {
    const panels=[...document.querySelectorAll('#dashboardWorkplace .workplace-panel')];
    const panel=panels.find(item=>item.querySelector('h3')?.textContent.toLowerCase().includes('needs attention'));
    if(!panel)return;
    const prefs=data.preferences, now=new Date();
    const termAttention=data.attention.filter(item=>{
      if(item.term&&String(item.term)!==String(data.currentTerm))return false;
      if(prefs.attentionScope!=='all'&&item.assignmentId&&item.assignmentId!==data.currentAssignment?.id)return false;
      if(item.dismissible&&(prefs.dismissedAttention||[]).includes(item.id))return false;
      const snoozed=prefs.snoozedAttention?.[item.id];return !item.dismissible||!snoozed||new Date(snoozed)<=now;
    });
    visibleAttention=termAttention.slice(0,5);
    panel.querySelector('header').innerHTML=`<div><h3>Needs attention <span class="badge">${termAttention.length}</span></h3><small class="workplace-panel__scope">Term ${data.currentTerm}</small></div><div class="tool-segmented"><button type="button" aria-pressed="${prefs.attentionScope!=='all'}" onclick="setDashboardAttentionScope('current')">Current Class</button><button type="button" aria-pressed="${prefs.attentionScope==='all'}" onclick="setDashboardAttentionScope('all')">All Classes</button></div>`;
    panel.querySelector('.workplace-list').innerHTML=visibleAttention.length?visibleAttention.map((item,index)=>`<li class="workplace-attention-item"><button class="workplace-list__item" type="button" onclick="openOptimizedDashboardAttention(${index})"><span class="workplace-list__marker workplace-list__marker--${escText(item.severity)}"></span><span class="workplace-list__content"><strong>${escText(item.title)}</strong><span>${escText(item.detail)}</span></span><span class="workplace-attention-action">${actionLabel(item)}</span></button>${item.dismissible?`<span class="workplace-attention-tools"><button type="button" onclick="snoozeDashboardAttentionItem(${index})">Snooze</button><button type="button" onclick="dismissDashboardAttentionItem(${index})">Dismiss</button></span>`:''}</li>`).join(''):`<li class="workplace-empty">You are caught up for Term ${data.currentTerm}. No grading work needs attention.</li>`;
  }
  function optimize(){const data=snapshot();optimizeClassPerformance(data);optimizeAttention(data);}
  globalScope.renderDashboardOverview=function renderDashboardOverviewOptimized(){baseRender();optimize();};
})(window);
