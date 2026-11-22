import fs from 'node:fs';

export const reviewInsightsSource = ['52_ReviewInsights.gs', '57_ReviewAudience.gs']
  .map(file => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')).join('\n');


export function reviewSource(file) {
  const name = file.endsWith('.gs') ? file : file + '.gs';
  return name === '52_ReviewInsights.gs' ? reviewInsightsSource
    : fs.readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
}
