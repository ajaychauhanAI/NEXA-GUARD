/**
 * NEXA-GUARD Universal Theme Engine (Dark & Light Mode)
 * Manages institutional high-contrast dark theme and crisp executive light theme.
 */

const ThemeEngine = {
    init() {
        const saved = localStorage.getItem('nexaguard_theme') || 'dark';
        this.applyTheme(saved);
        this.bindToggles();
    },

    toggle() {
        const current = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
    },

    applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.classList.add('light-theme');
            document.documentElement.classList.remove('dark-theme');
        } else {
            document.documentElement.classList.remove('light-theme');
            document.documentElement.classList.add('dark-theme');
        }
        localStorage.setItem('nexaguard_theme', theme);
        this.updateElements(theme);
    },

    updateElements(theme) {
        const isLight = theme === 'light';
        document.querySelectorAll('.theme-toggle-icon').forEach(el => {
            el.textContent = isLight ? '🌙' : '☀️';
        });
        document.querySelectorAll('.theme-toggle-label').forEach(el => {
            el.textContent = isLight ? 'Dark' : 'Light';
        });
    },

    bindToggles() {
        document.querySelectorAll('#theme-toggle-btn, .theme-toggle-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                this.toggle();
            };
        });
        this.updateElements(localStorage.getItem('nexaguard_theme') || 'dark');
    }
};

// Immediate execution to prevent flash of wrong theme before DOM renders
(function() {
    const saved = localStorage.getItem('nexaguard_theme') || 'dark';
    if (saved === 'light') {
        document.documentElement.classList.add('light-theme');
    } else {
        document.documentElement.classList.add('dark-theme');
    }
})();

document.addEventListener('DOMContentLoaded', () => ThemeEngine.init());
