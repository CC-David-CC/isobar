// The forecast time control: now, or any hour out to 16 days. Hourly at first, then 3-hourly,
// which is how NOAA's files are spaced.
import { formatForecastTime } from './format.js';

const HOUR = 3_600_000;
const MAX_HOURS = 384;
const SETTLE_MS = 250;

export const timelineSteps = () => {
  const steps = [];
  for (let hours = 0; hours <= 120; hours += 1) steps.push(hours);
  for (let hours = 123; hours <= MAX_HOURS; hours += 3) steps.push(hours);
  return steps;
};

export function describeOffset(hours) {
  if (hours === 0) return 'Now';
  if (hours < 48) return `In ${hours} hour${hours === 1 ? '' : 's'}`;
  return `In ${Math.round(hours / 24)} days`;
}

export class Timeline {
  constructor(root, { onChange, surface = root }) {
    Object.assign(this, { root, onChange, surface });
    this.steps = timelineSteps();
    this.index = 0;
    this.range = root.querySelector('input');
    this.label = root.querySelector('output');
    this.nowButton = root.querySelector('[data-action=now]');
    this.range.max = String(this.steps.length - 1);
    this.range.addEventListener('input', () => {
      this.setIndex(Number(this.range.value));
    });
    this.nowButton.addEventListener('click', () => {
      this.range.value = '0';
      this.setIndex(0);
    });
    this.render();
  }

  // What time layers should show, in ms. At "now" this moves on with the clock.
  time() {
    return Math.round(Date.now() / HOUR) * HOUR + this.steps[this.index] * HOUR;
  }

  setVisible(visible) {
    this.root.hidden = !visible;
    this.surface.classList.toggle('has-timeline', visible);
  }

  setIndex(index) {
    this.index = index;
    this.render();
    clearTimeout(this.settle);
    this.settle = setTimeout(() => this.onChange(), SETTLE_MS);
  }

  dispose() {
    clearTimeout(this.settle);
  }

  render() {
    const hours = this.steps[this.index];
    const when = hours === 0 ? '' : `, ${formatForecastTime(this.time(), Date.now())}`;
    this.label.textContent = `${describeOffset(hours)}${when}`;
    this.nowButton.hidden = hours === 0;
  }
}
