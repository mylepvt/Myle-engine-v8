/* Centralized Follow-up Logic — calendar "today" = Asia/Kolkata (IST), not browser/UTC */

function myleTodayYmdIST() {
    try {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch (e) {
        return new Date().toISOString().slice(0, 10);
    }
}

function openFollowupModal(leadId, leadName, currentDate, currentTime) {
    document.getElementById('fuModalLeadId').value = leadId;
    document.getElementById('fuModalLeadName').value = leadName || '';
    
    // Default to today if no date provided
    if (!currentDate) {
        currentDate = myleTodayYmdIST();
    }
    document.getElementById('fuModalLeadDate').value = currentDate;
    document.getElementById('fuModalTime').value = currentTime || '';
    
    var modalEl = document.getElementById('globalFollowupModal');
    if (modalEl) {
        var modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Attach click listener to Save button in the modal
    const saveBtn = document.getElementById('fuModalSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            const id = document.getElementById('fuModalLeadId').value;
            const reminderTime = document.getElementById('fuModalTime').value;
            const reminderDate = document.getElementById('fuModalLeadDate').value;
            const name = document.getElementById('fuModalLeadName').value;
            
            if (!id) return;
            
            // Assume _csrf_token is globally available or we skip it if DEV_BYPASS_AUTH is on
            // but let's grab it from a meta tag if it exists, or just pass empty.
            let csrfToken = '';
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta) csrfToken = csrfMeta.getAttribute('content');
            
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
            
            fetch('/leads/' + id + '/follow-up-time', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ reminder_time: reminderTime, time: reminderTime })
            }).then(r => r.json()).then(d => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-clock me-1"></i>Save Reminder';
                
                if (d.ok) {
                    if (typeof showToast === 'function') {
                        showToast(reminderTime ? 'Reminder set for ' + reminderTime : 'Reminder cleared', 'success');
                    } else {
                        alert(reminderTime ? 'Reminder set for ' + reminderTime : 'Reminder cleared');
                    }
                    
                    if (reminderTime) {
                        _scheduleReminderNative(id, name, reminderDate, reminderTime);
                    }
                    
                    var modal = bootstrap.Modal.getInstance(document.getElementById('globalFollowupModal'));
                    if (modal) modal.hide();
                    
                    // Optionally update UI on the page if needed
                    const timeDisp = document.getElementById('time-disp-' + id);
                    if (timeDisp) {
                        if (reminderTime) {
                            timeDisp.innerHTML = '<i class="bi bi-clock me-1"></i>' + reminderTime;
                            timeDisp.className = 'badge bg-info-subtle text-info border border-info-subtle';
                        } else {
                            timeDisp.className = 'badge bg-light text-secondary border d-none';
                        }
                    }
                    
                    // Also update the button's dataset so subsequent clicks load the new time
                    const btn = document.querySelector(`.btn-followup[data-id="${id}"]`);
                    if (btn) {
                        btn.dataset.time = reminderTime;
                        if (reminderTime) {
                            btn.dataset.date = reminderDate;
                        }
                    }
                } else {
                    if (typeof showToast === 'function') {
                        showToast(d.error || 'Could not set reminder', 'danger');
                    } else {
                        alert(d.error || 'Could not set reminder');
                    }
                }
            }).catch(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-clock me-1"></i>Save Reminder';
                if (typeof showToast === 'function') {
                    showToast('Network error', 'danger');
                }
            });
        });
    }
    
    // Attach listeners to any button with class .btn-followup
    // Attach listeners to any button with class .btn-followup using event delegation
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-followup');
        if (btn) {
            openFollowupModal(
                btn.dataset.id,
                btn.dataset.name,
                btn.dataset.date,
                btn.dataset.time
            );
        }
    });

    // Support for inline time pickers (used on the dedicated follow_up.html page)
    document.querySelectorAll('.reminder-time').forEach(inp => {
        inp.addEventListener('change', function() {
            const id = (this.dataset.id || '').trim();
            const reminderTime = (this.value || '').trim();
            const name = (this.dataset.name || '').trim();
            const date = (this.dataset.date || '').trim();
            if (!id) return;
            
            let csrfToken = '';
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta) csrfToken = csrfMeta.getAttribute('content');

            fetch('/leads/' + id + '/follow-up-time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ reminder_time: reminderTime, time: reminderTime })
            }).then(r => r.json()).then(d => {
                if (d.ok) {
                    if (typeof showToast === 'function') {
                        showToast(reminderTime ? 'Reminder set for ' + reminderTime : 'Reminder cleared', 'success');
                    }
                    if (reminderTime) _scheduleReminderNative(id, name, date, reminderTime);
                } else {
                    if (typeof showToast === 'function') showToast(d.error || 'Could not set reminder', 'danger');
                }
            }).catch(() => {
                if (typeof showToast === 'function') showToast('Network error', 'danger');
            });
        });
    });

    // Schedule all existing inline reminders on page load for today's leads
    const today = myleTodayYmdIST();
    document.querySelectorAll('.reminder-time').forEach(inp => {
        if (inp.value && inp.dataset.date === today) {
            _scheduleReminderNative(inp.dataset.id, inp.dataset.name, inp.dataset.date, inp.value);
        }
    });
});

function _scheduleReminderNative(id, name, date, time) {
    if (!time || !date) return;
    const fireAt = new Date(date + 'T' + time + ':00');
    const msUntil = fireAt - Date.now();
    if (msUntil <= 0) return; // already past
    
    setTimeout(() => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('Follow-up Reminder', {
                    body:  'Time to follow up with ' + name,
                    icon:  '/static/icon-192.png',
                    badge: '/static/icon-192.png',
                    data:  { url: '/follow-up' },
                    tag:   'followup-' + id,
                    renotify: true
                });
            });
        } else if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Follow-up Reminder', {
                body: 'Time to follow up with ' + name,
                icon: '/static/icon-192.png'
            });
        }
    }, msUntil);
}
