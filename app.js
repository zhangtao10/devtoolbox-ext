import { initJson } from './tools/json-tool.js';
import { initDiff } from './tools/diff-tool.js';
import { initColor } from './tools/color-tool.js';
import { initTime } from './tools/time-tool.js';
import { initCodec } from './tools/codec-tool.js';
import { initRegex } from './tools/regex-tool.js';

const TOOLS = { json: initJson, diff: initDiff, color: initColor, time: initTime, codec: initCodec, regex: initRegex };
const inited = new Set();

function route() {
  const name = TOOLS[location.hash.slice(1)] ? location.hash.slice(1) : 'json';
  document.querySelectorAll('.tool').forEach((s) => s.classList.toggle('on', s.id === `tool-${name}`));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.hash === `#${name}`));
  const section = document.getElementById(`tool-${name}`);
  if (!inited.has(name)) {
    inited.add(name);
    TOOLS[name](section);
  }
  document.title = `${section.querySelector('h1').textContent} · DevToolbox`;
}

addEventListener('hashchange', route);
route();
