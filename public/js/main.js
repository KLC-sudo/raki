lucide.createIcons({ attrs: { strokeWidth: 1.5 } });

const mobileToggle = document.getElementById('mobile-toggle');
const mobileMenu = document.getElementById('mobile-menu');
mobileToggle.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
document.querySelectorAll('.mobile-link').forEach(l => l.addEventListener('click', () => mobileMenu.classList.add('hidden')));

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    t.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    t.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        t.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        t.classList.remove('translate-y-0', 'opacity-100');
    }, 2500);
}

function addCart(name) { showToast(`${name} added ✓`); }

function selectSub(el, plan) {
    document.getElementById('plan-select').value = plan;
    document.querySelectorAll('.sub-plan').forEach(p => {
        p.classList.remove('border-sand', 'bg-bark-600');
        p.classList.add('border-bark-500');
    });
    el.classList.remove('border-bark-500');
    el.classList.add('border-sand', 'bg-bark-600');
    showToast(`${plan.charAt(0).toUpperCase() + plan.slice(1)} selected`);
}

function handleSub(e) {
    e.preventDefault();
    document.getElementById('subscription-form').classList.add('hidden');
    document.getElementById('sub-success').classList.remove('hidden');
    lucide.createIcons({ attrs: { strokeWidth: 1.5 } });
    showToast('Welcome to RAKI ☕');
}

document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function(e) {
        e.preventDefault();
        const t = document.querySelector(this.getAttribute('href'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('section').forEach(s => {
    s.style.opacity = '0';
    s.style.transform = 'translateY(24px)';
    s.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    obs.observe(s);
});
document.getElementById('hero').style.opacity = '1';
document.getElementById('hero').style.transform = 'translateY(0)';

// Analytics: track time on page
(function() {
    var visitorId = typeof window.visitorId !== 'undefined' ? window.visitorId : null;
    if (!visitorId) {
        var meta = document.querySelector('meta[name="visitor-id"]');
        if (meta) visitorId = meta.content;
    }
    if (!visitorId) return;

    var startTime = Date.now();

    function sendHeartbeat() {
        var duration = Math.round((Date.now() - startTime) / 1000);
        if (duration < 2) return;
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/analytics/heartbeat', JSON.stringify({
                    visitorId: parseInt(visitorId),
                    duration: duration
                }));
            } else {
                fetch('/api/analytics/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ visitorId: parseInt(visitorId), duration: duration }),
                    keepalive: true
                });
            }
        } catch (e) {}
    }

    window.addEventListener('beforeunload', sendHeartbeat);
    window.addEventListener('pagehide', sendHeartbeat);
    setInterval(function() {
        if (document.visibilityState === 'visible') sendHeartbeat();
    }, 30000);
})();
