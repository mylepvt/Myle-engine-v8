/* ═══════════════════════════════════════════════════════════════
   working.js — Working Section JavaScript
   Pure JS — no Jinja2 template variables.
   Config is injected via window._workingCfg (set in working_shared.html).
   ═══════════════════════════════════════════════════════════════ */

// ── CSRF token ─────────────────────────────────────────────────
const _csrf = (window._workingCfg && window._workingCfg.csrf) || '';

// ── Score bar live update ──────────────────────────────────────
function updateLiveScore() {
  fetch('/api/today-score')
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        const el = document.getElementById('liveScore');
        if (el) {
          const oldScore = parseInt(el.textContent, 10) || 0;
          const newScore = d.score || 0;
          if (newScore > oldScore && typeof MyleAnim !== 'undefined') {
            MyleAnim.animateScore(el, oldScore, newScore, 600);
            MyleAnim.floatPoints(newScore - oldScore, el);
            if (typeof MyleSound !== 'undefined') MyleSound.score();
          } else {
            el.textContent = newScore;
          }
        }
      }
    })
    .catch(() => {});
}
setInterval(updateLiveScore, 30000);

// ── Score breakdown popup ──────────────────────────────────────
function toggleScoreBreakdown() {
  var el = document.getElementById('scorePopup');
  if (el) el.classList.toggle('d-none');
}
document.addEventListener('click', function(e) {
  const popup = document.getElementById('scorePopup');
  const scoreBtn = document.getElementById('scoreBtn');
  if (popup && !popup.classList.contains('d-none')) {
    if (!popup.contains(e.target) && (!scoreBtn || !scoreBtn.contains(e.target))) {
      popup.classList.add('d-none');
    }
  }
});

// ── Zone collapse toggle ───────────────────────────────────────
function toggleZone(id, btn) {
  const el = document.getElementById(id);
  const icon = btn.querySelector('.bi');
  if (!el) return;
  el.classList.toggle('d-none');
  icon.classList.toggle('bi-chevron-down');
  icon.classList.toggle('bi-chevron-up');
  // Persist open zones so they survive reload
  try {
    var open = JSON.parse(sessionStorage.getItem('myle_open_zones') || '[]');
    if (el.classList.contains('d-none')) {
      open = open.filter(function(z){ return z !== id; });
    } else if (open.indexOf(id) === -1) {
      open.push(id);
    }
    sessionStorage.setItem('myle_open_zones', JSON.stringify(open));
  } catch(e){}
}

// ── Generic collapse/expand toggle (doesn't depend on Bootstrap d-none) ──
function toggleCollapse(id, btn) {
  const el = document.getElementById(id);
  if (!el || !btn) return;

  const icon = btn.querySelector('.bi');
  const computed = window.getComputedStyle(el).display;
  const willShow = computed === 'none';

  el.style.display = willShow ? 'block' : 'none';

  if (icon) {
    icon.classList.toggle('bi-chevron-down', !willShow);
    icon.classList.toggle('bi-chevron-up', willShow);
  }
}

// ── Leader Tab Switcher ────────────────────────────────────
function switchLeaderTab(section, btn) {
  ['pipeline', 'team-funnel', 'enroll'].forEach(function(s) {
    var el = document.getElementById('leader-section-' + s);
    if (el) {
      el.style.display = 'none';
      el.style.opacity = '0';
    }
  });

  var target = document.getElementById('leader-section-' + section);
  if (target) {
    target.style.display = 'block';
    requestAnimationFrame(function() {
      target.style.transition = 'opacity 0.3s cubic-bezier(0.25,0.1,0.25,1)';
      target.style.opacity = '1';
    });
  }

  document.querySelectorAll('.leader-main-tab').forEach(function(b) {
    b.classList.remove('active', 'btn-primary', 'btn-success', 'btn-secondary');
    var sec = b.dataset.section;
    if (sec === 'team-funnel') b.classList.add('btn-outline-success');
    else if (sec === 'enroll') b.classList.add('btn-outline-secondary');
    else b.classList.add('btn-outline-primary');
  });

  if (section === 'pipeline') {
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('active', 'btn-primary');
  } else if (section === 'team-funnel') {
    btn.classList.remove('btn-outline-success');
    btn.classList.add('active', 'btn-success');
  } else {
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('active', 'btn-secondary');
  }

  var firstTab = null;
  if (section === 'pipeline') {
    firstTab = document.querySelector('#leader-section-pipeline .wk-tab[data-col="ld-day1"]');
  } else if (section === 'team-funnel') {
    firstTab = document.querySelector('#leader-section-team-funnel .wk-tab[data-col="te-stage1"]');
  }

  if (section === 'pipeline' || section === 'team-funnel') {
    filterTeamLeads(window._teamFilterMember || 'all');
  }
  if (firstTab) firstTab.click();
  try { sessionStorage.setItem('myle_leader_section', section); } catch(e){}
}

// ── Team Member Filter ─────────────────────────────────────
window._teamFilterMember = window._teamFilterMember || 'all';
function filterTeamLeads(member) {
  window._teamFilterMember = member || 'all';
  document.querySelectorAll('.leader-filter-chip').forEach(function(b) {
    var m = b.getAttribute('data-mem') || 'all';
    var on = (member === 'all' && m === 'all') || (m === member);
    b.classList.remove('active', 'btn-primary', 'btn-secondary');
    b.classList.add('btn-outline-primary');
    if (on) {
      b.classList.remove('btn-outline-primary');
      if (m === 'all') {
        b.classList.add('active', 'btn-secondary');
      } else {
        b.classList.add('active', 'btn-primary');
      }
    }
  });

  document.querySelectorAll('[data-member]').forEach(function(card) {
    if (member === 'all') {
      card.style.display = '';
    } else {
      card.style.display = (card.dataset.member === member) ? '' : 'none';
    }
  });

}

// ── Mobile kanban tabs ─────────────────────────────────────────
document.querySelectorAll('.wk-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    var target = this.dataset.col;
    if (!target) return;
    try { sessionStorage.setItem('myle_wk_tab', target); } catch(e){}

    // Find parent tabs container to scope the switch
    var tabsContainer = this.closest('.wk-kanban-tabs');
    var kanbanGrid = tabsContainer ? tabsContainer.nextElementSibling : null;

    // Deactivate sibling tabs only
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.wk-tab').forEach(function(t) {
        t.classList.remove('active');
      });
    }
    this.classList.add('active');

    // Show/hide columns only within the adjacent kanban grid
    var cols = kanbanGrid
      ? kanbanGrid.querySelectorAll('.wk-kanban-col')
      : document.querySelectorAll('.wk-kanban-col');

    cols.forEach(function(col) {
      if (col.dataset.col === target) {
        // Remove both d-none and breakpoint classes so column is always visible
        col.classList.remove('d-none', 'd-md-block', 'd-lg-block');
        col.style.opacity = '0';
        col.style.transform = 'translateY(6px)';
        requestAnimationFrame(function() {
          col.style.transition = 'opacity 0.3s cubic-bezier(0.25,0.1,0.25,1), transform 0.35s cubic-bezier(0.32,0.72,0,1)';
          col.style.opacity = '1';
          col.style.transform = 'translateY(0)';
        });
      } else {
        // Use d-lg-block (not d-md-block) so hidden col reappears at ≥992px
        // (where kanban switches to horizontal row mode), but stays hidden
        // at 768-991px where kanban is still stacked/tab-driven.
        col.classList.add('d-none', 'd-lg-block');
        col.classList.remove('d-md-block');
        col.style.transition = '';
        col.style.opacity = '';
        col.style.transform = '';
      }
    });
  });
});

// Initialize leader view on page load
document.addEventListener('DOMContentLoaded', function() {
  var pipelineSection = document.getElementById('leader-section-pipeline');

  var savedSection = null;
  try { savedSection = sessionStorage.getItem('myle_leader_section'); } catch(e){}
  if (savedSection === 'own' || savedSection === 'team') {
    savedSection = 'pipeline';
  }
  if (savedSection && document.getElementById('leader-section-' + savedSection)) {
    var secBtn = document.querySelector('.leader-main-tab[data-section="' + savedSection + '"]');
    if (secBtn) switchLeaderTab(savedSection, secBtn);
  }
  if (pipelineSection) {
    pipelineSection.style.display = 'block';
  }

  var savedTab = null;
  try { savedTab = sessionStorage.getItem('myle_wk_tab'); } catch(e){}
  var restoredTab = savedTab ? document.querySelector('.wk-tab[data-col="' + savedTab + '"]') : null;
  if (restoredTab && document.getElementById('leader-section-pipeline') && restoredTab.closest('#leader-section-pipeline')) {
    restoredTab.click();
  } else {
    var firstLd = document.querySelector('#leader-section-pipeline .wk-tab[data-col="ld-day1"]');
    if (firstLd && pipelineSection && pipelineSection.style.display !== 'none' && !firstLd.classList.contains('active')) {
      firstLd.click();
    }
  }

  // Restore open zones (collapsed sections)
  try {
    var openZones = JSON.parse(sessionStorage.getItem('myle_open_zones') || '[]');
    openZones.forEach(function(zid){
      var el = document.getElementById(zid);
      if (el && el.classList.contains('d-none')) {
        el.classList.remove('d-none');
        var parentBtn = el.previousElementSibling;
        if (parentBtn) {
          var icon = parentBtn.querySelector('.bi');
          if (icon) {
            icon.classList.remove('bi-chevron-down');
            icon.classList.add('bi-chevron-up');
          }
        }
      }
    });
  } catch(e){}

  // Stagger only visible cards (cap at 12 to avoid heavy setTimeout chains)
  var visCards = document.querySelectorAll('.wk-lead-card');
  var MAX_ANIM = 12;
  visCards.forEach(function(card, index) {
    if (index < MAX_ANIM) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(10px)';
      setTimeout(function() {
        card.style.transition = 'opacity 0.3s ease-out, transform 0.35s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 35);
    }
  });

  // Initialize collapse icon state for Workboard member filter
  var teamFilterPanel = document.getElementById('pipeline-filter-panel');
  if (teamFilterPanel) {
    var btn = teamFilterPanel.previousElementSibling;
    var icon = btn ? btn.querySelector('.bi') : null;
    if (icon) {
      var computed = window.getComputedStyle(teamFilterPanel).display;
      icon.classList.toggle('bi-chevron-down', computed === 'none');
      icon.classList.toggle('bi-chevron-up', computed !== 'none');
    }
  }
});

// ── Quick advance ──────────────────────────────────────────────
function handleAdvance() {
  const leadId = this.dataset.leadId;
  const self   = this;
  self.disabled = true;
  self.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  fetch(`/leads/${leadId}/quick-advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': _csrf,
    },
    body: JSON.stringify({}),
  })
  .then(r => r.json())
  .then(d => {
    if (!d.ok) {
      showToast(d.error || 'Could not advance', 'danger');
      self.disabled = false;
      self.innerHTML = '<i class="bi bi-arrow-right"></i>';
      return;
    }
    showToast(`Moved to ${d.new_status} ✅`, 'success');
    if (d.new_badges && d.new_badges.length) {
      d.new_badges.forEach(b => showToast(`🏅 Badge unlocked: ${b}`, 'warning'));
    }
    if (typeof MyleAnim !== 'undefined') {
      const scoreEl = document.getElementById('liveScore');
      if (scoreEl && d.today_score !== undefined) {
        const oldScore = parseInt(scoreEl.textContent, 10) || 0;
        MyleAnim.animateScore(scoreEl, oldScore, d.today_score, 800);
        MyleAnim.floatPoints(d.today_score - oldScore, scoreEl);
      }
    }
    if (typeof MyleSound !== 'undefined') MyleSound.celebrate();

    const card = document.getElementById(`lead-${leadId}`);
    if (card) {
      card.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1), transform 0.35s cubic-bezier(0.32,0.72,0,1)';
      card.style.opacity = '0';
      card.style.transform = 'translateX(16px) scale(0.97)';
      setTimeout(() => { card.remove(); }, 380);
    }
  })
  .catch(() => {
    showToast('Network error', 'danger');
    self.disabled = false;
    self.innerHTML = '<i class="bi bi-arrow-right"></i>';
  });
}

document.querySelectorAll('.wk-advance-btn').forEach(btn => {
  btn.addEventListener('click', handleAdvance);
});

// ── Confetti ───────────────────────────────────────────────────
function spawnConfetti(anchorEl) {
  const container = document.getElementById('confettiContainer');
  const colors    = ['#30D158','#007AFF','#FF9F0A','#BF5AF2','#FF375F','#FFD60A'];
  const rect      = anchorEl ? anchorEl.getBoundingClientRect() : {left:200,top:200,width:100};
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left:${rect.left + Math.random()*rect.width}px;
      top:${rect.top + window.scrollY}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-delay:${Math.random()*0.3}s;
      animation-duration:${0.6 + Math.random()*0.4}s;
      position:fixed;
    `;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 1000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH VIDEO POPUP
// ═══════════════════════════════════════════════════════════════════════════

const BATCH_WATCH_URLS = (window._workingCfg && window._workingCfg.batchWatchUrls) || {};

const BATCH_LABELS = {
  d1_morning:   '🌅 Day 1 — Morning Batch',
  d1_afternoon: '☀️ Day 1 — Afternoon Batch',
  d1_evening:   '🌙 Day 1 — Evening Batch',
  d2_morning:   '🌅 Day 2 — Morning Batch',
  d2_afternoon: '☀️ Day 2 — Afternoon Batch',
  d2_evening:   '🌙 Day 2 — Evening Batch',
};

let _popupState = {
  leadId: null,
  batchKey: null,
  phone: null,
  cardEl: null,
  mode: 'batch',
  testUrl: '',
  link1: '',
  link2: '',
};

const _POPUP_SEND_BATCH_HTML =
  '📤 Send on chat + mark done';
const _POPUP_ALREADY_BATCH_HTML =
  '✅ Already sent — mark done only';
const _POPUP_SEND_TEST_HTML =
  '📤 Send test link';
const _POPUP_ALREADY_TEST_HTML =
  '✅ Link already sent — close';

function _resetBatchPopupButtons() {
  var sendBtn = document.getElementById('popupSendBtn');
  var alBtn = document.getElementById('popupAlreadySentBtn');
  if (sendBtn) sendBtn.innerHTML = _POPUP_SEND_BATCH_HTML;
  if (alBtn) {
    alBtn.style.display = '';
    alBtn.innerHTML = _POPUP_ALREADY_BATCH_HTML;
  }
}

async function openDay2TestPopup(leadId, phone, leadName, btnEl) {
  leadId = parseInt(leadId, 10);
  phone = String(phone != null ? phone : '').trim();
  leadName = String(leadName != null ? leadName : '').trim();
  _popupState = {
    mode: 'd2test',
    leadId: leadId,
    batchKey: null,
    phone: phone,
    cardEl: btnEl.closest('.d2-lead-card') || btnEl.closest('.card'),
    testUrl: '',
    link1: '',
    link2: '',
  };
  _resetBatchPopupButtons();
  var sendBtn = document.getElementById('popupSendBtn');
  var alBtn = document.getElementById('popupAlreadySentBtn');
  if (sendBtn) sendBtn.innerHTML = _POPUP_SEND_TEST_HTML;
  if (alBtn) alBtn.innerHTML = _POPUP_ALREADY_TEST_HTML;

  document.getElementById('popupBatchName').textContent = '📝 Day 2 — Business evaluation';
  document.getElementById('popupLeadName').textContent = leadName;

  var linksDiv = document.getElementById('popupVideoLinks');
  document.getElementById('popupSendBtn').style.display = 'none';

  var popup = document.getElementById('batchPopup');
  popup.style.display = 'flex';
  popup.style.opacity = '0';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function() {
    popup.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1)';
    popup.style.opacity = '1';
  });

  linksDiv.innerHTML = `<div style="font-size:0.8rem;color:#9ca3af;text-align:center;">
    <span class="spinner-border spinner-border-sm me-2"></span>Generating test link...
  </div>`;
  linksDiv.removeAttribute('data-v1');
  linksDiv.removeAttribute('data-v2');

  var testUrl = '';
  try {
    var res = await fetch('/test/generate-link/' + leadId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
      body: '{}',
    });
    var data = await res.json();
    if (res.ok && data.ok && data.test_url) {
      testUrl = data.test_url;
    } else {
      showToast((data && data.error) || 'Could not create link', 'danger');
    }
  } catch (e) {
    showToast('Network error — try again', 'danger');
  }

  _popupState.testUrl = testUrl;
  if (testUrl) {
    linksDiv.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:var(--label-3,#6b7280);margin-bottom:10px;">Copy or send via WhatsApp:</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);">
          <span style="font-size:1.4rem;flex-shrink:0;">📝</span>
          <div class="d2test-url-preview" style="flex:1;min-width:0;font-size:0.7rem;color:#059669;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
          <button type="button" class="btn btn-sm btn-outline-success py-0 px-2 flex-shrink-0 btn-copy-d2test" style="font-size:0.7rem;">Copy</button>
        </div>
      </div>
      <p style="font-size:0.68rem;color:#9ca3af;margin:10px 0 0;">The prospect must verify with their <strong>registered mobile number</strong>. Link is valid for 24 hours.</p>
    `;
    var prev = linksDiv.querySelector('.d2test-url-preview');
    if (prev) prev.textContent = testUrl;
    var cb = linksDiv.querySelector('.btn-copy-d2test');
    if (cb) {
      cb.addEventListener('click', function() {
        copyToClipboard(testUrl).then(function() {
          showToast('Copied!', 'success');
        }).catch(function() {});
      });
    }
    document.getElementById('popupSendBtn').style.display = 'flex';
  } else {
    linksDiv.innerHTML = `
      <div style="font-size:0.8rem;color:#9ca3af;text-align:center;">
        ⚠️ Could not create test link. All three Day 2 batches must be complete and attempts must remain.
      </div>
    `;
  }
}

async function openBatchPopup(leadId, batchKey, phone, leadName, btnEl) {
  _resetBatchPopupButtons();
  var cardRoot =
    (btnEl && btnEl.closest && btnEl.closest('.wk-lead-card')) ||
    (btnEl && btnEl.closest && btnEl.closest('.lw-card')) ||
    (btnEl && btnEl.closest && btnEl.closest('.d2-lead-card')) ||
    (btnEl && btnEl.closest && btnEl.closest('.card.border-0.shadow-sm'));
  _popupState = {
    mode: 'batch',
    leadId: leadId,
    batchKey: batchKey,
    phone: phone,
    cardEl: cardRoot,
    testUrl: '',
    link1: '',
    link2: '',
  };
  document.getElementById('popupBatchName').textContent = BATCH_LABELS[batchKey] || batchKey;
  document.getElementById('popupLeadName').textContent = leadName;

  const linksDiv = document.getElementById('popupVideoLinks');
  document.getElementById('popupSendBtn').style.display = 'none';

  // Show popup first with loading state
  const popup = document.getElementById('batchPopup');
  popup.style.display = 'flex';
  popup.style.opacity = '0';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function() {
    popup.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1)';
    popup.style.opacity = '1';
  });

  linksDiv.innerHTML = `<div style="font-size:0.8rem;color:#9ca3af;text-align:center;">
    <span class="spinner-border spinner-border-sm me-2"></span>Generating links...
  </div>`;

  // Fetch lead-specific token URLs (prospect opens → batch auto-marks)
  let link1 = '', link2 = '';
  try {
    const res = await fetch(`/leads/${leadId}/batch-share-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
      body: JSON.stringify({ slot: batchKey })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      link1 = data.watch_url_v1 || '';
      link2 = data.watch_url_v2 || '';
    } else {
      // Keep links in-app even when token API fails.
      const watch = BATCH_WATCH_URLS[batchKey] || {};
      link1 = watch.v1 || '';
      link2 = watch.v2 || '';
    }
  } catch (e) {
    // Network fallback: still use in-app watch URLs (never raw YouTube links)
    const watch = BATCH_WATCH_URLS[batchKey] || {};
    link1 = watch.v1 || '';
    link2 = watch.v2 || '';
  }

  const hasLinks = link1 || link2;
  if (hasLinks) {
    linksDiv.dataset.v1 = link1;
    linksDiv.dataset.v2 = link2;
    _popupState.link1 = link1;
    _popupState.link2 = link2;
    linksDiv.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:var(--label-3,#6b7280);margin-bottom:10px;">Copy or send via WhatsApp:</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${link1 ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);">
          <button type="button" class="btn btn-sm btn-primary py-1 px-2 btn-watch-batch flex-shrink-0" data-video-key="v1" style="font-size:0.75rem;"><i class="bi bi-play-fill me-1"></i>Video 1</button>
          <div style="flex:1;min-width:0;font-size:0.7rem;color:#6366f1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${link1}</div>
          <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 flex-shrink-0" onclick="copyToClipboard('${link1}').then(function(){showToast('Copied!','success')})" style="font-size:0.7rem;">Copy</button>
        </div>` : ''}
        ${link2 ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);">
          <button type="button" class="btn btn-sm btn-primary py-1 px-2 btn-watch-batch flex-shrink-0" data-video-key="v2" style="font-size:0.75rem;"><i class="bi bi-play-fill me-1"></i>Video 2</button>
          <div style="flex:1;min-width:0;font-size:0.7rem;color:#6366f1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${link2}</div>
          <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 flex-shrink-0" onclick="copyToClipboard('${link2}').then(function(){showToast('Copied!','success')})" style="font-size:0.7rem;">Copy</button>
        </div>` : ''}
      </div>
    `;
    linksDiv.querySelectorAll('.btn-watch-batch').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = this.getAttribute('data-video-key');
        var url = linksDiv.dataset[key];
        if (url && window.openVideoInApp) window.openVideoInApp(url, 'Video ' + (key === 'v1' ? '1' : '2'));
      });
    });
    document.getElementById('popupSendBtn').style.display = 'flex';
  } else {
    linksDiv.innerHTML = `
      <div style="font-size:0.8rem;color:#9ca3af;text-align:center;">
        ⚠️ Video URLs are not configured. Contact an admin.
      </div>
    `;
    document.getElementById('popupSendBtn').style.display = 'none';
  }
}

function closeBatchPopup() {
  var popup = document.getElementById('batchPopup');
  popup.style.transition = 'opacity 0.2s cubic-bezier(0.25,0.1,0.25,1)';
  popup.style.opacity = '0';
  setTimeout(function() {
    popup.style.display = 'none';
    document.body.style.overflow = '';
  }, 220);
}

async function sendAndMark() {
  if (_popupState.mode === 'd2test') {
    return sendD2TestWhatsApp();
  }
  const { leadId, batchKey, phone } = _popupState;
  // Use token URLs already fetched in openBatchPopup (lead-specific, auto-marks when prospect watches)
  var link1 = _popupState.link1 || '';
  var link2 = _popupState.link2 || '';
  const label = BATCH_LABELS[batchKey];
  const msg = `${label}\n\n` +
    (link1 ? `📹 Video 1:\n${link1}\n` : '') +
    (link2 ? `📹 Video 2:\n${link2}\n` : '') +
    `\nPlease watch both videos and reply ✅ when done`;

  let cleanPhone = phone.replace(/[^\d]/g, '');
  if (cleanPhone.length === 10 && '6789'.includes(cleanPhone[0])) {
    cleanPhone = '91' + cleanPhone;
  } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
    cleanPhone = '91' + cleanPhone.substring(1);
  }
  if (!cleanPhone) {
    showToast('Lead phone is missing. Add a valid number on the lead record.', 'warning');
    return;
  }

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

  // Open WhatsApp immediately in click gesture context (avoids popup blocking on iOS/PWA).
  const waWin = window.open(waUrl, '_blank');
  if (!waWin) {
    // Fallback for strict popup blockers / in-app webviews.
    window.location.href = waUrl;
  }

  closeBatchPopup();
  // Mark in background; do not block WhatsApp opening.
  _markBatchDone(leadId, batchKey);
}

function sendD2TestWhatsApp() {
  var phone = String(_popupState.phone != null ? _popupState.phone : '');
  var testUrl = _popupState.testUrl || '';
  var leadName = (document.getElementById('popupLeadName') && document.getElementById('popupLeadName').textContent) || 'there';
  if (!testUrl) {
    showToast('Generate the link first, or refresh the page and try again.', 'warning');
    return;
  }
  var msg =
    'Hi ' + leadName.trim() + ' 👋\n\n' +
    'Please complete your *Day 2 business evaluation* using this link:\n\n' +
    testUrl +
    '\n\n' +
    '⚠️ You must verify with your *registered mobile number*.\n' +
    'This link is valid for *24 hours*.\n\n' +
    'Thank you — MYLE Community';

  var cleanPhone = phone.replace(/[^\d]/g, '');
  if (cleanPhone.length === 10 && '6789'.indexOf(cleanPhone[0]) >= 0) {
    cleanPhone = '91' + cleanPhone;
  } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
    cleanPhone = '91' + cleanPhone.substring(1);
  }
  if (!cleanPhone) {
    showToast('Lead phone is missing.', 'warning');
    return;
  }
  var waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg);
  var waWin = window.open(waUrl, '_blank');
  if (!waWin) {
    window.location.href = waUrl;
  }
  closeBatchPopup();
}

async function alreadySentMark() {
  if (_popupState.mode === 'd2test') {
    closeBatchPopup();
    return;
  }
  const { leadId, batchKey } = _popupState;
  closeBatchPopup();  // close first so toast is visible
  await _markBatchDone(leadId, batchKey, true);  // force_mark=true → always mark done
}

async function _markBatchDone(leadId, batchKey, forceMark = false) {
  const dbColumn = batchKey;
  try {
    const res = await fetch(`/leads/${leadId}/batch-toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': _csrf
      },
      body: JSON.stringify({ batch: dbColumn, force_mark: forceMark })
    });
    const data = await res.json();
    if (data.ok) {
      const card = _popupState.cardEl;
      if (card) {
        // Update batch button visual state based on actual new_val
        const btn = card.querySelector(`[data-batch="${batchKey}"]`);
        if (btn) {
          if (data.new_val) btn.classList.add('wk-batch-done');
          else btn.classList.remove('wk-batch-done');
        }
        // Leader lw-batch-btn uses "done" alongside wk-batch-done
        if (btn && data.new_val) btn.classList.add('done');
        else if (btn && !data.new_val) btn.classList.remove('done');

        // Recount done batches and update progress bar + count text
        const allBtns = card.querySelectorAll('[data-batch]');
        let doneCnt = 0;
        allBtns.forEach(b => {
          if (!b.hasAttribute('data-batch')) return;
          if (b.classList.contains('wk-batch-done') || b.classList.contains('done')) doneCnt++;
        });
        const bar = card.querySelector('.wk-batch-bar') || card.querySelector('.lw-progress-bar');
        if (bar) bar.style.width = Math.round(doneCnt / 3 * 100) + '%';
        const countEl = card.querySelector('.wk-batch-count');
        if (countEl) countEl.textContent = doneCnt + '/3 Done';

        if (data.all_done) {
          card.classList.add('wk-lead-complete');
          const advBtn = card.querySelector('.wk-advance-btn');
          if (advBtn) advBtn.style.display = 'inline-flex';
          const lockedFoot = card.querySelector('.wk-day2-locked');
          if (lockedFoot) lockedFoot.style.display = 'none';
        }
      }
      if (data.new_val && data.points > 0 && typeof MyleAnim !== 'undefined') {
        var btn = card ? card.querySelector('[data-batch="' + batchKey + '"]') : null;
        if (btn) MyleAnim.floatPoints(data.points, btn);
      }
      if (data.all_done && card && typeof MyleAnim !== 'undefined') {
        MyleAnim.glowGreen(card);
        if (typeof spawnConfetti === 'function') spawnConfetti(card);
        if (typeof MyleSound !== 'undefined') MyleSound.celebrate();
      }
      if (data.new_val && typeof MyleSound !== 'undefined') MyleSound.batch();
      showToast(data.new_val ? '+15 pts! Batch marked complete ✅' : 'Batch mark removed', data.new_val ? 'success' : 'warning');
      if (typeof refreshDashboardStats === 'function') refreshDashboardStats(data);
    } else {
      showToast(data.error || 'Batch update failed. Try again.', 'danger');
    }
  } catch(e) {
    showToast('Error. Try again.', 'danger');
  }
}

// Attach batch popup backdrop click when DOM ready (batchPopup is below this script)
document.addEventListener('DOMContentLoaded', function() {
  var bp = document.getElementById('batchPopup');
  if (bp) bp.addEventListener('click', function(e) {
    if (e.target === this) closeBatchPopup();
  });
  var d2sec = document.getElementById('admin-section-day2');
  if (d2sec) {
    d2sec.addEventListener('click', function(ev) {
      var btn = ev.target.closest('.d2-test-send-btn');
      if (!btn || !d2sec.contains(btn)) return;
      ev.preventDefault();
      var raw = btn.getAttribute('data-d2-test');
      if (!raw) return;
      var p;
      try {
        p = JSON.parse(raw);
      } catch (err) {
        return;
      }
      openDay2TestPopup(p.id, p.phone, p.name, btn);
    });
  }
});

// ── Quick advance Day 2 → Interview (owner / after test pass) ──
function quickAdvanceFromDay2(leadId, btnEl) {
  if (!confirm('Move this lead to Interview (Day 3)?')) return;
  const origHTML = btnEl ? btnEl.innerHTML : '';
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }
  fetch('/leads/' + leadId + '/quick-advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
    body: JSON.stringify({ current_status: 'Day 2' }),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) {
        showToast(d.error || 'Could not advance', 'danger');
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origHTML; }
        return;
      }
      showToast('Lead moved to Interview.', 'success');
      location.reload();
    })
    .catch(function () {
      showToast('Network error', 'danger');
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origHTML; }
    });
}

// ── Stage Advance via Pipeline ─────────────────────────────────
function stageAdvance(leadId, action, btnEl) {
  const origHTML = btnEl ? btnEl.innerHTML : '';
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }
  fetch(`/leads/${leadId}/stage-advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
    body: JSON.stringify({ action }),
  })
  .then(r => r.json())
  .then(d => {
    if (!d.ok) {
      showToast(d.error || 'Could not advance stage', 'danger');
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origHTML; }
      return;
    }
    showToast(d.message || 'Stage advanced ✅', 'success');
    if (typeof refreshDashboardStats === 'function') refreshDashboardStats(d);
    const card = document.getElementById(`lead-${leadId}`);
    if (card) {
      card.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1), transform 0.35s cubic-bezier(0.32,0.72,0,1)';
      card.style.opacity = '0';
      card.style.transform = 'translateX(16px) scale(0.97)';
      setTimeout(() => { card.remove(); }, 380);
    }
  })
  .catch(() => {
    showToast('Network error', 'danger');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origHTML; }
  });
}

// ── Push to Day 1 (Ready for Day 1 column) ───────────────────────
function pushToDay1(leadId, btnEl) {
  const origHTML = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const fd = new URLSearchParams();
  if (_csrf) fd.set('csrf_token', _csrf);
  fetch(`/leads/${leadId}/ready-for-day1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': _csrf,
    },
    body: fd,
  })
  .then(r => r.json())
  .then(d => {
    if (d.ok) {
      showToast('Lead moved to Day 1 🎉', 'success');
      const card = document.getElementById('lead-' + leadId);
      if (card) {
        card.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1), transform 0.35s cubic-bezier(0.32,0.72,0,1)';
        card.style.opacity = '0';
        card.style.transform = 'translateX(16px) scale(0.97)';
        setTimeout(() => card.remove(), 380);
      }
    } else {
      showToast(d.error || 'Error. Try again.', 'danger');
      btnEl.disabled = false;
      btnEl.innerHTML = origHTML;
    }
  })
  .catch(() => {
    showToast('Network error', 'danger');
    btnEl.disabled = false;
    btnEl.innerHTML = origHTML;
  });
}

// ── Send Enrollment Video via WhatsApp ─────────────────────────
function sendEnrollVideo(leadId, phone, name) {
  var watchBase = (window._workingCfg && window._workingCfg.enrollmentWatchUrl) || '';
  if (!watchBase) {
    showToast('Enrollment video URL is not set — contact an admin', 'warning');
    return;
  }
  fetch('/enroll/generate-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
    body: JSON.stringify({ lead_id: leadId, content_id: null })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok && data.watch_url) {
      var msg = 'Hi ' + (name || 'there') + ' 👋\n\nOpen this link to watch the presentation 👇\n' + data.watch_url;
      var cleanPhone = String(phone).replace(/[^\d]/g, '');
      if (cleanPhone.length === 10 && '6789'.includes(cleanPhone[0])) {
        cleanPhone = '91' + cleanPhone;
      } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
        cleanPhone = '91' + cleanPhone.substring(1);
      }
      window.open('https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg), '_blank');
      showToast('Video link opened in WhatsApp 📹', 'success');
    } else {
      showToast('Could not generate link. Try again.', 'danger');
    }
  })
  .catch(() => showToast('Network error. Try again.', 'danger'));
}

// ── Call Status Update ─────────────────────────────────────────
function updateCallStatus(leadId, newStatus, selectEl) {
  fetch(`/leads/${leadId}/call-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrf },
    body: JSON.stringify({ call_status: newStatus }),
  })
  .then(r => r.json())
  .then(d => {
    if (d.ok) {
      showToast('Call status updated ✅', 'success');
      if (d.ai_feedback) {
        showToast(d.ai_feedback, 'info');
      }
    } else {
      showToast(d.error || 'Could not update call status', 'danger');
    }
  })
  .catch(() => { showToast('Network error', 'danger'); });
}

// ── Re-activate Past Lead ──────────────────────────────────────
function reactivateLead(leadId, selectEl) {
  const newStatus = selectEl.value;
  if (!newStatus) return;

  selectEl.disabled = true;

  fetch(`/leads/${leadId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': _csrf,
    },
    body: new URLSearchParams({ status: newStatus }),
  })
  .then(r => r.json())
  .then(d => {
    if (d.ok) {
      showToast(`Lead back in pipeline → ${d.status} ✅`, 'success');
      // Animate row removal
      const row = document.getElementById(`past-row-${leadId}`);
      if (row) {
        row.style.transition = 'opacity 0.25s cubic-bezier(0.25,0.1,0.25,1), transform 0.35s cubic-bezier(0.32,0.72,0,1)';
        row.style.opacity = '0';
        row.style.transform = 'translateX(12px) scale(0.98)';
        setTimeout(() => {
          row.remove();
          // Update the badge count in zone header
          const badge = document.querySelector('#zone-past')
            ?.closest('.mb-4')
            ?.querySelector('.badge.bg-light');
          if (badge) {
            const cur = parseInt(badge.textContent) || 0;
            badge.textContent = Math.max(0, cur - 1);
          }
        }, 320);
      }
    } else {
      showToast(d.error || 'Status update failed. Try again.', 'danger');
      selectEl.value = '';
      selectEl.disabled = false;
    }
  })
  .catch(() => {
    showToast('Network error. Try again.', 'danger');
    selectEl.value = '';
    selectEl.disabled = false;
  });
}

// ── Module 2: Action Queue ────────────────────────────────────────
var _aqBuilt = false;
function buildActionQueue() {
  if (_aqBuilt) return;
  _aqBuilt = true;

  var dataEl = document.getElementById('aqLeadsData');
  if (!dataEl) return;
  var leads;
  try { leads = JSON.parse(dataEl.textContent); } catch(e) { leads = []; }

  var now = Date.now();
  var callsDue = [], batchesDue = [], followupDue = [];

  leads.forEach(function(l) {
    var hoursStale = 9999;
    if (l.updated_at) {
      var upd = new Date(l.updated_at.replace(' ','T'));
      if (!isNaN(upd)) hoursStale = (now - upd.getTime()) / 3600000;
    }
    var staleClass = hoursStale > 48 ? 'aq-row-stale-red' :
                     hoursStale > 24 ? 'aq-row-stale-orange' : '';

    if (l.stage === 'prospecting' || l.stage === 'enrolled' || l.next_action_type === 'urgent') {
      callsDue.push(Object.assign({}, l, {staleClass: staleClass}));
    } else if (l.next_action_type === 'today') {
      callsDue.push(Object.assign({}, l, {staleClass: staleClass}));
    }
    if ((l.stage === 'day1' && !(l.d1_morning && l.d1_afternoon && l.d1_evening)) ||
        (l.stage === 'day2' && !(l.d2_morning && l.d2_afternoon && l.d2_evening))) {
      batchesDue.push(Object.assign({}, l, {staleClass: staleClass}));
    }
    if (l.next_action_type === 'followup') {
      followupDue.push(Object.assign({}, l, {staleClass: staleClass}));
    }
  });

  // Sort each section by heat DESC
  [callsDue, batchesDue, followupDue].forEach(function(arr) {
    arr.sort(function(a,b){ return b.heat - a.heat; });
  });

  var totalUrgent = callsDue.length + batchesDue.length;
  var badgeEl = document.getElementById('aqBadge');
  var countBadge = document.getElementById('aqCountBadge');
  if (badgeEl) { badgeEl.textContent = totalUrgent; badgeEl.style.display = totalUrgent ? '' : 'none'; }
  if (countBadge) countBadge.textContent = totalUrgent;

  function _makeRow(l) {
    var phone = l.phone || '';
    var waPhone = phone.replace(/[^\d]/g,'');
    if (waPhone.length === 10 && '6789'.indexOf(waPhone[0]) >= 0) waPhone = '91'+waPhone;
    return '<div class="aq-lead-row ' + (l.staleClass||'') + '">' +
      '<div class="aq-name" style="cursor:pointer;" onclick="openTimeline('+l.id+','+JSON.stringify(l.name)+')">' +
        '<span>'+_escAQ(l.name)+'</span>' +
        ' <i class="bi bi-clock-history" style="font-size:0.6rem;opacity:0.4;"></i>' +
      '</div>' +
      '<span class="badge bg-secondary-subtle text-secondary me-1" style="font-size:0.65rem;">' + _escAQ(l.stage) + '</span>' +
      (l.heat >= 75 ? '<span class="badge bg-danger-subtle text-danger me-1" style="font-size:0.65rem;">🔥'+l.heat+'</span>' :
       l.heat >= 40 ? '<span class="badge bg-warning-subtle text-warning me-1" style="font-size:0.65rem;">🌤'+l.heat+'</span>' :
       '<span class="badge bg-secondary-subtle text-muted me-1" style="font-size:0.65rem;">❄'+l.heat+'</span>') +
      (phone ? '<a href="tel:'+_escAQ(phone)+'" class="btn btn-xs btn-outline-primary me-1"><i class="bi bi-telephone-fill"></i></a>' : '') +
      (waPhone ? '<a href="https://wa.me/'+waPhone+'" target="_blank" class="btn btn-xs btn-outline-success"><i class="bi bi-whatsapp"></i></a>' : '') +
      '</div>';
  }
  function _escAQ(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function _makeSection(title, icon, arr) {
    if (!arr.length) return '';
    return '<div class="aq-section-title">'+icon+' '+title+'</div>' +
           arr.map(_makeRow).join('');
  }

  var html = _makeSection('Calls & Urgent Actions', '📞', callsDue) +
             _makeSection('Batch Videos Pending', '📹', batchesDue) +
             _makeSection('Follow-ups Due', '🔄', followupDue);

  if (!html) {
    html = '<div class="tl-empty"><i class="bi bi-check-circle-fill fs-3 text-success d-block mb-2"></i>All clear — no pending actions.</div>';
  }
  document.getElementById('aqBody').innerHTML = html;
}

// ── Module 1: Timeline click — delegate on all lead name elements ──
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('[id^="lead-"]').forEach(function(card) {
    var m = card.id.match(/^lead-(\d+)$/);
    if (!m) return;
    var leadId = parseInt(m[1], 10);
    var nameEl = card.querySelector('.fw-semibold.text-truncate');
    if (!nameEl) nameEl = card.querySelector('.fw-semibold');
    if (!nameEl) return;
    nameEl.style.cursor = 'pointer';
    nameEl.title = 'Click to view history';
    nameEl.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof openTimeline === 'function') openTimeline(leadId, nameEl.textContent.trim());
    });
  });
});

// ── Admin Tab Switcher ─────────────────────────────────────────
function adminTab(section, btn) {
  ['day1','day2','day3','tasks'].forEach(s => {
    const el = document.getElementById('admin-section-' + s);
    const tb = document.getElementById('atab-' + s);
    if (el) el.style.display = (s === section) ? '' : 'none';
    if (tb) tb.classList.toggle('active', s === section);
  });
  try { sessionStorage.setItem('myle_admin_tab', section); } catch(e){}
}
// Restore admin tab on load
(function(){
  try {
    var saved = sessionStorage.getItem('myle_admin_tab');
    if (saved === 'pipeline') saved = 'day1'; // legacy fallback
    if (saved && document.getElementById('admin-section-' + saved)) {
      var btn = document.getElementById('atab-' + saved);
      if (btn) adminTab(saved, btn);
    }
  } catch(e){}
})();

// ── Admin D2 Batch Toggle (inline board) ──────────────────────
function adminD2Toggle(leadId, slot, btn) {
  const card   = btn.closest('[data-lead-id]') || btn.closest('.card');

  fetch('/leads/' + leadId + '/batch-toggle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': _csrf,
    },
    body: JSON.stringify({ batch: slot })
  })
  .then(r => r.json())
  .then(d => {
    if (d.ok) {
      const newVal = !!d.new_val;
      btn.classList.toggle('done', newVal);
      const icon = btn.querySelector('.bi');
      if (icon) {
        if (slot.includes('morning'))   icon.className = newVal ? 'bi bi-check-circle-fill' : 'bi bi-sunrise-fill';
        else if (slot.includes('afternoon')) icon.className = newVal ? 'bi bi-check-circle-fill' : 'bi bi-sun-fill';
        else icon.className = newVal ? 'bi bi-check-circle-fill' : 'bi bi-moon-fill';
      }
      // Re-check if all 3 done to show Day 3 button
      const siblingBtns = btn.parentElement.querySelectorAll('.d2-batch-btn');
      const allDone = [...siblingBtns].every(b => b.classList.contains('done'));
      const actionRow = btn.parentElement.nextElementSibling;
      if (actionRow) {
        let existingAdv = actionRow.querySelector('.admin-d2-adv');
        if (allDone && !existingAdv) {
          const advBtn = document.createElement('button');
          advBtn.className = 'btn btn-sm btn-success ms-auto admin-d2-adv';
          advBtn.innerHTML = '<i class="bi bi-arrow-right me-1"></i>Day 3';
          advBtn.onclick = function() { stageAdvance(leadId, 'day2_complete', this); };
          actionRow.appendChild(advBtn);
        } else if (!allDone && existingAdv) {
          existingAdv.remove();
        }
      }
    }
  }).catch(() => {});
}

// ── Admin Create Task ─────────────────────────────────────────
function adminCreateTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  const body     = document.getElementById('taskBody').value.trim();
  const target   = document.getElementById('taskTarget').value;
  const priority = document.getElementById('taskPriority').value;
  const dueDate  = document.getElementById('taskDueDate').value;
  if (!title) { alert('Task title is required.'); return; }

  const fd = new FormData();
  fd.append('csrf_token', _csrf);
  fd.append('title', title);
  fd.append('body', body);
  fd.append('target', target);
  fd.append('priority', priority);
  fd.append('due_date', dueDate);

  fetch('/admin/tasks/create', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        // Add task card to list
        const noMsg = document.getElementById('noTasksMsg');
        if (noMsg) noMsg.remove();
        const list = document.getElementById('adminTaskList');
        const card = document.createElement('div');
        card.className = 'card border-0 shadow-sm mb-2 admin-task-card';
        card.id = 'atask-' + d.id;
        card.style.cssText = 'border-radius:12px;' + (d.priority==='urgent' ? 'border-left:3px solid var(--ios-red)!important;' : 'border-left:3px solid var(--ios-blue)!important;');
        card.innerHTML = `<div class="card-body p-2 px-3"><div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            ${d.priority==='urgent' ? '<span class="badge bg-danger me-1" style="font-size:.6rem;">URGENT</span>' : ''}
            <span class="fw-semibold" style="font-size:.88rem;">${d.title}</span>
            ${d.body ? '<div class="text-muted small">'+d.body+'</div>' : ''}
            <div class="d-flex gap-2 flex-wrap mt-1">
              <span class="text-muted" style="font-size:.65rem;"><i class="bi bi-people me-1"></i>${d.target}</span>
              ${d.due_date ? '<span class="text-muted" style="font-size:.65rem;"><i class="bi bi-calendar me-1"></i>'+d.due_date+'</span>' : ''}
            </div>
          </div>
          <button class="btn btn-outline-danger btn-sm ms-2" onclick="adminDeleteTask(${d.id})"><i class="bi bi-trash"></i></button>
        </div></div>`;
        list.insertBefore(card, list.firstChild);
        // Clear form
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskBody').value = '';
        document.getElementById('taskDueDate').value = '';
      }
    }).catch(() => alert('Error. Try again.'));
}

// ── Admin Delete (archive) Task ───────────────────────────────
function adminDeleteTask(taskId) {
  if (!confirm('Is task ko archive karein?')) return;
  const fd = new FormData();
  fd.append('csrf_token', _csrf);
  fetch('/admin/tasks/' + taskId + '/delete', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        const card = document.getElementById('atask-' + taskId);
        if (card) card.remove();
      }
    }).catch(() => {});
}

// ── Mark Task Done (leader/team) ──────────────────────────────
function markTaskDone(taskId, btn) {
  const fd = new FormData();
  fd.append('csrf_token', _csrf);
  fetch('/tasks/' + taskId + '/done', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        // Mark card as done visually
        ['ltask-'+taskId, 'ltask-tm-'+taskId].forEach(id => {
          const card = document.getElementById(id);
          if (card) {
            card.style.opacity = '0.5';
            const b = card.querySelector('button');
            if (b) b.outerHTML = '<span class="badge bg-success flex-shrink-0" style="font-size:.65rem;"><i class="bi bi-check-all"></i> Done</span>';
            const title = card.querySelector('.fw-semibold');
            if (title) title.style.textDecoration = 'line-through';
          }
        });
      }
    }).catch(() => {});
}

// ── 24h stage SLA countdown (server stores IST wall clock; naive → +05:30) ──
function _parseIstWallClock(ts) {
  if (!ts || typeof ts !== 'string') return null;
  var s = ts.trim();
  if (!s) return null;
  var normalized = s.replace(' ', 'T');
  // Already Z or explicit ±offset — do not append +05:30 (would double-shift).
  if (/[zZ]$/.test(normalized) || /[+-]\d{2}:?\d{2,4}$/.test(normalized)) {
    var d0 = new Date(normalized);
    return isNaN(d0.getTime()) ? null : d0;
  }
  // Long fractional seconds from SQLite / drivers — trim for reliable Date parse.
  normalized = normalized.replace(/(\.\d{3})\d+/, '$1');
  var d1 = new Date(normalized + '+05:30');
  if (!isNaN(d1.getTime())) return d1;
  var d2 = new Date(normalized);
  return isNaN(d2.getTime()) ? null : d2;
}

function _pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Remaining ms → label with hours/minutes/seconds so 22h reads as 22h 05m 03s left, not ambiguous. */
function _formatSlaRemain(ms, soft) {
  if (soft === void 0) soft = false;
  var overdue = ms < 0;
  var abs = Math.abs(ms);
  var sec = Math.floor(abs / 1000);
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  var clock =
    h >= 1
      ? h + 'h ' + _pad2(m) + 'm ' + _pad2(s) + 's'
      : m >= 1
        ? m + 'm ' + _pad2(s) + 's'
        : s + 's';
  if (overdue) {
    return {
      text: (soft ? 'Follow up now · ' : 'Overdue · ') + clock,
      urgent: true,
      tier: 'critical',
    };
  }
  var tier = 'safe';
  if (ms <= 30 * 60 * 1000) tier = 'critical';
  else if (ms <= 6 * 60 * 60 * 1000) tier = 'warning';
  else if (ms <= 18 * 60 * 60 * 1000) tier = 'caution';
  return {
    text: clock + ' left',
    urgent: ms <= 30 * 60 * 1000,
    tier: tier,
  };
}

var SLA_TIER_CLASSES = ['wk-sla-watch--tier-safe', 'wk-sla-watch--tier-caution', 'wk-sla-watch--tier-warning', 'wk-sla-watch--tier-critical'];

function _applySlaTier(el, tier) {
  for (var c = 0; c < SLA_TIER_CLASSES.length; c++) {
    el.classList.remove(SLA_TIER_CLASSES[c]);
  }
  el.classList.add('wk-sla-watch--tier-' + tier);
}

function initStageSlaWatches() {
  if (window.__wkSlaRafBound) return;
  if (!document.querySelectorAll('.wk-sla-watch').length) return;
  window.__wkSlaRafBound = true;
  var MS_DAY = 24 * 60 * 60 * 1000;
  var lastSec = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var lastSecFallback = {};
  var lastTier = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var lastTierFallback = {};
  function frame() {
    var nodes = document.querySelectorAll('.wk-sla-watch');
    var now = Date.now();
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var start = _parseIstWallClock(el.getAttribute('data-sla-start') || '');
      var remainEl = el.querySelector('.wk-sla-remain');
      var hand = el.querySelector('.wk-sla-hand');
      var face = el.querySelector('.wk-sla-watch-face');
      if (!start || !remainEl) continue;
      var end = start.getTime() + MS_DAY;
      var left = end - now;
      var elapsed = Math.min(MS_DAY, Math.max(0, now - start.getTime()));
      var pct = (elapsed / MS_DAY) * 100;
      if (face) face.style.setProperty('--wk-sla-ring-pct', String(Math.min(100, Math.max(0, pct))));
      if (hand) hand.style.transform = 'rotate(' + (elapsed / MS_DAY) * 360 + 'deg)';
      var secBucket = Math.floor(left / 1000);
      var idKey = el.wkSlaId || (el.wkSlaId = 'wk' + i + '_' + el.getAttribute('data-sla-start'));
      var prev = lastSec ? lastSec.get(el) : lastSecFallback[idKey];
      var soft = el.getAttribute('data-sla-soft') === '1';
      var fmt = _formatSlaRemain(left, soft);
      var prevTier = lastTier ? lastTier.get(el) : lastTierFallback[idKey];
      if (prev === undefined || prev !== secBucket) {
        if (lastSec) lastSec.set(el, secBucket);
        else lastSecFallback[idKey] = secBucket;
        remainEl.textContent = fmt.text;
      }
      if (prevTier !== fmt.tier) {
        if (lastTier) lastTier.set(el, fmt.tier);
        else lastTierFallback[idKey] = fmt.tier;
        _applySlaTier(el, fmt.tier);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStageSlaWatches);
} else {
  initStageSlaWatches();
}
