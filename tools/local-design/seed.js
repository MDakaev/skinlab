// Served only by the loopback preview server. Never included in web/ or deployment.
try {
  if (!localStorage.getItem('skinlab.profile.v1')) {
    localStorage.setItem('skinlab.profile.v1', JSON.stringify({
      skin: 'combo', concerns: ['pigmentation', 'dehydration'],
      shelf: ['retinol', 'vitc', 'niacinamide', 'ha', 'moisturizer', 'spf'],
      pregnant: false, experience: 'start', onboarded: true, quizDone: false,
      dismissedTips: {}, theme: 'light',
    }));
  }
} catch { /* The app handles missing browser storage. */ }
