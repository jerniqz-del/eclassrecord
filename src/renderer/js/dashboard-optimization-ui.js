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

  function optimizeAssessmentMix(data) {
    const cards=[...document.querySelectorAll('#dashboardWorkplace .workplace-insight-card')];
    const card=cards.find(item=>item.querySelector('h4')?.textContent.trim().toLowerCase()==='assessment mix');
    if(!card)return;
    const analytics=data.analytics, prefs=data.preferences;
    const categories=[['written','Written Work'],['performance','Performance Task'],['quarterly','Quarterly'],['other','Other']];
    const weights=typeof globalScope.weightsForAssignment==='function'&&data.currentAssignment?globalScope.weightsForAssignment(data.currentAssignment):null;
    const weightText=Array.isArray(weights)?`WW ${weights[0]}% · PT ${weights[1]}% · QA ${weights[2]}%`:'Uses the selected class grading configuration';
    card.classList.add('assessment-mix-card');
    card.innerHTML=`<header><div><h4>Assessment mix</h4><p>${prefs.analyticsScope==='all'?'All Classes':escText(data.currentAssignment?.section||'Current Class')} · Term ${data.currentTerm}</p></div><button class="btn btn-ghost btn-sm" type="button" onclick="manageDashboardAssessments()">Manage Assessments</button></header>
      <div class="assessment-mix-controls"><div class="tool-segmented"><button type="button" aria-pressed="${prefs.analyticsScope!=='all'}" onclick="setDashboardAnalyticsScope('current')">Current Class</button><button type="button" aria-pressed="${prefs.analyticsScope==='all'}" onclick="setDashboardAnalyticsScope('all')">All Classes</button></div><select class="field-select" aria-label="Assessment mix term" onchange="setDashboardAnalyticsTerm(this.value)">${['1','2','3'].map(term=>`<option value="${term}" ${term===data.currentTerm?'selected':''}>Term ${term}</option>`).join('')}</select></div>
      <div class="assessment-mix-segments">${categories.map(([key,label])=>`<div class="assessment-mix-segment assessment-mix-segment--${key}"><span>${label}</span><strong>${analytics.mix[key]}</strong></div>`).join('')}</div>
      <p class="assessment-mix-weights"><strong>Configured weights:</strong> ${escText(weightText)}</p>
      <div class="assessment-mix-alerts"><span class="${analytics.missingHps?'is-warning':'is-complete'}">${analytics.missingHps} missing HPS</span><span>${analytics.emptyCategories.length?`No assessments: ${escText(analytics.emptyCategories.join(', '))}`:'All categories represented'}</span></div>`;
  }

  function actionLabel(item) {
    return { 'invalid-scores':'Review Scores','missing-hps':'Set HPS','incomplete-scores':'Continue Grading','empty-class':'Add Learners','advisory-conflicts':'Review Conflict','upcoming-deadline':'Review' }[item.type]||'Review';
  }
  function optimizeAttention(data) {
    const panels=[...document.querySelectorAll('#dashboardWorkplace .workplace-panel')];
    const panel=panels.find(item=>item.querySelector('h3')?.textContent.toLowerCase().includes('needs attention'));
    if(!panel)return;
    const prefs=data.preferences, now=new Date();
    visibleAttention=data.attention.filter(item=>{
      if(prefs.attentionScope!=='all'&&item.assignmentId&&item.assignmentId!==data.currentAssignment?.id)return false;
      if(item.dismissible&&(prefs.dismissedAttention||[]).includes(item.id))return false;
      const snoozed=prefs.snoozedAttention?.[item.id];return !item.dismissible||!snoozed||new Date(snoozed)<=now;
    }).slice(0,5);
    panel.querySelector('header').innerHTML=`<h3>Needs attention <span class="badge">${data.attention.length}</span></h3><div class="tool-segmented"><button type="button" aria-pressed="${prefs.attentionScope!=='all'}" onclick="setDashboardAttentionScope('current')">Current Class</button><button type="button" aria-pressed="${prefs.attentionScope==='all'}" onclick="setDashboardAttentionScope('all')">All Classes</button></div>`;
    panel.querySelector('.workplace-list').innerHTML=visibleAttention.length?visibleAttention.map((item,index)=>`<li class="workplace-attention-item"><button class="workplace-list__item" type="button" onclick="openOptimizedDashboardAttention(${index})"><span class="workplace-list__marker workplace-list__marker--${escText(item.severity)}"></span><span class="workplace-list__content"><strong>${escText(item.title)}</strong><span>${escText(item.detail)}</span></span><span class="workplace-attention-action">${actionLabel(item)}</span></button>${item.dismissible?`<span class="workplace-attention-tools"><button type="button" onclick="snoozeDashboardAttentionItem(${index})">Snooze</button><button type="button" onclick="dismissDashboardAttentionItem(${index})">Dismiss</button></span>`:''}</li>`).join(''):'<li class="workplace-empty">You are caught up. No due grading work needs attention.</li>';
  }
  function optimize(){const data=snapshot();optimizeAssessmentMix(data);optimizeAttention(data);}
  globalScope.renderDashboardOverview=function renderDashboardOverviewOptimized(){baseRender();optimize();};
})(window);
