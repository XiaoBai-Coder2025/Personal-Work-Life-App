export function themeAttrs({ appearance = 'auto', theme = 'weather', weather = 'sunny' } = {}) {
  const scheme = appearance === 'auto' ? 'light dark' : appearance;
  const attrs = { scheme, theme };
  if (theme === 'weather') attrs.weather = weather;
  return attrs;
}

export function applyTheme(root, settings = {}) {
  const attrs = themeAttrs(settings);
  root.style.colorScheme = attrs.scheme;
  root.dataset.theme = attrs.theme;
  if (attrs.weather) root.dataset.weather = attrs.weather;
  else delete root.dataset.weather;
}
