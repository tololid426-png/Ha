// Motion Studio BRE - Content Script injected into RunningHub pages
console.log('[Motion Studio BRE] Content script aktif pada halaman RunningHub.');

// Optional helper to enhance RunningHub UI with quick BRE status badge
function injectBreBadge() {
  if (document.getElementById('rh-bre-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'rh-bre-badge';
  badge.style.position = 'fixed';
  badge.style.bottom = '20px';
  badge.style.right = '20px';
  badge.style.zIndex = '99999';
  badge.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
  badge.style.color = '#fff';
  badge.style.padding = '8px 14px';
  badge.style.borderRadius = '20px';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = 'bold';
  badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  badge.style.cursor = 'pointer';
  badge.innerHTML = '⚡ Motion Studio BRE Active';
  
  badge.addEventListener('click', () => {
    alert('Motion Studio BRE Extension terhubung dengan RunningHub AI. Klik ikon puzzle di toolbar browser Anda untuk menggunakan.');
  });

  document.body.appendChild(badge);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectBreBadge();
} else {
  window.addEventListener('DOMContentLoaded', injectBreBadge);
}
